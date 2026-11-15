import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = "https://demo.example.com"
TOKEN = "server-worker-token-with-at-least-32-characters"


def test_public_demo_accepts_existing_controls_and_retains_browser_origin_checks(
    app_factory, tmp_path
):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        deployment_profile="public_demo",
        demo_token=TOKEN,
        allowed_origin=ORIGIN,
    )
    with TestClient(create_app(settings), client=("192.0.2.1", 50000)) as client:
        state = client.get("/api/v1/demo/control").json()
        action = {"action": "PAUSE", "expected_revision": state["revision"]}
        assert (
            client.post(
                "/api/v1/demo/control", json=action, headers={"Origin": "https://other.example"}
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/v1/demo/control",
                json=action,
                headers={"Origin": ORIGIN, "Sec-Fetch-Site": "cross-site"},
            ).status_code
            == 403
        )
        assert (
            client.post("/api/v1/demo/control", json=action, headers={"Origin": ORIGIN}).status_code
            == 200
        )
        assert client.get("/api/v1/demo/runtime").status_code == 401
        assert (
            client.get("/api/v1/demo/runtime", headers={"X-Demo-Token": TOKEN}).status_code == 200
        )


def test_hosted_restarts_preserve_the_users_running_and_paused_choice(app_factory, tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        deployment_profile="public_demo",
        demo_token=TOKEN,
        allowed_origin=ORIGIN,
    )
    for desired in (False, True):
        with TestClient(create_app(settings)) as client:
            state = client.get("/api/v1/demo/control").json()
            response = client.post(
                "/api/v1/demo/control",
                json={
                    "action": "RESUME" if desired else "PAUSE",
                    "expected_revision": state["revision"],
                },
            )
            assert response.status_code == 200
            previous = response.json()
        with TestClient(create_app(settings)) as restarted:
            state = restarted.get("/api/v1/demo/control").json()
            assert state["running"] is desired
            assert state["run_id"] == previous["run_id"]
            assert state["revision"] > previous["revision"]


def test_public_profile_requires_a_worker_secret_and_exact_origin():
    with pytest.raises(ValidationError, match="worker token"):
        Settings(
            deployment_profile="public_demo", demo_token="local-demo-only", allowed_origin=ORIGIN
        )
    with pytest.raises(ValidationError, match="allowed_origin"):
        Settings(
            deployment_profile="public_demo", demo_token=TOKEN, allowed_origin=ORIGIN + "/path"
        )


def test_configuration_is_private_and_updates_preserve_the_worker_secret(tmp_path):
    output = tmp_path / "server.env"
    command = [sys.executable, str(ROOT / "scripts/configure_server.py"), "--output", str(output)]
    subprocess.run(
        [*command, "--origin", "https://DEMO.example.com:443/"], check=True, capture_output=True
    )
    first = dict(line.split("=", 1) for line in output.read_text().splitlines() if "=" in line)
    assert len(first["ASTRA_DEMO_TOKEN"]) >= 32
    assert first["ASTRA_ALLOWED_ORIGIN"] == ORIGIN
    assert first["ASTRA_SITE_ADDRESS"] == "demo.example.com"
    assert output.stat().st_mode & 0o777 == 0o600
    subprocess.run([*command, "--origin", "http://127.0.0.1:9080"], check=True, capture_output=True)
    updated = dict(line.split("=", 1) for line in output.read_text().splitlines() if "=" in line)
    assert updated["ASTRA_DEMO_TOKEN"] == first["ASTRA_DEMO_TOKEN"]
    assert updated["ASTRA_HTTP_PORT"] == "9080"
    assert updated["ASTRA_SITE_ADDRESS"] == ":80"
    assert not list(tmp_path.glob(".server-env-*"))
    rejected = subprocess.run([*command, "--origin", "https://bad{host}"], capture_output=True)
    assert rejected.returncode != 0
    assert output.read_text().find(updated["ASTRA_DEMO_TOKEN"]) >= 0


def test_backup_retains_records_in_an_independently_readable_snapshot(client, tmp_path):
    source = client.get("/api/v1/demo/control").json()
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/backup_database.py"),
            "--directory",
            str(tmp_path / "backups"),
        ],
        env=dict(os.environ),
        text=True,
        capture_output=True,
        check=True,
    )
    snapshot = Path(result.stdout.strip())
    assert snapshot.is_file()
    assert snapshot.stat().st_mode & 0o777 == 0o600
    with sqlite3.connect(snapshot) as database:
        assert database.execute("PRAGMA quick_check").fetchone()[0] == "ok"

        record = json.loads(
            database.execute(
                "SELECT data FROM operation_records WHERE id='demo-control'"
            ).fetchone()[0]
        )
        assert record["run_id"] == source["run_id"]
