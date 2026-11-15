import pytest
from fastapi.testclient import TestClient
from test_api import TOKEN, packet
from test_operations import control, live


def plans(client):
    return client.get("/api/v1/operations").json()["exam_plans"]


def schedule(client, **changes):
    return client.post(
        "/api/v1/examination-plans",
        json={
            "astronaut_id": "DEMO-CREW-001",
            "kind": "BODY_TEMPERATURE",
            "scheduled_at": "2026-11-16T09:00:00+03:00",
            "notes": "Routine demo",
            **changes,
        },
    )


def test_fresh_weekly_template_is_identical_for_all_crew_and_persists(client, app_factory):
    initial = plans(client)
    assert len(initial) == 36
    assert {entry["astronaut_id"] for entry in initial} == {f"DEMO-CREW-00{i}" for i in (1, 2, 3)}
    assert {entry["kind"] for entry in initial} == {
        "BLOOD_PRESSURE", "BODY_TEMPERATURE", "LAB_PANEL", "BONE_DENSITY"
    }
    schedules = [
        [(entry["kind"], entry["scheduled_at"]) for entry in initial
         if entry["astronaut_id"] == f"DEMO-CREW-00{i}"]
        for i in (1, 2, 3)
    ]
    assert schedules[0] == schedules[1] == schedules[2]
    from collections import Counter
    from datetime import datetime

    days = Counter(entry["scheduled_at"][:10] for entry in initial
                   if entry["astronaut_id"] == "DEMO-CREW-001")
    assert len(days) == 6
    assert all(count == 2 for count in days.values())
    weekdays = {datetime.fromisoformat(entry["scheduled_at"]).weekday() for entry in initial}
    assert weekdays == {0, 2, 4}
    tasks = client.get("/api/v1/operations").json()["tasks"]
    for entry in [plan for plan in initial if plan["task_id"]]:
        assert entry["scheduled_at"] == next(
            task["due_at"] for task in tasks if task["id"] == entry["task_id"]
        )
    with TestClient(app_factory()) as restarted:
        assert plans(restarted) == initial


def test_plans_are_persistent_crew_specific_and_use_utc(client, app_factory):
    control(client, "PAUSE")
    created = schedule(client)
    assert created.status_code == 200
    first = created.json()
    assert first["scheduled_at"] == "2026-11-16T06:00:00Z"
    assert first["status"] == "PLANNED"
    assert first["source_type"] == "SIMULATED"
    assert schedule(client, astronaut_id="DEMO-CREW-002", kind="LAB_PANEL").status_code == 200
    assert client.get("/api/v1/examinations").json() == []
    stored = plans(client)
    control(client, "RESTART")
    assert plans(client) == stored
    with TestClient(app_factory()) as restarted:
        assert plans(restarted) == stored


@pytest.mark.parametrize(
    "changes",
    [
        {"astronaut_id": "UNKNOWN"},
        {"kind": "UNKNOWN"},
        {"scheduled_at": "2026-11-16T09:00:00"},
        {"scheduled_at": "invalid"},
        {"notes": "x" * 1001},
    ],
)
def test_plan_schema_rejects_invalid_input(client, changes):
    assert schedule(client, **changes).status_code == 422
    assert len(plans(client)) == 36


def test_reschedule_cancel_and_restore_use_revision_checks(client):
    created = schedule(client).json()
    route = f"/api/v1/examination-plans/{created['id']}"
    assert (
        client.post(route, json={"action": "RESCHEDULE", "expected_revision": 0}).status_code == 422
    )
    updated = client.post(
        route,
        json={
            "action": "RESCHEDULE",
            "expected_revision": 0,
            "scheduled_at": "2026-11-23T11:30:00Z",
            "notes": "Changed",
        },
    ).json()
    assert updated["revision"] == 1
    assert updated["notes"] == "Changed"
    assert client.post(route, json={"action": "CANCEL", "expected_revision": 0}).status_code == 409
    cancelled = client.post(route, json={"action": "CANCEL", "expected_revision": 1}).json()
    assert cancelled["status"] == "CANCELLED"
    restored = client.post(
        route,
        json={
            "action": "RESCHEDULE",
            "expected_revision": 2,
            "scheduled_at": "2026-11-24T10:00:00Z",
        },
    ).json()
    assert restored["status"] == "PLANNED" and restored["revision"] == 3


def test_saved_linked_examination_completes_its_plan_and_task_once(client):
    live(client)
    plan = next(entry for entry in plans(client) if entry["astronaut_id"] == "DEMO-CREW-001")
    request = {
        "astronaut_id": "DEMO-CREW-001",
        "kind": "BLOOD_PRESSURE",
        "device_id": "DEMO-BP-001",
        "plan_id": plan["id"],
    }
    result = client.post("/api/v1/examinations", json=request)
    assert result.status_code == 200
    exam = result.json()
    route = f"/api/v1/examination-plans/{plan['id']}"
    assert client.post(route, json={"action": "CANCEL", "expected_revision": 0}).status_code == 409
    measurements = [
        {"code": "systolic_bp", "value": 118, "unit": "mmHg", "quality": "VALID"},
        {"code": "diastolic_bp", "value": 76, "unit": "mmHg", "quality": "VALID"},
    ]
    payload = packet(
        0,
        scenario="EXAMINATION",
        event_id="planned-result",
        device_id="DEMO-BP-001",
        examination_id=exam["id"],
        measurements=measurements,
    )
    assert client.post("/api/v1/telemetry", json=payload, headers=TOKEN).status_code == 200
    assert (
        next(entry for entry in plans(client) if entry["id"] == plan["id"])["status"] == "PLANNED"
    )
    assert client.post("/api/v1/examinations", json=request).status_code == 409
    save_route = f"/api/v1/examinations/{exam['id']}/actions"
    assert client.post(save_route, json={"action": "SAVE"}).status_code == 200
    assert client.post(save_route, json={"action": "SAVE"}).status_code == 200
    completed = next(entry for entry in plans(client) if entry["id"] == plan["id"])
    assert completed["status"] == "COMPLETED"
    assert completed["examination_id"] == exam["id"]
    assert completed["revision"] == plan["revision"] + 1
    task = next(
        task
        for task in client.get("/api/v1/operations").json()["tasks"]
        if task["id"] == plan["task_id"]
    )
    assert task["status"] == "COMPLETE"
    assert (
        client.post(
            route,
            json={
                "action": "RESCHEDULE",
                "expected_revision": 1,
                "scheduled_at": "2026-11-23T10:00:00Z",
            },
        ).status_code
        == 409
    )


def test_plan_must_match_crew_kind_and_pending_state(client):
    live(client)
    plan = schedule(client, astronaut_id="DEMO-CREW-002").json()
    request = {
        "astronaut_id": "DEMO-CREW-001",
        "kind": "BODY_TEMPERATURE",
        "device_id": "DEMO-TEMP-001",
        "plan_id": plan["id"],
    }
    assert client.post("/api/v1/examinations", json=request).status_code == 409
    plan = schedule(client).json()
    request["plan_id"] = plan["id"]
    assert (
        client.post(
            "/api/v1/examinations",
            json=request | {"kind": "BLOOD_PRESSURE", "device_id": "DEMO-BP-001"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/examination-plans/{plan['id']}",
            json={"action": "CANCEL", "expected_revision": 0},
        ).status_code
        == 200
    )
    assert client.post("/api/v1/examinations", json=request).status_code == 409


def test_cancelling_and_rescheduling_template_plans_updates_tasks(client):
    plan = plans(client)[0]
    route = f"/api/v1/examination-plans/{plan['id']}"
    client.post(route, json={"action": "CANCEL", "expected_revision": plan["revision"]})
    task = next(
        task
        for task in client.get("/api/v1/operations").json()["tasks"]
        if task["id"] == plan["task_id"]
    )
    assert task["status"] == "CANCELLED"
    assert client.post(f"/api/v1/tasks/{task['id']}/complete").status_code == 409
    client.post(
        route,
        json={
            "action": "RESCHEDULE",
            "expected_revision": plan["revision"] + 1,
            "scheduled_at": "2026-11-23T11:00:00Z",
        },
    )
    task = next(
        task
        for task in client.get("/api/v1/operations").json()["tasks"]
        if task["id"] == plan["task_id"]
    )
    assert task["status"] == "PENDING"
    assert task["due_at"] == "2026-11-23T11:00:00Z"


def test_examination_task_requires_a_saved_result(client):
    plan = next(entry for entry in plans(client) if entry["task_id"])
    assert client.post(f"/api/v1/tasks/{plan['task_id']}/complete").status_code == 409
    stored = next(entry for entry in plans(client) if entry["id"] == plan["id"])
    assert stored["status"] == "PLANNED"


def test_weekly_schedule_rolls_forward_without_recreating_cancelled_or_completed_plans(tmp_path):
    from datetime import UTC, datetime, timedelta

    from app.database import Base, connect
    from app.operations import ensure_weekly_examinations, records

    engine, sessions = connect(f"sqlite:///{tmp_path / 'weekly.db'}")
    Base.metadata.create_all(engine)
    monday = datetime(2026, 11, 9, 8, tzinfo=UTC)
    with sessions() as db:
        ensure_weekly_examinations(db, monday)
        initial = records(db, "exam-plan")
        assert len(initial) == 36
        first = initial[0]
        first.data = first.data | {"status": "CANCELLED"}
        db.commit()
        ensure_weekly_examinations(db, monday)
        assert len(records(db, "exam-plan")) == 36
        assert first.data["status"] == "CANCELLED"
        ensure_weekly_examinations(db, monday + timedelta(days=7))
        assert len(records(db, "exam-plan")) == 54
        assert all(
            datetime.fromisoformat(row.data["scheduled_at"]).weekday() in (0, 2, 4)
            for row in records(db, "exam-plan")
        )
    engine.dispose()


def test_new_calendar_does_not_import_previous_configuration(tmp_path):
    from datetime import UTC, datetime

    from app.database import Base, connect
    from app.operations import ensure_weekly_examinations, insert, records

    engine, sessions = connect(f"sqlite:///{tmp_path / 'replacement.db'}")
    Base.metadata.create_all(engine)
    with sessions() as db:
        old = insert(db, "exam-plan", {
            "id": "old-custom-plan", "astronaut_id": "DEMO-CREW-001",
            "kind": "LAB_PANEL", "scheduled_at": "2026-11-10T17:00:00Z",
            "status": "PLANNED", "revision": 0, "task_id": "old-task",
        }, "DEMO-CREW-001")
        old_task = insert(db, "task", {
            "id": "old-task", "destination": "Examinations", "status": "PENDING",
            "due_at": "2026-11-10T17:00:00Z",
        }, "DEMO-CREW-001")
        ensure_weekly_examinations(db, datetime(2026, 11, 9, tzinfo=UTC))
        fresh = records(db, "exam-plan")
        assert len(fresh) == 36
        assert all(row.id.startswith("weekly-v2-") for row in fresh)
        assert all(row.data["scheduled_at"] != old.data["scheduled_at"] for row in fresh)
        assert old.kind == "archived-exam-plan"
        assert old_task.data["status"] == "CANCELLED"
        for crew_id in {row.astronaut_id for row in fresh}:
            assert sum(row.astronaut_id == crew_id for row in fresh) == 12
    engine.dispose()
