"""Launch the local DEMO stack and stop every owned process on exit (Linux/POSIX)."""

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
from importlib import import_module
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def wait_ready(url: str, process: subprocess.Popen, timeout: float = 20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Process exited before {url} became ready; see its output above")
        try:
            with urlopen(url, timeout=0.5) as response:
                if response.status == 200:
                    return
        except (URLError, TimeoutError):
            pass
        time.sleep(0.1)
    raise RuntimeError(f"Timed out waiting for {url}")


def stop_processes(processes: list[subprocess.Popen]):
    # npm also spawns Vite. Kill the owned process groups so it cannot linger on port 5173.
    for process in reversed(processes):
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    for process in reversed(processes):
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-simulator", action="store_true", help="Start with NO DATA")
    parser.add_argument("--check", action="store_true", help="Verify startup, then stop the stack")
    parser.add_argument("--api-port", type=int, default=8000)
    parser.add_argument("--ui-port", type=int, default=5173)
    args = parser.parse_args()
    if not all(1024 <= port <= 65535 for port in (args.api_port, args.ui_port)):
        parser.error("Development ports must be between 1024 and 65535")
    api_url = f"http://127.0.0.1:{args.api_port}"
    ui_url = f"http://127.0.0.1:{args.ui_port}"
    if not (ROOT / "frontend/node_modules").is_dir():
        parser.error("Frontend dependencies missing. Run make setup first.")
    binary = ROOT / "simulator/target/debug/astra-simulator"
    if not args.no_simulator and not binary.exists():
        parser.error("Simulator missing. Run make setup or make dev first.")

    sys.path.insert(0, str(ROOT / "backend"))
    settings = import_module("app.config").Settings()
    # Settings loads the root .env. Share the same token with Rust without printing it
    # or putting it in browser configuration / command-line arguments.
    env = dict(
        os.environ,
        ASTRA_DEMO_TOKEN=settings.demo_token,
        ASTRA_API_PROXY_TARGET=api_url,
        ASTRA_ALLOWED_ORIGIN=ui_url,
    )
    processes: list[subprocess.Popen] = []
    simulator: subprocess.Popen | None = None

    def launch(command: list[str], cwd: Path):
        process = subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True)
        processes.append(process)
        return process

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    try:
        # A readiness response from another process must never satisfy our startup check.
        for port in (args.api_port, args.ui_port):
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    probe.bind(("127.0.0.1", port))
                except OSError as exc:
                    raise RuntimeError(
                        f"Port {port} is already in use; stop that service or choose another port"
                    ) from exc
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=ROOT / "backend",
            env=env,
            check=True,
            timeout=30,
        )
        api = launch(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(args.api_port),
            ],
            ROOT / "backend",
        )
        wait_ready(f"{api_url}/api/v1/health", api)
        ui = launch(["npm", "run", "dev", "--", "--port", str(args.ui_port)], ROOT / "frontend")
        wait_ready(f"{ui_url}/api/v1/health", ui)
        if not args.no_simulator:
            simulator = launch([str(binary), "--controlled", "--api-url", api_url], ROOT)
        print(f"ASTRA HEALTH ready: {ui_url} — DEMO / SIMULATED", flush=True)
        if args.check:
            return 0
        while True:
            for process in (api, ui):
                if process.poll() is not None:
                    raise RuntimeError("A development process stopped; shutting down the stack")
            if simulator is not None and simulator.poll() is not None:
                print(
                    "Simulator stopped. API and UI remain available; telemetry will expire. "
                    "Restart Rust with --controlled to resume from its saved checkpoint.",
                    flush=True,
                )
                simulator = None
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("\nStopping ASTRA HEALTH…", flush=True)
        return 0
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f"Startup failed: {exc}", file=sys.stderr)
        return 1
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        stop_processes(processes)


if __name__ == "__main__":
    raise SystemExit(main())
