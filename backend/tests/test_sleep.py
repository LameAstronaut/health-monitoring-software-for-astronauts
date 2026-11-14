import pytest
from test_api import TOKEN, packet
from test_operations import control


@pytest.mark.parametrize("duration", [0, 7.5, 24])
def test_sleep_roundtrip_and_manual_override(client, duration):
    measurement = {"code": "sleep_duration", "value": duration, "unit": "h", "quality": "VALID"}
    response = client.post(
        "/api/v1/telemetry", headers=TOKEN, json=packet(measurements=[measurement])
    )
    assert response.status_code == 200
    assert response.json()["alerts"] == []
    observation = response.json()["observations"][0]
    assert observation["value"] == duration
    assert observation["deceased"] is False
    summaries = client.get("/api/v1/crew/summaries").json()
    assert summaries[0]["readings"][0]["code"] == "sleep_duration"
    assert "sleep_duration" in client.get("/api/v1/devices").json()[0]["capabilities"]
    result = control(client, "CONFIGURE", manual_values={"sleep_duration": duration})
    assert result.status_code == 200
    assert result.json()["manual_values"]["sleep_duration"] == duration
    assert control(client, "RESTART").json()["manual_values"]["sleep_duration"] is None


@pytest.mark.parametrize("value", [-0.1, 24.1, 1000])
def test_sleep_bounds_apply_to_ingestion_and_controls(client, value):
    assert (
        client.post(
            "/api/v1/telemetry",
            headers=TOKEN,
            json=packet(
                measurements=[
                    {"code": "sleep_duration", "value": value, "unit": "h", "quality": "VALID"}
                ]
            ),
        ).status_code
        == 422
    )
    assert control(client, "CONFIGURE", manual_values={"sleep_duration": value}).status_code == 422


def test_sleep_requires_canonical_hours(client):
    assert (
        client.post(
            "/api/v1/telemetry",
            headers=TOKEN,
            json=packet(
                measurements=[
                    {"code": "sleep_duration", "value": 8, "unit": "min", "quality": "VALID"}
                ]
            ),
        ).status_code
        == 422
    )
