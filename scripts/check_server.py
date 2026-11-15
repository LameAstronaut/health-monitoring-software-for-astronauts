"""Verify the production frontend, REST/WS proxy, private routes, and live worker."""

import argparse
import json
import re
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from websockets.exceptions import WebSocketException
from websockets.sync.client import connect

from app.config import Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", help="Defaults to ASTRA_ALLOWED_ORIGIN")
    parser.add_argument("--timeout", type=float, default=90)
    args = parser.parse_args()
    config = Settings()
    origin = (args.origin or config.allowed_origin).rstrip("/")

    def request(route, *, data=None, private=False):
        host = "http://127.0.0.1:8000" if private else origin
        headers = {"Origin": origin}
        if private:
            headers["X-Demo-Token"] = config.demo_token
        if data is not None:
            headers["Content-Type"] = "application/json"
        query = Request(
            host + route,
            headers=headers,
            data=json.dumps(data).encode() if data is not None else None,
        )
        with urlopen(query, timeout=8) as response:
            return response.read()

    deadline = time.monotonic() + args.timeout
    last_error = "No response"
    while time.monotonic() < deadline:
        try:
            html = request("/").decode()
            if "Memento Mori" not in html:
                raise RuntimeError("Frontend HTML missing")
            module = re.search(r'src="([^"\s]+\.js)"', html)
            if not module:
                raise RuntimeError("Frontend module missing")
            asset_url = urljoin(origin + "/", module[1])
            if not asset_url.startswith(origin + "/assets/"):
                raise RuntimeError("Frontend asset base is incorrect")
            if request(asset_url.removeprefix(origin)).lstrip().startswith(b"<!doctype"):
                raise RuntimeError("JavaScript asset returned HTML")
            radiation = json.loads(request("/api/v1/vehicle/radiation"))
            control = json.loads(request("/api/v1/demo/runtime", private=True))["control"]
            seen = control["worker_seen"]
            age = (
                (datetime.now(UTC) - datetime.fromisoformat(seen)).total_seconds()
                if seen
                else float("inf")
            )
            expected = "RUNNING" if control["running"] else "PAUSED"
            if (
                age > config.disconnect_seconds
                or control["worker_state"] != expected
                or control["worker_revision"] != control["revision"]
            ):
                raise RuntimeError("Worker heartbeat/revision is not ready")
            if control["running"] and not all(
                r["freshness"] == "LIVE" for r in radiation["readings"]
            ):
                raise RuntimeError("Radiation readings are not live")
            if len(radiation["readings"]) != 3:
                raise RuntimeError("Expected three vehicle radiation sensors")
            for route, data in [
                ("/api/v1/telemetry", {}),
                ("/api/v1/demo/runtime", None),
                ("/api/v1/demo/heartbeat", {}),
                ("/api/v1/vehicle/radiation", {}),
            ]:
                try:
                    request(route, data=data)
                except HTTPError as error:
                    if error.code != 404:
                        raise RuntimeError(f"Worker route exposed: {route}") from error
                else:
                    raise RuntimeError(f"Worker route exposed: {route}")
            websocket = (
                ("wss" if origin.startswith("https:") else "ws")
                + origin[origin.index(":") :]
                + "/api/v1/stream"
            )
            with connect(websocket, origin=origin, open_timeout=8, close_timeout=3) as stream:
                event = json.loads(stream.recv(timeout=8))
                if event["type"] != "system.status":
                    raise RuntimeError("WebSocket status event missing")
            print(
                "Server verified: frontend, assets, REST, WebSocket, "
                f"private routes, worker {expected}"
            )
            return
        except (
            OSError,
            ValueError,
            RuntimeError,
            TimeoutError,
            WebSocketException,
        ) as error:
            last_error = str(error)
            time.sleep(1)
    raise SystemExit(f"Server check failed: {last_error}")


if __name__ == "__main__":
    main()
