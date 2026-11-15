from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from test_api import TOKEN
from test_operations import control

URL = "/api/v1/vehicle/radiation"


def packet(client, elapsed=60, **updates):
    state = client.get("/api/v1/demo/control").json()
    return {
        "run_id": state["run_id"],
        "revision": state["revision"],
        "simulated_at": elapsed,
        "observed_at": datetime.now(UTC).isoformat(),
        "measurements": [
            {
                "sensor_id": f"VEH-RAD-00{i}",
                "dose_rate_ugy_h": 10.0 + i,
                "accumulated_dose_mgy": elapsed / 3600000 * (10 + i),
            }
            for i in range(1, 4)
        ],
    } | updates


def test_vehicle_readings_are_shared_persisted_and_never_personal(client, app_factory):
    empty = client.get(URL).json()
    assert len(empty["readings"]) == 3
    assert all(r["freshness"] == "NOT_AVAILABLE" for r in empty["readings"])
    data = packet(client)
    assert client.post(URL, json=data).status_code == 401
    response = client.post(URL, json=data, headers=TOKEN)
    assert response.status_code == 200
    saved = response.json()
    assert all(r["freshness"] == "LIVE" for r in saved["readings"])
    assert "astronaut_id" not in response.text
    assert client.get("/api/v1/observations").json() == []
    assert client.get("/api/v1/alerts").json() == []
    assert control(client, "CONFIGURE", astronaut_id="DEMO-CREW-002").status_code == 200
    assert client.get(URL).json() == saved
    with TestClient(app_factory()) as restarted:
        assert restarted.get(URL).json() == saved
        runtime = restarted.get("/api/v1/demo/runtime", headers=TOKEN).json()
        assert runtime["vehicle_simulated_at"] == 60


@pytest.mark.parametrize("field", ["astronaut_id", "crew_id", "personal_dose"])
def test_personal_fields_are_rejected(client, field):
    assert (
        client.post(URL, json=packet(client, **{field: "DEMO-CREW-001"}), headers=TOKEN).status_code
        == 422
    )


def test_time_order_pause_and_restart(client):
    data = packet(client)
    assert client.post(URL, json=data, headers=TOKEN).status_code == 200
    assert client.post(URL, json=data, headers=TOKEN).status_code == 200
    assert client.post(URL, json=packet(client, elapsed=59), headers=TOKEN).status_code == 409
    reduced = packet(client, elapsed=61)
    reduced["measurements"][0]["accumulated_dose_mgy"] = 0
    assert client.post(URL, json=reduced, headers=TOKEN).status_code == 409
    control(client, "PAUSE")
    assert client.post(URL, json=packet(client, elapsed=61), headers=TOKEN).status_code == 409
    control(client, "RESTART")
    assert client.post(URL, json=data, headers=TOKEN).status_code == 409
    assert all(r["freshness"] == "NOT_AVAILABLE" for r in client.get(URL).json()["readings"])
    assert client.post(URL, json=packet(client, elapsed=1), headers=TOKEN).status_code == 200


@pytest.mark.parametrize("age,status", [(8, "STALE"), (20, "DISCONNECTED")])
def test_freshness_uses_measurement_time(client, age, status):
    data = packet(client, observed_at=(datetime.now(UTC) - timedelta(seconds=age)).isoformat())
    response = client.post(URL, json=data, headers=TOKEN)
    assert response.status_code == 200
    assert all(r["freshness"] == status for r in response.json()["readings"])


def test_invalid_sensor_values_and_duplicate_sensor_ids_are_rejected(client):
    data = packet(client)
    data["measurements"][0]["dose_rate_ugy_h"] = -1
    assert client.post(URL, json=data, headers=TOKEN).status_code == 422
    data = packet(client)
    data["measurements"][0] = data["measurements"][1]
    assert client.post(URL, json=data, headers=TOKEN).status_code == 422
    data = packet(client, observed_at=(datetime.now(UTC) + timedelta(hours=1)).isoformat())
    assert client.post(URL, json=data, headers=TOKEN).status_code == 422
