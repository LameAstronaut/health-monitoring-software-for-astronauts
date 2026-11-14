"""Integration smoke: real Rust process, HTTP, WebSocket, SQLite and API restart."""

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
from websockets.sync.client import connect

ROOT = Path(__file__).resolve().parents[1]


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    binary = ROOT / "simulator/target/debug/astra-simulator"
    if not binary.exists():
        raise RuntimeError(
            "Build the simulator first: cargo build --manifest-path simulator/Cargo.toml"
        )
    with tempfile.TemporaryDirectory(prefix="astra-smoke-") as directory:
        env = dict(
            os.environ,
            ASTRA_DATABASE_URL=f"sqlite:///{directory}/smoke.db",
            ASTRA_STALE_SECONDS="1",
            ASTRA_DISCONNECT_SECONDS="2",
            ASTRA_MODE="DEMO",
            ASTRA_DEMO_TOKEN="smoke-demo-token",
        )
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=ROOT / "backend",
            env=env,
            check=True,
            timeout=30,
        )
        server = None

        def start():
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ],
                cwd=ROOT / "backend",
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            for _ in range(100):
                try:
                    if httpx.get(f"{url}/api/v1/health", timeout=0.5).status_code == 200:
                        return process
                except httpx.HTTPError:
                    pass
                if process.poll() is not None:
                    raise RuntimeError("API exited during startup")
                time.sleep(0.1)
            process.terminate()
            process.wait(timeout=5)
            raise RuntimeError("API did not become ready")

        def simulate(scenario, count):
            subprocess.run(
                [
                    str(binary),
                    "--api-url",
                    url,
                    "--scenario",
                    scenario,
                    "--count",
                    str(count),
                    "--rate-hz",
                    "20",
                ],
                env=env,
                check=True,
                timeout=30,
                stdout=subprocess.DEVNULL,
            )

        try:
            server = start()
            with connect(f"ws://127.0.0.1:{port}/api/v1/stream") as ws:
                assert json.loads(ws.recv(timeout=5))["type"] == "system.status"
                simulate("simultaneous_demo", 8)
                for _ in range(10):
                    event = json.loads(ws.recv(timeout=5))
                    if event["type"] == "telemetry.observation":
                        break
                else:
                    raise AssertionError("No telemetry frame received")
            observations = httpx.get(f"{url}/api/v1/observations").json()
            assert len(observations) == 24
            alerts = httpx.get(f"{url}/api/v1/alerts").json()
            assert [alert["priority"] for alert in alerts] == [1, 2]
            assert all(alert["evidence"][0]["event_id"] == alert["event_id"] for alert in alerts)
            simulate("invalid_packet", 6)
            assert len(httpx.get(f"{url}/api/v1/observations").json()) == 39
            simulate("sensor_disconnect", 6)
            time.sleep(2.2)
            assert httpx.get(f"{url}/api/v1/devices").json()[0]["status"] == "DISCONNECTED"
            server.terminate()
            server.wait(timeout=5)
            server = start()
            history = httpx.get(f"{url}/api/v1/observations").json()
            assert len(history) == 54
            assert all(item["freshness"] == "HISTORICAL" for item in history)
            assert len(httpx.get(f"{url}/api/v1/alerts").json()) == 2
            print(
                "PASS: Rust → HTTP → SQLite → WebSocket; "
                "fixtures, invalid input, disconnect, restart"
            )
        finally:
            if server is not None and server.poll() is None:
                server.terminate()
                server.wait(timeout=5)


if __name__ == "__main__":
    main()
