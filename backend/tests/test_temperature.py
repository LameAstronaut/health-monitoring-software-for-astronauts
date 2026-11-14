import pytest
from test_api import TOKEN, packet


@pytest.mark.parametrize("crew", [1, 2, 3])
def test_temperature_acquire_review_save_and_history(client, crew):
    crew_id = f"DEMO-CREW-00{crew}"
    live = packet(astronaut_id=crew_id, device_id=f"DEMO-SUIT-00{crew}")
    assert client.post("/api/v1/telemetry", json=live, headers=TOKEN).status_code == 200
    request = {"astronaut_id": crew_id, "kind": "BODY_TEMPERATURE", "device_id": "DEMO-TEMP-001"}
    created = client.post("/api/v1/examinations", json=request)
    assert created.status_code == 200
    exam = created.json()
    assert exam["status"] == "ACQUIRING"
    value = (365 + crew) / 10
    measurement = {"code": "body_temperature", "value": value, "unit": "°C", "quality": "VALID"}
    result = packet(
        0,
        scenario="EXAMINATION",
        event_id="temperature-result",
        astronaut_id=crew_id,
        device_id=request["device_id"],
        examination_id=exam["id"],
        measurements=[measurement],
    )
    accepted = client.post("/api/v1/telemetry", json=result, headers=TOKEN)
    assert accepted.status_code == 200
    assert accepted.json()["alerts"] == []
    reviewed = client.get("/api/v1/examinations").json()[0]
    assert reviewed["status"] == "REVIEW"
    assert reviewed["results"] == [measurement]
    saved = client.post(f"/api/v1/examinations/{exam['id']}/actions", json={"action": "SAVE"})
    assert saved.status_code == 200
    assert saved.json()["status"] == "SAVED"
    observation = next(
        row
        for row in client.get(f"/api/v1/observations?astronaut_id={crew_id}").json()
        if row["code"] == "body_temperature"
    )
    assert observation["examination_id"] == exam["id"]
    assert observation["device_id"] == "DEMO-TEMP-001"
    assert observation["value"] == value
    assert all(
        row["code"] != "body_temperature"
        for row in client.get("/api/v1/crew/summaries").json()[crew - 1]["readings"]
    )
    devices = client.get("/api/v1/devices").json()
    assert next(row for row in devices if row["id"] == "DEMO-TEMP-001")["capabilities"] == [
        "body_temperature"
    ]


def test_temperature_requires_live_worker_supported_instrument_and_valid_celsius(client):
    request = {
        "astronaut_id": "DEMO-CREW-001",
        "kind": "BODY_TEMPERATURE",
        "device_id": "DEMO-TEMP-001",
    }
    assert client.post("/api/v1/examinations", json=request).status_code == 409
    assert client.post("/api/v1/telemetry", json=packet(), headers=TOKEN).status_code == 200
    assert (
        client.post("/api/v1/examinations", json=request | {"device_id": "DEMO-BP-001"}).status_code
        == 422
    )
    measurement = {"code": "body_temperature", "value": 36.6, "unit": "°C", "quality": "VALID"}
    assert (
        client.post(
            "/api/v1/telemetry", json=packet(2, measurements=[measurement]), headers=TOKEN
        ).status_code
        == 422
    )
    exam = client.post("/api/v1/examinations", json=request).json()
    payload = packet(
        0,
        scenario="EXAMINATION",
        event_id="temperature-result",
        device_id="DEMO-TEMP-001",
        examination_id=exam["id"],
        measurements=[measurement],
    )
    for override in [{"unit": "F"}, {"value": -1}, {"value": 101}, {"quality": "INVALID"}]:
        invalid = payload | {"measurements": [measurement | override]}
        assert client.post("/api/v1/telemetry", json=invalid, headers=TOKEN).status_code == 422
    assert client.get("/api/v1/examinations").json()[0]["status"] == "ACQUIRING"
