from fastapi.testclient import TestClient
from test_api import TOKEN, packet


def control(client, action, **options):
    revision = client.get("/api/v1/demo/control").json()["revision"]
    return client.post(
        "/api/v1/demo/control", json={"action": action, "expected_revision": revision, **options}
    )


def live(client):
    assert client.post("/api/v1/telemetry", json=packet(), headers=TOKEN).status_code == 200


def acquire(client, kind="BLOOD_PRESSURE", device="DEMO-BP-001"):
    return client.post(
        "/api/v1/examinations",
        json={"astronaut_id": "DEMO-CREW-001", "kind": kind, "device_id": device},
    )


def test_controls_have_revision_checks_and_seeded_restart(client):
    original = client.get("/api/v1/demo/control").json()
    assert control(client, "PAUSE").json()["running"] is False
    assert control(client, "PAUSE").status_code == 409
    assert (
        client.post(
            "/api/v1/demo/control", json={"action": "RESUME", "expected_revision": 0}
        ).status_code
        == 409
    )
    assert control(client, "RESUME").json()["running"] is True
    assert control(client, "CONFIGURE", seed=100).status_code == 409
    restarted = control(client, "RESTART", seed=100, scenario="EXERCISE", speed=2).json()
    assert restarted["run_id"] != original["run_id"]
    assert restarted["seed"] == 100 and restarted["speed"] == 2
    assert client.get("/api/v1/demo/runtime").status_code == 401
    assert client.get("/api/v1/demo/runtime", headers=TOKEN).json()["checkpoints"] == {}


def test_operator_actions_reject_remote_origin_and_remote_client(client, app_factory):
    request = {"action": "PAUSE", "expected_revision": 0}
    assert (
        client.post(
            "/api/v1/demo/control", json=request, headers={"Origin": "https://untrusted.example"}
        ).status_code
        == 403
    )
    with TestClient(app_factory(), client=("192.0.2.1", 50000)) as remote:
        assert remote.post("/api/v1/demo/control", json=request).status_code == 403


def test_examination_acquire_review_save_retrieve_and_restart(client, app_factory):
    assert acquire(client).status_code == 409
    live(client)
    exam = acquire(client).json()
    assert exam["status"] == "ACQUIRING"
    assert acquire(client).status_code == 409
    action_url = f"/api/v1/examinations/{exam['id']}/actions"
    assert client.post(action_url, json={"action": "SAVE"}).status_code == 409
    result = packet(
        0,
        scenario="EXAMINATION",
        device_id="DEMO-BP-001",
        examination_id=exam["id"],
        event_id="demo-exam-acquisition",
        measurements=[
            {"code": "systolic_bp", "value": 118, "unit": "mmHg", "quality": "VALID"},
            {"code": "diastolic_bp", "value": 76, "unit": "mmHg", "quality": "VALID"},
        ],
    )
    assert client.post("/api/v1/telemetry", json=result, headers=TOKEN).status_code == 200
    acquired = client.get("/api/v1/examinations").json()[0]
    assert acquired["acquired_at"].replace("Z", "+00:00") == result["observed_at"]
    assert client.get("/api/v1/examinations").json()[0]["status"] == "REVIEW"
    saved = client.post(
        action_url, json={"action": "SAVE", "note": "Demo operator reviewed fixture"}
    ).json()
    assert saved["status"] == "SAVED"
    assert saved["event_id"] == "demo-exam-acquisition"
    assert saved["source_type"] == "SIMULATED"
    assert len(saved["results"]) == 2
    assert client.post(action_url, json={"action": "SAVE"}).json()["saved_at"] == saved["saved_at"]
    with TestClient(app_factory()) as restarted:
        assert restarted.get("/api/v1/examinations").json()[0] == saved


def test_static_measurements_require_a_corresponding_exam_and_supported_device(client):
    live(client)
    bad = packet(
        1,
        device_id="DEMO-LAB-001",
        measurements=[{"code": "wbc", "value": 5.8, "unit": "10^9/L", "quality": "VALID"}],
    )
    assert client.post("/api/v1/telemetry", json=bad, headers=TOKEN).status_code == 422
    assert acquire(client, device="DEMO-LAB-001").status_code == 422
    exam = acquire(client).json()
    client.post(f"/api/v1/examinations/{exam['id']}/actions", json={"action": "CANCEL"})
    assert client.get("/api/v1/examinations").json()[0]["status"] == "CANCELLED"


def test_lost_acquisition_times_out_without_a_result(client):
    from datetime import UTC, datetime, timedelta

    from app.config import Settings
    from app.database import connect
    from app.operations import get_record

    live(client)
    exam = acquire(client).json()
    engine, sessions = connect(Settings().database_url)
    with sessions() as db:
        row = get_record(db, exam["id"], "examination")
        row.data = row.data | {
            "started_at": (datetime.now(UTC) - timedelta(seconds=30)).isoformat()
        }
        db.commit()
    engine.dispose()
    timed_out = client.get("/api/v1/examinations").json()[0]
    assert timed_out["status"] == "FAILED"
    assert timed_out["results"] == []
    assert "timed out" in timed_out["error"]
    assert (
        client.post(
            f"/api/v1/examinations/{exam['id']}/actions", json={"action": "SAVE"}
        ).status_code
        == 409
    )


def test_old_sample_cannot_fulfill_a_new_examination(client):
    from datetime import UTC, datetime, timedelta

    live(client)
    exam = acquire(client).json()
    sample = packet(
        0,
        scenario="EXAMINATION",
        device_id="DEMO-BP-001",
        examination_id=exam["id"],
        event_id="demo-old-exam",
        observed_at=(datetime.now(UTC) - timedelta(seconds=30)).isoformat(),
        measurements=[
            {"code": "systolic_bp", "value": 118, "unit": "mmHg", "quality": "VALID"},
            {"code": "diastolic_bp", "value": 76, "unit": "mmHg", "quality": "VALID"},
        ],
    )
    assert client.post("/api/v1/telemetry", json=sample, headers=TOKEN).status_code == 409
    pending = client.get("/api/v1/examinations").json()[0]
    assert pending["status"] == "ACQUIRING" and pending["results"] == []


def test_nutrition_inventory_and_totals_are_atomic_and_durable(client):
    inventory = client.get("/api/v1/operations").json()["inventory"]
    food = next(item for item in inventory if item["id"] == "oats")
    response = client.post(
        "/api/v1/nutrition/meals",
        json={"astronaut_id": "DEMO-CREW-001", "food_id": "oats", "servings": 2},
    )
    assert response.status_code == 200
    assert response.json()["kcal"] == food["kcal"] * 2
    snapshot = client.get("/api/v1/operations").json()
    assert (
        next(item for item in snapshot["inventory"] if item["id"] == "oats")["servings"]
        == food["servings"] - 2
    )
    assert len(snapshot["meals"]) == 1
    assert (
        client.post(
            "/api/v1/nutrition/meals",
            json={"astronaut_id": "DEMO-CREW-001", "food_id": "oats", "servings": -1},
        ).status_code
        == 422
    )


def test_fitness_drives_exercise_and_recovery_and_keeps_history(client):
    live(client)
    session = client.post(
        "/api/v1/fitness/sessions",
        json={"astronaut_id": "DEMO-CREW-001", "activity": "CYCLE", "planned_minutes": 20},
    ).json()
    assert session["status"] == "ACTIVE"
    assert client.get("/api/v1/demo/control").json()["scenario"] == "EXERCISE"
    finished = client.post(f"/api/v1/fitness/sessions/{session['id']}/finish").json()
    assert finished["status"] == "COMPLETED"
    assert finished["duration_seconds"] >= 0
    assert client.get("/api/v1/demo/control").json()["scenario"] == "RECOVERY"
    assert len(client.get("/api/v1/operations").json()["fitness"]) == 1


def test_eva_checklist_gates_start_and_timeline_persists(client):
    live(client)
    session = client.post("/api/v1/eva/sessions", json={"astronaut_id": "DEMO-CREW-001"}).json()
    url = f"/api/v1/eva/sessions/{session['id']}/actions"
    assert client.post(url, json={"action": "START"}).status_code == 409
    for step in session["checklist"]:
        assert client.post(url, json={"action": "CHECK", "step_id": step["id"]}).status_code == 200
    assert client.post(url, json={"action": "START"}).json()["status"] == "ACTIVE"
    finished = client.post(url, json={"action": "COMPLETE"}).json()
    assert finished["status"] == "COMPLETED"
    assert len(finished["timeline"]) == 8
    assert client.get("/api/v1/operations").json()["eva"][0]["id"] == session["id"]


def test_alert_acknowledgment_and_tasks_are_idempotent(client):
    result = client.post(
        "/api/v1/telemetry", json=packet(scenario="simultaneous_demo"), headers=TOKEN
    ).json()
    alert_id = result["alerts"][0]["id"]
    acknowledged = client.post(f"/api/v1/alerts/{alert_id}/acknowledge").json()
    assert acknowledged["state"] == "ACKNOWLEDGED"
    assert acknowledged["acknowledged_by"] == "DEMO-OPERATOR"
    assert client.post(f"/api/v1/alerts/{alert_id}/acknowledge").json() == acknowledged
    task = next(
        task for task in client.get("/api/v1/operations").json()["tasks"]
        if task["destination"] != "Examinations"
    )
    assert client.post(f"/api/v1/tasks/{task['id']}/complete").json()["status"] == "COMPLETE"


def test_device_faults_are_separate_from_calibration_and_data_quality(client):
    live(client)
    assert len(client.get("/api/v1/crew").json()) == 3
    assert len(client.get("/api/v1/devices").json()) == 7
    control(client, "CONFIGURE", fault="DISCONNECT")
    device = client.get("/api/v1/devices").json()[0]
    assert device["status"] == "DISCONNECTED"
    assert device["calibration"] == "CALIBRATION_UNKNOWN"
    control(client, "CONFIGURE", fault="SENSOR_ERROR")
    assert client.get("/api/v1/devices").json()[0]["status"] == "ERROR"


def test_crew_summary_includes_all_vitals_and_preserves_partial_packet_readings(client):
    measurements = [
        {"code": code, "value": value, "unit": unit, "quality": "VALID"}
        for code, value, unit in [
            ("heart_rate", 68, "beats/min"),
            ("respiratory_rate", 13, "breaths/min"),
            ("spo2", 98.2, "%"),
            ("suit_pressure", 30, "kPa"),
            ("systolic_bp", 118, "mmHg"),
            ("diastolic_bp", 76, "mmHg"),
            ("sleep_duration", 7.5, "h"),
            ("weight", 64, "kg"),
        ]
    ]
    assert (
        client.post(
            "/api/v1/telemetry", json=packet(measurements=measurements), headers=TOKEN
        ).status_code
        == 200
    )
    summaries = client.get("/api/v1/crew/summaries").json()
    readings = summaries[0]["readings"]
    assert {r["code"] for r in readings} == {m["code"] for m in measurements}
    assert all(r["freshness"] == "LIVE" for r in readings)
    assert (
        client.post(
            "/api/v1/telemetry",
            json=packet(sequence=2, measurements=[measurements[-3] | {"value": 80}]),
            headers=TOKEN,
        ).status_code
        == 200
    )
    readings = client.get("/api/v1/crew/summaries").json()[0]["readings"]
    assert len(readings) == 8
    assert next(r["value"] for r in readings if r["code"] == "heart_rate") == 68
    assert next(r["value"] for r in readings if r["code"] == "diastolic_bp") == 80
    assert client.get("/api/v1/crew/summaries").json()[1]["readings"] == []


def test_restart_clears_lethal_overrides_and_faults_even_if_supplied_again(client):
    configured = control(
        client,
        "CONFIGURE",
        scenario="ANOMALY",
        fault="DISCONNECT",
        manual_values={"heart_rate": 0, "spo2": 0},
    ).json()
    restarted = control(client, "RESTART").json()
    assert restarted["run_id"] != configured["run_id"]
    assert restarted["scenario"] == "REST"
    assert restarted["fault"] == "NONE"
    assert all(value is None for value in restarted["manual_values"].values())
    assert restarted["running"] is True
    restarted = control(
        client,
        "RESTART",
        manual_values={"heart_rate": 0},
        fault="SENSOR_ERROR",
    ).json()
    assert restarted["fault"] == "NONE"
    assert all(value is None for value in restarted["manual_values"].values())
