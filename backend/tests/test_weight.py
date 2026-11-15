import pytest
from test_api import TOKEN, packet
from test_operations import control


@pytest.mark.parametrize("weight", [0, 64.5, 1000])
def test_weight_roundtrip_and_manual_override(client, weight):
    measurement = {"code": "weight", "value": weight, "unit": "kg", "quality": "VALID"}
    response = client.post(
        "/api/v1/telemetry", headers=TOKEN, json=packet(measurements=[measurement])
    )
    assert response.status_code == 200
    assert response.json()["alerts"] == []
    observation = response.json()["observations"][0]
    assert observation["value"] == weight
    assert observation["deceased"] is False
    summaries = client.get("/api/v1/crew/summaries").json()
    assert summaries[0]["readings"][0]["code"] == "weight"
    assert "weight" in client.get("/api/v1/devices").json()[0]["capabilities"]
    result = control(client, "CONFIGURE", manual_values={"weight": weight})
    assert result.status_code == 200
    assert result.json()["manual_values"]["weight"] == weight
    assert control(client, "RESTART").json()["manual_values"]["weight"] is None


@pytest.mark.parametrize("value", [-0.1, 1000.1, 1001])
def test_weight_bounds_apply_to_ingestion_and_controls(client, value):
    assert (
        client.post(
            "/api/v1/telemetry",
            headers=TOKEN,
            json=packet(
                measurements=[{"code": "weight", "value": value, "unit": "kg", "quality": "VALID"}]
            ),
        ).status_code
        == 422
    )
    assert control(client, "CONFIGURE", manual_values={"weight": value}).status_code == 422


def test_weight_requires_canonical_kilograms(client):
    assert (
        client.post(
            "/api/v1/telemetry",
            headers=TOKEN,
            json=packet(
                measurements=[{"code": "weight", "value": 8, "unit": "lb", "quality": "VALID"}]
            ),
        ).status_code
        == 422
    )
