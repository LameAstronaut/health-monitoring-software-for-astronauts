import json
from datetime import UTC, datetime

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from test_api import TOKEN, packet

from app.config import Settings
from app.main import create_app


def test_model_checkpoint_survives_worker_and_api_restart(client, app_factory):
    control = client.get("/api/v1/demo/control").json()
    state = {
        "seed": 42,
        "crew_index": 0,
        "ticks": 125,
        "heart_rate": 68.0,
        "respiratory_rate": 13.0,
        "spo2": 98.2,
        "suit_pressure": 30.0,
        "ecg_phase": 0.12,
        "activity": "REST",
    }
    payload = packet(
        scenario="REST",
        run_id=control["run_id"],
        revision=control["revision"],
        simulated_at=1,
        model_state=state,
    )
    assert client.post("/api/v1/telemetry", json=payload, headers=TOKEN).status_code == 200
    runtime = client.get("/api/v1/demo/runtime", headers=TOKEN).json()
    assert runtime["checkpoints"]["DEMO-CREW-001"] == state
    assert runtime["next_sequences"]["DEMO-SUIT-001"] == 2
    with TestClient(app_factory()) as restarted:
        resumed = restarted.get("/api/v1/demo/runtime", headers=TOKEN).json()
        assert resumed["checkpoints"]["DEMO-CREW-001"] == state
        assert resumed["control"]["running"] is False
        assert restarted.get("/api/v1/observations").json()[0]["freshness"] == "HISTORICAL"


def test_upgrading_original_schema_preserves_existing_observations_and_alerts(
    tmp_path, monkeypatch
):
    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    monkeypatch.setenv("ASTRA_DATABASE_URL", url)
    config = Config("alembic.ini")
    command.upgrade(config, "0001")
    engine = create_engine(url)
    data = packet()
    with engine.begin() as db:
        db.execute(
            text("INSERT INTO packets VALUES (:event, :device, 1, :observed, :received, :raw, 0)"),
            {
                "event": data["event_id"],
                "device": data["device_id"],
                "observed": datetime.now(UTC),
                "received": datetime.now(UTC),
                "raw": json.dumps(data),
            },
        )
        db.execute(
            text("INSERT INTO observations (id,event_id,data) VALUES (1,:event,:data)"),
            {"event": data["event_id"], "data": json.dumps(data["measurements"][0])},
        )
        db.execute(
            text(
                "INSERT INTO alerts (id,event_id,priority,rule_id,message,observation_id) "
                "VALUES (1,:event,2,'legacy-fixture','Legacy synthetic alert',1)"
            ),
            {"event": data["event_id"]},
        )
    engine.dispose()
    command.upgrade(config, "head")
    with TestClient(create_app(Settings(database_url=url))) as client:
        assert client.get("/api/v1/observations").json()[0]["event_id"] == data["event_id"]
        alert = client.get("/api/v1/alerts").json()[0]
        assert alert["state"] == "PENDING_REVIEW"
        assert alert["evidence"][0]["value"] == 72
