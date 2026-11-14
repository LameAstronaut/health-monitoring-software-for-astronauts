import pytest
from test_api import TOKEN, packet
from test_operations import control


@pytest.mark.parametrize(
    "fault", ["PULSE_SURGE", "PULSE_DECREASE", "RESPIRATORY_SURGE", "MULTI_SYSTEM"]
)
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


@pytest.mark.parametrize(
    ("code", "unit", "trigger", "baseline"),
    [
        ("heart_rate", "beats/min", 40, 68),
        ("heart_rate", "beats/min", 120, 68),
        ("respiratory_rate", "breaths/min", 28, 13),
        ("spo2", "%", 90, 98.2),
        ("suit_pressure", "kPa", 23, 30),
    ],
)
def test_alert_rearms_only_after_acknowledgment_and_valid_recovery(
    client, code, unit, trigger, baseline
):
    def publish(sequence, value, quality="VALID", **updates):
        result = client.post(
            "/api/v1/telemetry",
            headers=TOKEN,
            json=packet(
                sequence,
                scenario="ANOMALY",
                measurements=[{"code": code, "value": value, "unit": unit, "quality": quality}],
                **updates,
            ),
        )
        assert result.status_code == 200
        return result.json()["alerts"]

    first = publish(1, trigger)[0]
    assert first["priority"] == (1 if code in ("respiratory_rate", "suit_pressure") else 2)
    if trigger == 40:
        assert first["rule_id"] == "pulse-decrease-fixture"
    assert publish(2, trigger) == []
    assert client.post(f"/api/v1/alerts/{first['id']}/acknowledge").status_code == 200
    assert publish(3, trigger) == []
    assert publish(4, baseline, "INVALID") == []
    assert publish(5, trigger) == []
    # Recovery from another playback run cannot rearm this run's alert.
    assert publish(6, baseline, run_id="other-run") == []
    assert publish(7, trigger) == []
    assert publish(8, baseline) == []
    second = publish(9, trigger)
    assert len(second) == 1
    assert second[0]["id"] != first["id"]
    assert publish(10, trigger) == []


def test_pulse_decrease_marker_rejects_invalid_stale_and_non_anomaly_readings(client):
    from datetime import UTC, datetime, timedelta

    for sequence, (scenario, value, quality, age) in enumerate(
        [
            ("REST", 40, "VALID", 0),
            ("ANOMALY", 45.1, "VALID", 0),
            ("ANOMALY", 45, "INVALID", 0),
            ("ANOMALY", 45, "VALID", 10),
            ("ANOMALY", 45, "VALID", 0),
        ],
        1,
    ):
        data = packet(
            sequence,
            scenario=scenario,
            measurements=[
                {"code": "heart_rate", "value": value, "unit": "beats/min", "quality": quality}
            ],
        )
        if age:
            # Isolate the old timestamp so each device sequence stays ordered.
            data["observed_at"] = (datetime.now(UTC) - timedelta(seconds=age)).isoformat()
            data["device_id"] = "DEMO-SUIT-002"
            data["astronaut_id"] = "DEMO-CREW-002"
        result = client.post("/api/v1/telemetry", headers=TOKEN, json=data)
        assert result.status_code == 200
        assert len(result.json()["alerts"]) == (1 if sequence == 5 else 0)
