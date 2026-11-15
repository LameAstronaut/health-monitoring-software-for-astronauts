from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import PacketRow, RecordRow
from .operation_schemas import (
    ControlCommand,
    Examination,
    ExaminationPlan,
    InventoryItem,
    OperationsSnapshot,
    SimulatorControl,
    Task,
)
from .registry import CREW


def now_iso():
    return datetime.now(UTC).isoformat()


def records(db: Session, kind: str) -> list[RecordRow]:
    rows = list(db.scalars(select(RecordRow).where(RecordRow.kind == kind)))
    return sorted(
        rows,
        key=lambda row: (
            row.data.get("started_at")
            or row.data.get("logged_at")
            or row.data.get("created_at")
            or row.data.get("scheduled_at")
            or row.data.get("recorded_at")
            or row.data.get("due_at")
            or "",
            row.id,
        ),
    )


def get_record(db: Session, record_id: str, kind: str) -> RecordRow:
    row = db.get(RecordRow, record_id)
    if row is None or row.kind != kind:
        raise HTTPException(404, f"Unknown {kind} record")
    return row


def insert(db: Session, kind: str, data: dict, astronaut_id: str | None = None):
    record_id = data.get("id", f"demo-{kind}-{uuid4().hex}")
    row = RecordRow(id=record_id, kind=kind, astronaut_id=astronaut_id, data=data)
    db.add(row)
    db.flush()
    return row


def initialize(db: Session):
    control = db.get(RecordRow, "demo-control")
    if control is None:
        insert(
            db,
            "control",
            SimulatorControl(run_id=uuid4().hex).model_dump(mode="json") | {"id": "demo-control"},
        )
    else:
        # Safe API restart: keep the playback checkpoint but require explicit resume.
        control.data = control.data | {"running": False, "revision": control.data["revision"] + 1}
    if not records(db, "inventory"):
        for data in [
            ("oats", "Oat & berry breakfast", 32, 310, 12, 52, 7, 8),
            ("lentils", "Lentil & vegetable bowl", 28, 420, 22, 64, 9, 14),
            ("chicken", "Chicken & rice pouch", 24, 480, 32, 58, 14, 5),
            ("nuts", "Mixed nuts snack", 40, 180, 6, 7, 16, 3),
        ]:
            keys = [
                "id",
                "name",
                "servings",
                "kcal",
                "protein_g",
                "carbohydrate_g",
                "fat_g",
                "fiber_g",
            ]
            item = InventoryItem(**dict(zip(keys, data, strict=True)), expires_at="2028-06-30")
            insert(db, "inventory", item.model_dump(mode="json"))
    if not records(db, "task"):
        for i, crew in enumerate(CREW):
            for offset, title, destination in [
                (2, "Log a synthetic meal", "Nutrition"),
                (3, "Complete an exercise demo", "Fitness"),
            ]:
                task = Task(
                    id=f"demo-task-{i}-{offset}",
                    astronaut_id=crew["id"],
                    title=title,
                    due_at=datetime.now(UTC) + timedelta(hours=offset),
                    destination=destination,
                )
                insert(db, "task", task.model_dump(mode="json"), crew["id"])
    ensure_weekly_examinations(db)
    db.commit()


# Shared synthetic fixture template: weekday (Monday = 0), hour, minute, kind.
WEEKLY_EXAMINATIONS = (
    (0, 9, 0, "BLOOD_PRESSURE"),
    (0, 9, 30, "BODY_TEMPERATURE"),
    (2, 9, 0, "LAB_PANEL"),
    (2, 9, 30, "BODY_TEMPERATURE"),
    (4, 9, 0, "BLOOD_PRESSURE"),
    (4, 10, 0, "BONE_DENSITY"),
)


def ensure_weekly_examinations(db: Session, now: datetime | None = None):
    """Generate a fresh shared template, independent of previous calendar settings."""
    now = (now or datetime.now(UTC)).astimezone(UTC)
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    marker = db.get(RecordRow, "weekly-calendar-v2")
    if marker is None:
        # Retain old records for provenance, but retire the previous calendar once.
        marker = insert(db, "calendar-version", {
            "id": "weekly-calendar-v2",
            "retiring": [row.id for row in records(db, "exam-plan")],
        })
        for task in records(db, "task"):
            if task.data["destination"] == "Examinations" and task.data["status"] == "PENDING":
                task.data = task.data | {"status": "CANCELLED"}
    active_plan_ids = {
        row.data.get("plan_id")
        for row in records(db, "examination")
        if row.data["status"] in ("ACQUIRING", "REVIEW")
    }
    deferred = []
    for plan_id in marker.data["retiring"]:
        if plan_id in active_plan_ids:
            deferred.append(plan_id)
            continue
        row = db.get(RecordRow, plan_id)
        if row:
            row.kind = "archived-exam-plan"
    marker.data = marker.data | {"retiring": deferred}
    for crew in CREW:
        for week_offset in (0, 7):
            for day, hour, minute, kind in WEEKLY_EXAMINATIONS:
                scheduled = monday + timedelta(
                    days=week_offset + day, hours=hour, minutes=minute
                )
                slot = scheduled.strftime("%Y-%m-%d-%H%M")
                plan_id = f"weekly-v2-{crew['id']}-{slot}-{kind}"
                if db.get(RecordRow, plan_id):
                    continue
                task_id = f"task-{plan_id}"
                plan = ExaminationPlan(
                    id=plan_id,
                    astronaut_id=crew["id"],
                    kind=kind,
                    scheduled_at=scheduled,
                    task_id=task_id,
                    notes="Shared weekly demo schedule · UTC.",
                )
                insert(db, "exam-plan", plan.model_dump(mode="json"), crew["id"])
                task = Task(
                    id=task_id,
                    astronaut_id=crew["id"],
                    title=f"{kind.replace('_', ' ').capitalize()} examination",
                    due_at=scheduled,
                    destination="Examinations",
                )
                insert(db, "task", task.model_dump(mode="json"), crew["id"])
    db.commit()


def control_state(db: Session) -> SimulatorControl:
    data = get_record(db, "demo-control", "control").data.copy()
    data.pop("id", None)
    worker = db.get(RecordRow, "demo-worker")
    if worker:
        data |= {
            "worker_seen": worker.data["seen"],
            "worker_revision": worker.data["revision"],
            "worker_state": worker.data["state"],
        }
    latest = db.scalar(
        select(PacketRow)
        .where(PacketRow.device_id == f"DEMO-SUIT-{data['astronaut_id'][-3:]}")
        .order_by(PacketRow.sequence.desc())
        .limit(1)
    )
    if latest and latest.raw.get("run_id") == data["run_id"]:
        data["simulated_at"] = latest.raw.get("simulated_at", 0)
    return SimulatorControl(**data)


def change_control(db: Session, command: ControlCommand) -> SimulatorControl:
    row = get_record(db, "demo-control", "control")
    old = control_state(db)
    if command.expected_revision != old.revision:
        raise HTTPException(409, "Simulator settings changed. Refresh and try again.")
    update = command.model_dump(exclude_none=True, exclude={"action", "expected_revision"})
    if command.seed is not None and command.seed != old.seed and command.action != "RESTART":
        raise HTTPException(409, "Change seed using Restart to preserve reproducible playback")
    if command.action == "PAUSE":
        if not old.running:
            raise HTTPException(409, "Simulator is already paused")
        update["running"] = False
    if command.action == "RESUME":
        if old.running:
            raise HTTPException(409, "Simulator is already running")
        update["running"] = True
    if command.action == "RESTART":
        update |= {
            "run_id": uuid4().hex,
            "running": True,
            "simulated_at": 0,
            "scenario": command.scenario or "REST",
            "fault": "NONE",
        }
    if command.action == "RESTART" or (
        command.astronaut_id is not None and command.astronaut_id != old.astronaut_id
    ):
        update["manual_values"] = {}
    if command.manual_values is not None and command.action != "RESTART":
        update["manual_values"] = command.manual_values.model_dump(exclude_none=True)
    row.data = row.data | update | {"revision": old.revision + 1}
    db.commit()
    return control_state(db)


def heartbeat(db: Session, run_id: str, revision: int, state: str):
    control = control_state(db)
    if control.run_id != run_id or revision != control.revision:
        raise HTTPException(409, "Worker must load the latest control revision")
    row = db.get(RecordRow, "demo-worker")
    data = {"seen": now_iso(), "revision": revision, "run_id": run_id, "state": state}
    if row:
        row.data = data
    else:
        insert(db, "worker", {"id": "demo-worker"} | data)
    db.commit()


def crew_deceased(db: Session, astronaut_id: str, run_id: str) -> bool:
    latest = db.scalar(
        select(PacketRow)
        .where(
            PacketRow.device_id == f"DEMO-SUIT-{astronaut_id[-3:]}",
            PacketRow.raw["run_id"].as_string() == run_id,
            PacketRow.raw["model_state"]["deceased"].as_boolean().is_not(None),
        )
        .order_by(PacketRow.sequence.desc())
        .limit(1)
    )
    return bool(latest and latest.raw["model_state"].get("deceased", False))


def expire_examinations(db: Session):
    changed = False
    for row in records(db, "examination"):
        if row.data["status"] == "ACQUIRING" and crew_deceased(
            db, row.astronaut_id, control_state(db).run_id
        ):
            row.data = row.data | {
                "status": "FAILED",
                "error": "Crew is deceased in this run. Restart playback for new acquisitions.",
            }
            changed = True
            continue
        if (
            row.data["status"] == "ACQUIRING"
            and (datetime.now(UTC) - datetime.fromisoformat(row.data["started_at"])).total_seconds()
            > 20
        ):
            row.data = row.data | {
                "status": "FAILED",
                "error": "Acquisition timed out. Check simulator connectivity and retry.",
            }
            changed = True
    if changed:
        db.commit()


def snapshot(db: Session) -> OperationsSnapshot:
    expire_examinations(db)
    ensure_weekly_examinations(db)

    def items(kind):
        rows = records(db, kind)
        return [row.data for row in rows][-200:][::-1]

    return OperationsSnapshot(
        exam_plans=[row.data for row in records(db, "exam-plan")],
        moods=items("mood"),
        control=control_state(db),
        examinations=items("examination"),
        inventory=items("inventory"),
        meals=items("meal"),
        fitness=items("fitness"),
        eva=items("eva"),
        tasks=items("task"),
    )


def finish_examination(db: Session, packet, now: datetime):
    if not packet.examination_id:
        return
    row = get_record(db, packet.examination_id, "examination")
    exam = Examination(**row.data)
    if (
        now - exam.started_at
    ).total_seconds() > 20 or packet.observed_at < exam.started_at - timedelta(seconds=5):
        raise HTTPException(
            409, "Examination sample is outside the acquisition window; request a new acquisition"
        )
    if (
        exam.status != "ACQUIRING"
        or exam.astronaut_id != packet.astronaut_id
        or exam.device_id != packet.device_id
    ):
        raise HTTPException(409, "Examination is not acquiring for this crew and instrument")
    from .registry import EXAM_CODES

    if {m.code for m in packet.measurements} != set(EXAM_CODES[exam.kind]):
        raise HTTPException(422, "Examination result is incomplete")
    if any(m.quality != "VALID" for m in packet.measurements):
        raise HTTPException(422, "Invalid acquisition cannot be reviewed or saved")
    row.data = row.data | {
        "status": "REVIEW",
        "acquired_at": packet.observed_at.astimezone(UTC).isoformat(),
        "results": [m.model_dump() for m in packet.measurements],
        "event_id": packet.event_id,
    }
