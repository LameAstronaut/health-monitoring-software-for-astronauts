import asyncio
import secrets
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from .config import Settings
from .database import AlertRow, ObservationRow, PacketRow, connect
from .operations import initialize
from .operations_api import build_operations_router
from .registry import CREW, CREW_IDS, DEVICES
from .schemas import (
    Alert,
    CrewMember,
    Device,
    Health,
    IngestResult,
    Observation,
    TelemetryPacket,
    WaveformReading,
)
from .service import TelemetryService


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    engine, sessions = connect(config.database_url)
    service = TelemetryService(config)
    subscribers: set[asyncio.Queue] = set()
    ingest_lock = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Fail clearly if migrations were not applied. Never erase or silently replace storage.
        with engine.connect() as conn:
            conn.execute(text("SELECT event_id FROM packets LIMIT 1"))
        with sessions() as db:
            initialize(db)
        yield
        engine.dispose()

    app = FastAPI(title="ASTRA HEALTH — SIMULATED", version="0.1.0", lifespan=lifespan)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, exc: RequestValidationError):
        # Do not reflect medical-style inputs or non-JSON NaN/Infinity in error responses.
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
                    for error in exc.errors()
                ]
            },
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[config.allowed_origin],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Demo-Token"],
    )
    app.include_router(build_operations_router(sessions, service, config))

    @app.get("/api/v1/health", response_model=Health)
    async def health():
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return Health(
            server_time=datetime.now(UTC),
            stale_seconds=config.stale_seconds,
            disconnect_seconds=config.disconnect_seconds,
        )

    @app.get("/api/v1/crew", response_model=list[CrewMember])
    async def crew():
        return [CrewMember(**member) for member in CREW]

    @app.get("/api/v1/devices", response_model=list[Device])
    async def devices():
        with sessions() as db:
            return [service.device(db, datetime.now(UTC), device["id"]) for device in DEVICES]

    @app.get("/api/v1/observations", response_model=list[Observation])
    async def observations(
        astronaut_id: str = "DEMO-CREW-001", limit: Annotated[int, Query(ge=1, le=2400)] = 600
    ):
        if astronaut_id not in CREW_IDS:
            raise HTTPException(404, "Unknown demo crew")
        with sessions() as db:
            rows = list(
                db.scalars(
                    select(ObservationRow)
                    .join(PacketRow)
                    .where(PacketRow.raw["astronaut_id"].as_string() == astronaut_id)
                    .order_by(ObservationRow.id.desc())
                    .limit(limit)
                )
            )
            now = datetime.now(UTC)
            return [service.observation(db, row, now) for row in reversed(rows)]

    @app.get("/api/v1/waveforms", response_model=list[WaveformReading])
    async def waveforms(astronaut_id: str = "DEMO-CREW-001"):
        if astronaut_id not in CREW_IDS:
            raise HTTPException(404, "Unknown demo crew")
        with sessions() as db:
            rows = db.scalars(
                select(PacketRow)
                .where(
                    PacketRow.raw["astronaut_id"].as_string() == astronaut_id,
                    PacketRow.raw["waveform"].is_not(None),
                )
                .order_by(PacketRow.received_at.desc())
                .limit(8)
            )
            return [
                service.waveform(db, row, datetime.now(UTC))
                for row in reversed(list(rows))
                if row.raw.get("waveform")
            ]

    @app.get("/api/v1/alerts", response_model=list[Alert])
    async def alerts(limit: Annotated[int, Query(ge=1, le=500)] = 100):
        with sessions() as db:
            rows = db.scalars(
                select(AlertRow).order_by(AlertRow.priority, AlertRow.id.desc()).limit(limit)
            )
            return [service.alert(db, row, datetime.now(UTC)) for row in rows]

    @app.post("/api/v1/telemetry", response_model=IngestResult)
    async def telemetry(
        packet: TelemetryPacket, x_demo_token: Annotated[str | None, Header()] = None
    ):
        if not secrets.compare_digest((x_demo_token or "").encode(), config.demo_token.encode()):
            raise HTTPException(401, "A valid X-Demo-Token is required")
        async with ingest_lock:
            with sessions() as db:
                try:
                    result = service.ingest(db, packet, datetime.now(UTC))
                except SQLAlchemyError as exc:
                    db.rollback()
                    raise HTTPException(
                        503, "Storage unavailable; packet was not published"
                    ) from exc
            if not result.duplicate:
                for queue in list(subscribers):
                    if (
                        queue.qsize() + len(result.observations) + len(result.alerts) + 1
                        > queue.maxsize
                    ):
                        # Bound memory. Slow clients are closed and must resnapshot.
                        while not queue.empty():
                            queue.get_nowait()
                        queue.put_nowait({"type": "resync.required"})
                        subscribers.discard(queue)
                    else:
                        for observation in result.observations:
                            queue.put_nowait(
                                {
                                    "type": "telemetry.observation",
                                    "data": observation.model_dump(mode="json"),
                                }
                            )
                        for alert in result.alerts:
                            queue.put_nowait(
                                {"type": "alert.created", "data": alert.model_dump(mode="json")}
                            )
                        if packet.waveform:
                            with sessions() as db:
                                stored = db.get(PacketRow, packet.event_id)
                                queue.put_nowait(
                                    {
                                        "type": "telemetry.waveform",
                                        "data": service.waveform(
                                            db, stored, datetime.now(UTC)
                                        ).model_dump(mode="json"),
                                    }
                                )
            return result

    @app.websocket("/api/v1/stream")
    async def stream(ws: WebSocket):
        if ws.headers.get("origin") not in (None, config.allowed_origin):
            await ws.close(code=1008)
            return
        await ws.accept()
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        subscribers.add(queue)
        try:
            while True:
                with sessions() as db:
                    devices = [
                        service.device(db, datetime.now(UTC), item["id"]) for item in DEVICES
                    ]
                await ws.send_json(
                    {"type": "system.status", "data": (await health()).model_dump(mode="json")}
                )
                for device in devices:
                    await ws.send_json(
                        {"type": "device.status", "data": device.model_dump(mode="json")}
                    )
                # Timeout keeps heartbeat and freshness updates flowing without packets.
                deadline = asyncio.get_running_loop().time() + 1
                while (remaining := deadline - asyncio.get_running_loop().time()) > 0:
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=remaining)
                    except TimeoutError:
                        break
                    if event["type"] == "resync.required":
                        await ws.close(code=1013, reason="Slow client: reconnect and resnapshot")
                        return
                    await ws.send_json(event)
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            subscribers.discard(queue)

    return app


app = create_app()
