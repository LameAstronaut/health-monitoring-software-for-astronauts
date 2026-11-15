"""Vehicle environmental radiation; deliberately separate from crew telemetry."""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import AwareDatetime, Field, model_validator

from .database import RecordRow
from .operations import control_state
from .schemas import Freshness, StrictModel

SENSORS = {
    "VEH-RAD-001": "Main cabin",
    "VEH-RAD-002": "Airlock",
    "VEH-RAD-003": "Radiation shelter",
}
SensorId = Literal["VEH-RAD-001", "VEH-RAD-002", "VEH-RAD-003"]


class RadiationMeasurement(StrictModel):
    sensor_id: SensorId
    dose_rate_ugy_h: float = Field(ge=0, allow_inf_nan=False)
    accumulated_dose_mgy: float = Field(ge=0, allow_inf_nan=False)


class VehicleRadiationPacket(StrictModel):
    vehicle_id: Literal["DEMO-VEHICLE-001"] = "DEMO-VEHICLE-001"
    source_type: Literal["SIMULATED"] = "SIMULATED"
    run_id: str = Field(min_length=1, max_length=100)
    revision: int = Field(ge=0)
    simulated_at: float = Field(ge=0, allow_inf_nan=False)
    observed_at: AwareDatetime
    measurements: list[RadiationMeasurement] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def all_sensors(self):
        if {m.sensor_id for m in self.measurements} != set(SENSORS):
            raise ValueError("Exactly one reading from each vehicle radiation sensor is required")
        return self


class RadiationReading(StrictModel):
    sensor_id: SensorId
    location: str
    dose_rate_ugy_h: float | None = None
    accumulated_dose_mgy: float | None = None
    observed_at: datetime | None = None
    freshness: Freshness = "NOT_AVAILABLE"


class VehicleRadiationSnapshot(StrictModel):
    vehicle_id: Literal["DEMO-VEHICLE-001"] = "DEMO-VEHICLE-001"
    source_type: Literal["SIMULATED"] = "SIMULATED"
    run_id: str
    integration_start_simulated_at: Literal[0] = 0
    simulated_at: float = 0
    readings: list[RadiationReading]


def snapshot(db, config):
    control = control_state(db)
    row = db.get(RecordRow, f"vehicle-radiation-{control.run_id}")
    packet = VehicleRadiationPacket(**row.data["packet"]) if row else None
    readings = []
    age = (datetime.now(UTC) - packet.observed_at).total_seconds() if packet else 0
    freshness = (
        "DISCONNECTED"
        if age > config.disconnect_seconds
        else "STALE"
        if age > config.stale_seconds
        else "LIVE"
    )
    for sensor_id, location in SENSORS.items():
        measurement = (
            next((m for m in packet.measurements if m.sensor_id == sensor_id), None)
            if packet
            else None
        )
        readings.append(
            RadiationReading(
                sensor_id=sensor_id,
                location=location,
                dose_rate_ugy_h=measurement.dose_rate_ugy_h if measurement else None,
                accumulated_dose_mgy=measurement.accumulated_dose_mgy if measurement else None,
                observed_at=packet.observed_at if packet else None,
                freshness=freshness if packet else "NOT_AVAILABLE",
            )
        )
    return VehicleRadiationSnapshot(
        run_id=control.run_id,
        simulated_at=packet.simulated_at if packet else 0,
        readings=readings,
    )


def build_radiation_router(sessions, config):
    router = APIRouter(prefix="/api/v1/vehicle/radiation")

    @router.get("", response_model=VehicleRadiationSnapshot)
    async def readings():
        with sessions() as db:
            return snapshot(db, config)

    @router.post("", response_model=VehicleRadiationSnapshot)
    async def ingest(
        packet: VehicleRadiationPacket,
        x_demo_token: Annotated[str | None, Header()] = None,
    ):
        if not secrets.compare_digest((x_demo_token or "").encode(), config.demo_token.encode()):
            raise HTTPException(401, "A valid X-Demo-Token is required")
        if packet.observed_at > datetime.now(UTC) + timedelta(seconds=5):
            raise HTTPException(422, "Vehicle reading timestamp is in the future")
        with sessions() as db:
            control = control_state(db)
            if packet.run_id != control.run_id or packet.revision != control.revision:
                raise HTTPException(409, "Vehicle control revision changed")
            record_id = f"vehicle-radiation-{packet.run_id}"
            row = db.get(RecordRow, record_id)
            data = packet.model_dump(mode="json")
            if row and packet.simulated_at <= row.data["packet"]["simulated_at"]:
                if data == row.data["packet"]:
                    return snapshot(db, config)
                raise HTTPException(409, "Vehicle simulation time must increase")
            if not control.running:
                raise HTTPException(409, "Vehicle simulator is paused")
            if row:
                previous = {m["sensor_id"]: m for m in row.data["packet"]["measurements"]}
                if any(
                    m.accumulated_dose_mgy < previous[m.sensor_id]["accumulated_dose_mgy"]
                    for m in packet.measurements
                ):
                    raise HTTPException(
                        409, "Accumulated vehicle dose cannot decrease within a run"
                    )
                row.data = {"packet": data}
            else:
                db.add(
                    RecordRow(
                        id=record_id,
                        kind="vehicle-radiation",
                        astronaut_id=None,
                        data={"packet": data},
                    )
                )
            db.commit()
            return snapshot(db, config)

    return router
