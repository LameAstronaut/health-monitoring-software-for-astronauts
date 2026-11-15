"""Create a consistent SQLite snapshot without stopping the running demo."""

import argparse
import os
import sqlite3
import sys
import tempfile
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from sqlalchemy.engine import make_url

from app.config import Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("/data/backups"))
    args = parser.parse_args()
    database = make_url(Settings().database_url).database
    if not database or database == ":memory:":
        parser.error("Backup requires a file-backed database")
    source = Path(database).resolve()
    args.directory.mkdir(parents=True, exist_ok=True)
    destination = args.directory / f"astra-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.db"
    fd, temporary = tempfile.mkstemp(dir=args.directory, suffix=".tmp")
    os.close(fd)
    try:
        with (
            closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as live,
            closing(sqlite3.connect(temporary)) as backup,
        ):
            live.backup(backup)
            if backup.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed")
        os.replace(temporary, destination)
        print(destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == "__main__":
    main()
