"""Isolated local stack for Playwright; never touches the user's demo database."""

import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix="astra-e2e-") as directory:
        env = dict(
            os.environ,
            ASTRA_DATABASE_URL=f"sqlite:///{directory}/e2e.db",
            ASTRA_DEMO_TOKEN="e2e-demo-only-token",
            ASTRA_MODE="DEMO",
            ASTRA_STALE_SECONDS="2",
            ASTRA_DISCONNECT_SECONDS="4",
        )
        process = subprocess.Popen(
            [
                sys.executable,
                str(ROOT / "scripts/dev.py"),
                "--api-port",
                "18000",
                "--ui-port",
                "15173",
            ],
            env=env,
            start_new_session=True,
        )

        def shutdown(_signum, _frame):
            process.terminate()

        signal.signal(signal.SIGTERM, shutdown)
        signal.signal(signal.SIGINT, shutdown)
        try:
            return process.wait()
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)


if __name__ == "__main__":
    raise SystemExit(main())
