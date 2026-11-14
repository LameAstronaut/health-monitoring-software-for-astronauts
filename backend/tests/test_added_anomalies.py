import pytest
from test_api import TOKEN, packet
from test_operations import control


@pytest.mark.parametrize("fault", ["PULSE_SURGE", "RESPIRATORY_SURGE", "MULTI_SYSTEM"])
def test_added_fault_controls_persist(client, fault):
    result = control(client, "CONFIGURE", scenario="ANOMALY", fault=fault)
    assert result.status_code == 200
    assert client.get("/api/v1/demo/control").json()["fault"] == fault


@pytest.mark.parametrize(
    ("code", "unit", "marker", "priority", "rule"),
    [
        ("heart_rate", "beats/min", 115, 2, "pulse-rise-fixture"),
        ("respiratory_rate", "breaths/min", 26, 1, "respiratory-rise-fixture"),
    ],
)
def test_new_markers_require_explicit_valid_anomaly_and_deduplicate(
    client, code, unit, marker, priority, rule
):
    cases = [
        ("EXERCISE", marker + 5, "VALID"),
        ("ANOMALY", marker - 0.1, "VALID"),
        ("ANOMALY", marker, "INVALID"),
        ("ANOMALY", marker, "VALID"),
        ("ANOMALY", marker + 1, "VALID"),
    ]
    for sequence, (scenario, value, quality) in enumerate(cases, 1):
        result = client.post(
            "/api/v1/telemetry",
            headers=TOKEN,
            json=packet(
                sequence,
                scenario=scenario,
                measurements=[{"code": code, "value": value, "unit": unit, "quality": quality}],
            ),
        )
        assert result.status_code == 200
        assert len(result.json()["alerts"]) == (1 if sequence == 4 else 0)
    alerts = client.get("/api/v1/alerts").json()
    assert len(alerts) == 1
    assert alerts[0]["priority"] == priority
    assert alerts[0]["rule_id"] == rule
    assert alerts[0]["evidence"][0]["value"] == marker
    assert alerts[0]["source_type"] == "SIMULATED"
