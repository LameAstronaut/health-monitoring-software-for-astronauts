"""Write private Compose settings using only the Ubuntu/Debian system Python."""

import argparse
import ipaddress
import os
import re
import secrets
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True, help="Public URL, e.g. https://demo.example.com")
    parser.add_argument("--output", type=Path, default=ROOT / "deploy/server.env")
    args = parser.parse_args()
    origin = args.origin.rstrip("/")
    try:
        url = urlsplit(origin)
        port = url.port
    except ValueError:
        parser.error("Invalid origin or port")
    if (
        url.scheme not in ("http", "https")
        or not url.hostname
        or url.username
        or url.password
        or url.path
        or url.query
        or url.fragment
        or any(char.isspace() for char in origin)
        or "$" in origin
        or "#" in origin
    ):
        parser.error("Use an exact HTTP(S) origin without credentials, path, or query")
    try:
        ipaddress.ip_address(url.hostname)
    except ValueError:
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", url.hostname):
            parser.error("Use an ASCII hostname or IP address")
    if url.scheme == "https" and port not in (None, 443):
        parser.error("HTTPS hosting uses the standard port 443")
    if port == 0:
        parser.error("Use a port between 1 and 65535")
    hostname = f"[{url.hostname}]" if ":" in url.hostname else url.hostname
    default_port = 443 if url.scheme == "https" else 80
    authority = hostname + (f":{port}" if port not in (None, default_port) else "")
    origin = f"{url.scheme}://{authority}"
    token = secrets.token_urlsafe(48)
    if args.output.exists():
        existing = dict(
            line.split("=", 1)
            for line in args.output.read_text().splitlines()
            if line and not line.startswith("#") and "=" in line
        )
        token = existing.get("ASTRA_DEMO_TOKEN") or token
    if len(token) < 32 or any(
        char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
        for char in token
    ):
        parser.error("Existing worker token is invalid; retain a generated URL-safe token")
    values = {
        "ASTRA_ALLOWED_ORIGIN": origin,
        "ASTRA_TRUSTED_ORIGINS": "http://localhost:8080,http://127.0.0.1:8080",
        "ASTRA_SITE_ADDRESS": authority if url.scheme == "https" else ":80",
        "ASTRA_HTTP_PORT": str(port or 80) if url.scheme == "http" else "80",
        "ASTRA_HTTPS_PORT": "443",
        "ASTRA_DEMO_TOKEN": token,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=args.output.parent, prefix=".server-env-")
    try:
        with os.fdopen(fd, "w") as file:
            os.fchmod(file.fileno(), 0o600)
            file.write("# Private server configuration. Never commit this file.\n")
            file.write("".join(f"{key}={value}\n" for key, value in values.items()))
        os.replace(temporary, args.output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f"Configured {origin}; worker secret saved privately in {args.output}")


if __name__ == "__main__":
    main()
