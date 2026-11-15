import secrets
from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, select

from . import operations as ops
from .config import is_trusted_origin
from .database import AlertRow, ObservationRow, PacketRow, RecordRow
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
    ExaminationPlan,
    ExaminationPlanChange,
    ExaminationPlanRequest,
    ExamRequest,
    FitnessRequest,
    FitnessSession,
    Meal,
    MealRequest,
    MoodEntry,
    MoodRequest,
    OperationsSnapshot,
    RuntimeState,
    SimulatorControl,
    Task,
    WorkerHeartbeat,
)
from .radiation import snapshot as radiation_snapshot
from .registry import CREW, DEVICE_MAP, DEVICES
from .schemas import Alert, CrewMember


def build_operations_router(sessions, service, config):
    router = APIRouter(prefix="/api/v1")

    async def operator(request: Request):
        # Public demos deliberately retain the existing controls without login.
        # Local development continues to reject remote mutations.
        if config.deployment_profile == "local" and (
            request.client is None or request.client.host not in ("127.0.0.1", "::1")
        ):
            raise HTTPException(403, "Demo operations are restricted to localhost")
        if not is_trusted_origin(request.headers.get("origin"), config):
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

    @router.post("/moods", response_model=MoodEntry, dependencies=[Depends(operator)])
    async def record_mood(request: MoodRequest):
        now = datetime.now(UTC)
        entry = MoodEntry(
            **request.model_dump(),
            id=f"demo-mood-{request.astronaut_id}-{now.date().isoformat()}",
            recorded_at=now,
        )
        with sessions() as db:
            row = db.get(RecordRow, entry.id)
            data = entry.model_dump(mode="json")
            if row:
                row.data = data
            else:
                ops.insert(db, "mood", data, request.astronaut_id)
            db.commit()
        return entry

    @router.get("/crew/summaries", response_model=list[CrewSummary])
    async def summaries():
        with sessions() as db:
            now = datetime.now(UTC)
            result = []
            for crew in CREW:
                device_id = f"DEMO-SUIT-{crew['id'][-3:]}"
                # The latest packet contains the complete worker summary. Fetch its
                # indexed observations directly rather than aggregating all history
                # on every poll. Partial integrations retain the per-code fallback.
                latest_packet = db.scalar(
                    select(PacketRow)
                    .where(PacketRow.device_id == device_id)
                    .order_by(PacketRow.sequence.desc())
                    .limit(1)
                )
                rows = (
                    list(
                        db.scalars(
                            select(ObservationRow).where(
                                ObservationRow.event_id == latest_packet.event_id
                            )
                        )
                    )
                    if latest_packet
                    else []
                )
                missing = set(DEVICE_MAP[device_id]["capabilities"]) - {
                    row.data["code"] for row in rows
                }
                if latest_packet and missing:
                    latest_ids = (
                        select(func.max(ObservationRow.id))
                        .join(PacketRow)
                        .where(
                            PacketRow.device_id == device_id,
                            ObservationRow.data["code"].as_string().in_(missing),
                        )
                        .group_by(ObservationRow.data["code"].as_string())
                    )
                    rows.extend(
                        db.scalars(select(ObservationRow).where(ObservationRow.id.in_(latest_ids)))
                    )
                rows.sort(key=lambda row: row.id)
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
                vehicle_simulated_at=radiation_snapshot(db, config).simulated_at,
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

    @router.post(
        "/examination-plans", response_model=ExaminationPlan, dependencies=[Depends(operator)]
    )
    async def schedule_examination(request: ExaminationPlanRequest):
        plan = ExaminationPlan(
            **(request.model_dump() | {"scheduled_at": request.scheduled_at.astimezone(UTC)}),
            id=f"demo-plan-{uuid4().hex}",
        )
        with sessions() as db:
            ops.insert(db, "exam-plan", plan.model_dump(mode="json"), plan.astronaut_id)
            db.commit()
        return plan

    @router.post(
        "/examination-plans/{plan_id}",
        response_model=ExaminationPlan,
        dependencies=[Depends(operator)],
    )
    async def change_examination_plan(plan_id: str, change: ExaminationPlanChange):
        with sessions() as db:
            row = ops.get_record(db, plan_id, "exam-plan")
            if row.data["revision"] != change.expected_revision:
                raise HTTPException(409, "This plan changed. Refresh the calendar and try again.")
            if row.data["status"] == "COMPLETED":
                raise HTTPException(409, "A completed examination plan cannot be changed")
            if any(
                exam.data.get("plan_id") == plan_id
                and exam.data["status"] in ("ACQUIRING", "REVIEW")
                for exam in ops.records(db, "examination")
            ):
                raise HTTPException(409, "Cancel the active acquisition before changing this plan")
            update = {
                "revision": row.data["revision"] + 1,
                "status": "CANCELLED" if change.action == "CANCEL" else "PLANNED",
            }
            if change.scheduled_at is not None:
                update["scheduled_at"] = change.scheduled_at.astimezone(UTC).isoformat()
            if change.notes is not None:
                update["notes"] = change.notes
            row.data = row.data | update
            if row.data.get("task_id"):
                task = ops.get_record(db, row.data["task_id"], "task")
                task.data = task.data | {
                    "due_at": row.data["scheduled_at"],
                    "status": "CANCELLED" if change.action == "CANCEL" else "PENDING",
                }
            db.commit()
            return row.data

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
            if ops.crew_deceased(db, request.astronaut_id, control.run_id):
                raise HTTPException(
                    409,
                    "Crew is deceased in this run. Restart playback for new acquisitions.",
                )
            live = (
                service.device(
                    db, datetime.now(UTC), f"DEMO-SUIT-{request.astronaut_id[-3:]}"
                ).status
                == "LIVE"
            )
            SimulatedAdapter(request.device_id).acquire(request, live and control.running)
            if any(
                r.data["status"] in ("ACQUIRING", "REVIEW")
                and r.astronaut_id == request.astronaut_id
                for r in ops.records(db, "examination")
            ):
                raise HTTPException(
                    409, "This crew already has an examination in progress or awaiting review"
                )
            if request.plan_id:
                plan = ops.get_record(db, request.plan_id, "exam-plan")
                if (
                    plan.data["astronaut_id"] != request.astronaut_id
                    or plan.data["kind"] != request.kind
                    or plan.data["status"] != "PLANNED"
                ):
                    raise HTTPException(
                        409, "This plan does not match a pending examination for this crew"
                    )
                if any(
                    exam.data.get("plan_id") == request.plan_id
                    and exam.data["status"] in ("ACQUIRING", "REVIEW")
                    for exam in ops.records(db, "examination")
                ):
                    raise HTTPException(409, "This plan already has an acquisition in progress")
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
                if row.data.get("plan_id"):
                    plan = ops.get_record(db, row.data["plan_id"], "exam-plan")
                    plan.data = plan.data | {
                        "status": "COMPLETED",
                        "examination_id": exam_id,
                        "revision": plan.data["revision"] + 1,
                    }
                    if plan.data.get("task_id"):
                        task = ops.get_record(db, plan.data["task_id"], "task")
                        task.data = task.data | {"status": "COMPLETE"}
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
            if ops.crew_deceased(db, request.astronaut_id, control.run_id):
                raise HTTPException(
                    409, "Restart playback before exercising a deceased crew member"
                )
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
                    manual_values={},
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
                    PacketRow.observed_at >= datetime.fromisoformat(row.data["started_at"]),
                    PacketRow.observed_at <= now,
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
                    manual_values={},
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
                if not ops.control_state(db).running:
                    raise HTTPException(409, "Resume the simulator before starting EVA")
                if service.device(db, now, f"DEMO-SUIT-{data.astronaut_id[-3:]}").status != "LIVE":
                    raise HTTPException(409, "Live simulated suit telemetry is required")
                if ops.crew_deceased(db, data.astronaut_id, ops.control_state(db).run_id):
                    raise HTTPException(
                        409, "Restart playback before starting EVA for a deceased crew member"
                    )
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
            if row.data["status"] == "CANCELLED":
                raise HTTPException(
                    409, "Reschedule the cancelled examination before completing this task"
                )
            if any(
                plan.data.get("task_id") == task_id and plan.data["status"] != "COMPLETED"
                for plan in ops.records(db, "exam-plan")
            ):
                raise HTTPException(409, "Review and save the examination to complete this task")
            row.data = row.data | {"status": "COMPLETE"}
            db.commit()
            return row.data

    return router
