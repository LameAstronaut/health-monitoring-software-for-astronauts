import secrets
from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select

from . import operations as ops
from .database import AlertRow, ObservationRow, PacketRow
from .devices import SimulatedAdapter
from .operation_schemas import (
    ControlCommand,
    CrewRequest,
    CrewSummary,
    EvaAction,
    EvaEvent,
    EvaSession,
    ExamAction,
    Examination,
    ExamRequest,
    FitnessRequest,
    FitnessSession,
    Meal,
    MealRequest,
    OperationsSnapshot,
    RuntimeState,
    SimulatorControl,
    Task,
    WorkerHeartbeat,
)
from .registry import CREW, DEVICES
from .schemas import Alert, CrewMember


def build_operations_router(sessions, service, config):
    router = APIRouter(prefix="/api/v1")

    async def operator(request: Request):
        # Demo operator actions are confined to loopback and the configured browser origin.
        # This is not clinical role authorization; shared deployment remains unsupported.
        if request.client is None or request.client.host not in ("127.0.0.1", "::1"):
            raise HTTPException(403, "Demo operations are restricted to localhost")
        if request.headers.get("origin") not in (None, config.allowed_origin):
            raise HTTPException(403, "Untrusted operator origin")
        if request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "Cross-site demo operation rejected")

    async def worker(x_demo_token: Annotated[str | None, Header()] = None):
        if not secrets.compare_digest((x_demo_token or "").encode(), config.demo_token.encode()):
            raise HTTPException(401, "A valid X-Demo-Token is required")

    @router.get("/operations", response_model=OperationsSnapshot)
    async def operations():
        with sessions() as db:
            return ops.snapshot(db)

    @router.get("/crew/summaries", response_model=list[CrewSummary])
    async def summaries():
        with sessions() as db:
            now = datetime.now(UTC)
            result = []
            for crew in CREW:
                rows = db.scalars(
                    select(ObservationRow)
                    .join(PacketRow)
                    .where(
                        PacketRow.raw["astronaut_id"].as_string() == crew["id"],
                        PacketRow.device_id.like("DEMO-SUIT-%"),
                    )
                    .order_by(ObservationRow.id.desc())
                    .limit(4)
                )
                result.append(
                    CrewSummary(
                        crew=CrewMember(**crew),
                        readings=[service.observation(db, row, now) for row in rows],
                    )
                )
            return result

    @router.get("/demo/control", response_model=SimulatorControl)
    async def control():
        with sessions() as db:
            return ops.control_state(db)

    @router.post("/demo/control", response_model=SimulatorControl, dependencies=[Depends(operator)])
    async def configure(command: ControlCommand):
        with sessions() as db:
            return ops.change_control(db, command)

    @router.get("/demo/runtime", response_model=RuntimeState, dependencies=[Depends(worker)])
    async def runtime():
        with sessions() as db:
            ops.expire_examinations(db)
            control = ops.control_state(db)
            next_sequences, checkpoints = {}, {}
            for device in DEVICES:
                latest = db.scalar(
                    select(PacketRow)
                    .where(PacketRow.device_id == device["id"])
                    .order_by(PacketRow.sequence.desc())
                    .limit(1)
                )
                next_sequences[device["id"]] = latest.sequence + 1 if latest else 0
                if (
                    latest
                    and latest.raw.get("run_id") == control.run_id
                    and latest.raw.get("model_state")
                ):
                    checkpoints[latest.raw["astronaut_id"]] = latest.raw["model_state"]
            return RuntimeState(
                control=control,
                crew=[CrewMember(**crew) for crew in CREW],
                checkpoints=checkpoints,
                next_sequences=next_sequences,
                pending_examinations=[
                    Examination(**r.data)
                    for r in ops.records(db, "examination")
                    if r.data["status"] == "ACQUIRING"
                ],
            )

    @router.post("/demo/heartbeat", response_model=SimulatorControl, dependencies=[Depends(worker)])
    async def heartbeat(message: WorkerHeartbeat):
        with sessions() as db:
            ops.heartbeat(db, message.run_id, message.revision, message.state)
            return ops.control_state(db)

    @router.get("/examinations", response_model=list[Examination])
    async def examinations():
        with sessions() as db:
            ops.expire_examinations(db)
            return [r.data for r in ops.records(db, "examination")][-200:][::-1]

    @router.post("/examinations", response_model=Examination, dependencies=[Depends(operator)])
    async def create_examination(request: ExamRequest):
        with sessions() as db:
            ops.expire_examinations(db)
            control = ops.control_state(db)
            live = (
                service.device(
                    db, datetime.now(UTC), f"DEMO-SUIT-{request.astronaut_id[-3:]}"
                ).status
                == "LIVE"
            )
            SimulatedAdapter(request.device_id).acquire(request, live and control.running)
            if any(
                r.data["status"] == "ACQUIRING" and r.astronaut_id == request.astronaut_id
                for r in ops.records(db, "examination")
            ):
                raise HTTPException(409, "This crew already has an acquisition in progress")
            exam = Examination(
                id=f"demo-exam-{uuid4().hex}",
                **request.model_dump(),
                status="ACQUIRING",
                started_at=datetime.now(UTC),
            )
            ops.insert(db, "examination", exam.model_dump(mode="json"), exam.astronaut_id)
            db.commit()
            return exam

    @router.post(
        "/examinations/{exam_id}/actions",
        response_model=Examination,
        dependencies=[Depends(operator)],
    )
    async def examination_action(exam_id: str, action: ExamAction):
        with sessions() as db:
            row = ops.get_record(db, exam_id, "examination")
            if action.action == "SAVE":
                if row.data["status"] == "SAVED":
                    return row.data
                if row.data["status"] != "REVIEW":
                    raise HTTPException(409, "Only a reviewed acquisition can be saved")
                row.data = row.data | {
                    "status": "SAVED",
                    "saved_at": ops.now_iso(),
                    "note": action.note,
                }
            else:
                if row.data["status"] not in ("ACQUIRING", "REVIEW"):
                    raise HTTPException(409, "This examination can no longer be cancelled")
                row.data = row.data | {"status": SimulatedAdapter(row.data["device_id"]).stop()}
            db.commit()
            return row.data

    @router.post(
        "/alerts/{alert_id}/acknowledge", response_model=Alert, dependencies=[Depends(operator)]
    )
    async def acknowledge(alert_id: int):
        with sessions() as db:
            row = db.get(AlertRow, alert_id)
            if not row:
                raise HTTPException(404, "Unknown alert")
            if row.state != "ACKNOWLEDGED":
                row.state, row.acknowledged_at, row.acknowledged_by = (
                    "ACKNOWLEDGED",
                    datetime.now(UTC),
                    "DEMO-OPERATOR",
                )
                db.commit()
            return service.alert(db, row, datetime.now(UTC))

    @router.post("/nutrition/meals", response_model=Meal, dependencies=[Depends(operator)])
    async def log_meal(request: MealRequest):
        with sessions() as db:
            food = ops.get_record(db, request.food_id, "inventory")
            if food.data["servings"] < request.servings:
                raise HTTPException(409, "Insufficient inventory servings")
            nutrients = {
                key: round(food.data[key] * request.servings, 2)
                for key in ("kcal", "protein_g", "carbohydrate_g", "fat_g", "fiber_g")
            }
            meal = Meal(
                id=f"demo-meal-{uuid4().hex}",
                **request.model_dump(),
                food_name=food.data["name"],
                logged_at=datetime.now(UTC),
                **nutrients,
            )
            food.data = food.data | {"servings": food.data["servings"] - request.servings}
            ops.insert(db, "meal", meal.model_dump(mode="json"), request.astronaut_id)
            db.commit()
            return meal

    @router.post(
        "/fitness/sessions", response_model=FitnessSession, dependencies=[Depends(operator)]
    )
    async def start_fitness(request: FitnessRequest):
        with sessions() as db:
            if any(r.data["status"] == "ACTIVE" for r in ops.records(db, "fitness")):
                raise HTTPException(409, "Finish the current exercise demo before starting another")
            control = ops.control_state(db)
            if not control.running:
                raise HTTPException(409, "Resume the simulator before starting exercise")
            session = FitnessSession(
                id=f"demo-fitness-{uuid4().hex}",
                **request.model_dump(),
                status="ACTIVE",
                started_at=datetime.now(UTC),
            )
            ops.insert(db, "fitness", session.model_dump(mode="json"), request.astronaut_id)
            ops.change_control(
                db,
                ControlCommand(
                    action="CONFIGURE",
                    scenario="EXERCISE",
                    astronaut_id=request.astronaut_id,
                    fault="NONE",
                    expected_revision=control.revision,
                ),
            )
            return session

    @router.post(
        "/fitness/sessions/{session_id}/finish",
        response_model=FitnessSession,
        dependencies=[Depends(operator)],
    )
    async def finish_fitness(session_id: str):
        with sessions() as db:
            row = ops.get_record(db, session_id, "fitness")
            if row.data["status"] != "ACTIVE":
                return row.data
            now = datetime.now(UTC)
            rows = db.scalars(
                select(ObservationRow)
                .join(PacketRow)
                .where(
                    PacketRow.raw["astronaut_id"].as_string() == row.astronaut_id,
                    PacketRow.received_at >= datetime.fromisoformat(row.data["started_at"]),
                )
            )
            values = [
                r.data["value"]
                for r in rows
                if r.data["code"] == "heart_rate" and r.data["quality"] == "VALID"
            ]
            row.data = row.data | {
                "status": "COMPLETED",
                "completed_at": now.isoformat(),
                "duration_seconds": (
                    now - datetime.fromisoformat(row.data["started_at"])
                ).total_seconds(),
                "peak_heart_rate": max(values) if values else None,
            }
            control = ops.control_state(db)
            ops.change_control(
                db,
                ControlCommand(
                    action="CONFIGURE",
                    scenario="RECOVERY",
                    astronaut_id=row.astronaut_id,
                    fault="NONE",
                    expected_revision=control.revision,
                ),
            )
            return row.data

    @router.post("/eva/sessions", response_model=EvaSession, dependencies=[Depends(operator)])
    async def create_eva(request: CrewRequest):
        with sessions() as db:
            if any(
                r.astronaut_id == request.astronaut_id and r.data["status"] != "COMPLETED"
                for r in ops.records(db, "eva")
            ):
                raise HTTPException(409, "This crew already has an EVA demo in progress")
            now = datetime.now(UTC)
            steps = [
                "Confirm synthetic crew identity",
                "Inspect virtual instrument connectivity",
                "Review simulated suit readings",
                "Verify demonstration communications",
                "Confirm demo timeline",
            ]
            session = EvaSession(
                id=f"demo-eva-{uuid4().hex}",
                astronaut_id=request.astronaut_id,
                status="PREPARATION",
                created_at=now,
                checklist=[{"id": f"step-{i}", "label": step} for i, step in enumerate(steps)],
                timeline=[{"at": now, "description": "EVA demonstration prepared"}],
            )
            ops.insert(db, "eva", session.model_dump(mode="json"), request.astronaut_id)
            db.commit()
            return session

    @router.post(
        "/eva/sessions/{session_id}/actions",
        response_model=EvaSession,
        dependencies=[Depends(operator)],
    )
    async def eva_action(session_id: str, action: EvaAction):
        with sessions() as db:
            row = ops.get_record(db, session_id, "eva")
            data = EvaSession(**row.data)
            now = datetime.now(UTC)
            if action.action == "CHECK":
                if data.status != "PREPARATION":
                    raise HTTPException(409, "Checklist is locked once the demonstration starts")
                step = next((item for item in data.checklist if item.id == action.step_id), None)
                if step is None:
                    raise HTTPException(422, "Unknown checklist step")
                step.complete = action.complete
                description = f"{step.label}: {'checked' if action.complete else 'unchecked'}"
            elif action.action == "START":
                if data.status != "PREPARATION" or not all(
                    item.complete for item in data.checklist
                ):
                    raise HTTPException(409, "Complete the preparation checklist before starting")
                if service.device(db, now, f"DEMO-SUIT-{data.astronaut_id[-3:]}").status != "LIVE":
                    raise HTTPException(409, "Live simulated suit telemetry is required")
                data.status, data.started_at = "ACTIVE", now
                description = "EVA demonstration started (no physical controls)"
            else:
                if data.status != "ACTIVE":
                    raise HTTPException(409, "Only an active demonstration can be completed")
                data.status, data.completed_at = "COMPLETED", now
                description = "EVA demonstration completed"
            data.timeline.append(EvaEvent(at=now, description=description))
            # Revalidate nested timeline entries before persistence.
            row.data = EvaSession.model_validate(data.model_dump()).model_dump(mode="json")
            db.commit()
            return row.data

    @router.post("/tasks/{task_id}/complete", response_model=Task, dependencies=[Depends(operator)])
    async def complete_task(task_id: str):
        with sessions() as db:
            row = ops.get_record(db, task_id, "task")
            row.data = row.data | {"status": "COMPLETE"}
            db.commit()
            return row.data

    return router
