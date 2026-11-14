"""Integration smoke: real Rust process, HTTP, WebSocket, SQLite and API restart."""

import argparse
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--frontend", action="store_true", help="Also verify the Vite REST/WS proxy"
    )
    args = parser.parse_args()
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
        frontend = None

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

        def simulate(scenario, count, speed=4):
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
                    "--speed",
                    str(speed),
                ],
                env=env,
                check=True,
                timeout=30,
                stdout=subprocess.DEVNULL,
            )

        try:
            server = start()
            stream_port = port
            if args.frontend:
                with socket.socket() as sock:
                    sock.bind(("127.0.0.1", 0))
                    stream_port = sock.getsockname()[1]
                frontend = subprocess.Popen(
                    ["npm", "run", "dev", "--", "--port", str(stream_port)],
                    cwd=ROOT / "frontend",
                    env=env | {"ASTRA_API_PROXY_TARGET": url},
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                ui_url = f"http://127.0.0.1:{stream_port}"
                for _ in range(100):
                    if frontend.poll() is not None:
                        raise RuntimeError("Frontend exited during startup")
                    try:
                        if httpx.get(ui_url, timeout=0.5).status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.1)
                else:
                    raise RuntimeError("Frontend did not become ready")
                assert '<div id="root"></div>' in httpx.get(ui_url).text
                assert httpx.get(f"{ui_url}/api/v1/health").json()["mode"] == "DEMO"
            with connect(f"ws://127.0.0.1:{stream_port}/api/v1/stream") as ws:
                assert json.loads(ws.recv(timeout=5))["type"] == "system.status"
                simulate("normal", 5, speed=1)
                for _ in range(10):
                    event = json.loads(ws.recv(timeout=5))
                    if event["type"] == "telemetry.observation":
                        break
                else:
                    raise AssertionError("No telemetry frame received")
            history_url = f"{url}/api/v1/observations?limit=2400"
            observations = httpx.get(history_url).json()
            assert len(observations) == 20
            resting_hr = [o["value"] for o in observations if o["code"] == "heart_rate"]
            assert max(resting_hr) - min(resting_hr) < 0.5
            simulate("simultaneous_demo", 190)
            assert len(httpx.get(history_url).json()) == 780
            alerts = httpx.get(f"{url}/api/v1/alerts").json()
            assert [alert["priority"] for alert in alerts] == [1, 2]
            assert all(alert["evidence"][0]["event_id"] == alert["event_id"] for alert in alerts)
            simulate("invalid_packet", 6)
            assert len(httpx.get(history_url).json()) == 800
            simulate("sensor_disconnect", 6)
            time.sleep(2.2)
            assert httpx.get(f"{url}/api/v1/devices").json()[0]["status"] == "DISCONNECTED"
            server.terminate()
            server.wait(timeout=5)
            server = start()
            history = httpx.get(history_url).json()
            assert len(history) == 820
            assert all(item["freshness"] == "HISTORICAL" for item in history)
            assert len(httpx.get(f"{url}/api/v1/alerts").json()) == 2
            print(
                "PASS: Rust → HTTP → SQLite → WebSocket; "
                "fixtures, invalid input, disconnect, restart"
            )
            if args.frontend:
                print("PASS: Vite application entry point, proxied health endpoint and WebSocket")
        finally:
            if frontend is not None:
                from dev import stop_processes

                stop_processes([frontend])
            if server is not None and server.poll() is None:
                server.terminate()
                server.wait(timeout=5)


if __name__ == "__main__":
    main()
