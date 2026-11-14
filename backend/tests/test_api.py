import json
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.schemas import TelemetryPacket

TOKEN = {"X-Demo-Token": "test-demo-token"}


def packet(sequence=1, scenario="normal", **updates):
    result = {
        "schema_version": "1.0",
        "event_id": f"event-{sequence}",
        "sequence": sequence,
        "observed_at": datetime.now(UTC).isoformat(),
        "astronaut_id": "DEMO-CREW-001",
        "device_id": "DEMO-SUIT-001",
        "source_type": "SIMULATED",
        "scenario_id": scenario,
        "measurements": [
            {"code": "heart_rate", "value": 72, "unit": "beats/min", "quality": "VALID"},
            {
                "code": "spo2",
                "value": 88 if scenario != "normal" else 98,
                "unit": "%",
                "quality": "VALID",
            },
            {
                "code": "suit_pressure",
                "value": 20 if scenario == "simultaneous_demo" else 30,
                "unit": "kPa",
                "quality": "VALID",
            },
        ],
    }
    return result | updates


def test_health_and_safe_initial_state(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    health = response.json()
    assert health["status"] == "ok"
    assert health["mode"] == "DEMO"
    assert health["version"] == "0.1.0"
    assert datetime.fromisoformat(health["server_time"]).utcoffset() == timedelta(0)
    assert health["disconnect_seconds"] > health["stale_seconds"] > 0
    assert client.get("/api/v1/devices").json()[0]["status"] == "NOT_AVAILABLE"
    assert client.get("/api/v1/observations").json() == []


def test_versioned_telemetry_contract_matches_backend():
    contracts = Path(__file__).resolve().parents[2] / "contracts"
    example = TelemetryPacket.model_validate_json(
        (contracts / "telemetry.example.json").read_text()
    )
    assert example.source_type == "SIMULATED"
    assert json.loads((contracts / "telemetry.schema.json").read_text()) == (
        TelemetryPacket.model_json_schema()
    )


def test_normal_duplicate_and_conflict(client):
    data = packet()
    result = client.post("/api/v1/telemetry", json=data, headers=TOKEN)
    assert result.status_code == 200
    assert len(result.json()["observations"]) == 3
    assert result.json()["observations"][0]["freshness"] == "LIVE"
    assert client.post("/api/v1/telemetry", json=data, headers=TOKEN).json()["duplicate"]
    assert len(client.get("/api/v1/observations").json()) == 3
    data["measurements"][0]["value"] = 74
    assert client.post("/api/v1/telemetry", json=data, headers=TOKEN).status_code == 409


@pytest.mark.parametrize(
    "field,value",
    [
        ("source_type", "REAL_DEVICE"),
        ("astronaut_id", "REAL-001"),
        ("device_id", "UNKNOWN"),
        ("schema_version", "2.0"),
        ("sequence", -1),
        ("sequence", 9_223_372_036_854_775_808),
        ("observed_at", "2026-01-01T00:00:00"),
        ("measurements", []),
    ],
)
def test_schema_rejections(client, field, value):
    assert (
        client.post("/api/v1/telemetry", json=packet(**{field: value}), headers=TOKEN).status_code
        == 422
    )
    assert client.get("/api/v1/observations").json() == []


def test_units_non_numeric_and_duplicate_codes(client):
    for key, value in [("unit", "mmHg"), ("value", "NaN"), ("value", True), ("value", -1)]:
        data = packet()
        data["measurements"][0][key] = value
        assert client.post("/api/v1/telemetry", json=data, headers=TOKEN).status_code == 422
    data = packet()
    data["measurements"] = [data["measurements"][0], data["measurements"][0]]
    assert client.post("/api/v1/telemetry", json=data, headers=TOKEN).status_code == 422


def test_nonfinite_numbers_are_rejected_without_server_error(client):
    import json

    for value in [float("nan"), float("inf"), float("-inf")]:
        data = packet()
        data["measurements"][0]["value"] = value
        response = client.post(
            "/api/v1/telemetry",
            content=json.dumps(data),
            headers=TOKEN | {"Content-Type": "application/json"},
        )
        assert response.status_code == 422
    assert client.get("/api/v1/observations").json() == []


def test_auth_time_and_ordering(client):
    assert client.post("/api/v1/telemetry", json=packet()).status_code == 401
    future = (datetime.now(UTC) + timedelta(seconds=30)).isoformat()
    assert (
        client.post("/api/v1/telemetry", json=packet(observed_at=future), headers=TOKEN).status_code
        == 422
    )
    assert client.post("/api/v1/telemetry", json=packet(4), headers=TOKEN).status_code == 200
    assert client.post("/api/v1/telemetry", json=packet(3), headers=TOKEN).status_code == 409
    result = client.post("/api/v1/telemetry", json=packet(6), headers=TOKEN).json()
    assert result["sequence_gap"]
    older = (datetime.now(UTC) - timedelta(seconds=10)).isoformat()
    assert (
        client.post(
            "/api/v1/telemetry", json=packet(7, observed_at=older), headers=TOKEN
        ).status_code
        == 409
    )


def test_alert_evidence_and_priority(client):
    result = client.post(
        "/api/v1/telemetry", json=packet(scenario="simultaneous_demo"), headers=TOKEN
    ).json()
    assert [alert["priority"] for alert in result["alerts"]] == [1, 2]
    alerts = client.get("/api/v1/alerts").json()
    assert alerts[0]["evidence"][0]["value"] == 20
    assert alerts[1]["evidence"][0]["code"] == "spo2"
    assert all(alert["event_id"] == result["event_id"] for alert in alerts)


def test_invalid_quality_and_stale_do_not_trigger_alert(client):
    data = packet(scenario="simultaneous_demo")
    for measurement in data["measurements"]:
        measurement["quality"] = "INVALID"
    assert client.post("/api/v1/telemetry", json=data, headers=TOKEN).json()["alerts"] == []


def test_stale_disconnected_and_restart(app_factory):
    now = datetime.now(UTC)
    with TestClient(app_factory()) as client:
        data = packet(observed_at=(now - timedelta(seconds=8)).isoformat())
        assert client.post("/api/v1/telemetry", json=data, headers=TOKEN).status_code == 200
        assert client.get("/api/v1/devices").json()[0]["status"] == "STALE"
    with TestClient(app_factory()) as restarted:
        assert restarted.get("/api/v1/observations").json()[0]["freshness"] == "HISTORICAL"
        assert restarted.get("/api/v1/devices").json()[0]["status"] == "HISTORICAL"
    with TestClient(app_factory()) as client:
        old = (now - timedelta(seconds=20)).isoformat()
        # Another device history uses a later observed time; use a fresh database test below.
        assert (
            client.post(
                "/api/v1/telemetry", json=packet(2, observed_at=old), headers=TOKEN
            ).status_code
            == 409
        )


def test_disconnected_input(client):
    old = (datetime.now(UTC) - timedelta(seconds=20)).isoformat()
    result = client.post(
        "/api/v1/telemetry",
        json=packet(scenario="simultaneous_demo", observed_at=old),
        headers=TOKEN,
    ).json()
    assert result["alerts"] == []
    assert client.get("/api/v1/devices").json()[0]["status"] == "DISCONNECTED"


def test_source_timezone_is_normalized_before_storage(client):
    source = datetime.now(UTC).astimezone(timezone(timedelta(hours=3)))
    result = client.post(
        "/api/v1/telemetry", json=packet(observed_at=source.isoformat()), headers=TOKEN
    )
    assert result.status_code == 200
    stored = client.get("/api/v1/observations").json()[0]
    assert datetime.fromisoformat(stored["observed_at"]) == source
    assert stored["observed_at"].endswith("Z")
    assert stored["freshness"] == "LIVE"
    assert client.post("/api/v1/telemetry", json=packet(2), headers=TOKEN).status_code == 200


def test_websocket_publishes_persisted_data(client):
    with client.websocket_connect("/api/v1/stream") as ws:
        assert ws.receive_json()["type"] == "system.status"
        assert ws.receive_json()["data"]["status"] == "NOT_AVAILABLE"
        client.post("/api/v1/telemetry", json=packet(), headers=TOKEN)
        event = ws.receive_json()
        while event["type"] != "telemetry.observation":
            event = ws.receive_json()
        assert event["type"] == "telemetry.observation"
        assert event["data"]["event_id"] == client.get("/api/v1/observations").json()[0]["event_id"]


def test_websocket_rejects_untrusted_origin(client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/v1/stream", headers={"origin": "https://evil.example"}):
            pass
