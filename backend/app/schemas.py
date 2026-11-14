from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

UNITS = {"heart_rate": "beats/min", "spo2": "%", "suit_pressure": "kPa"}
Scenario = Literal["normal", "oxygen_drop_demo", "pressure_anomaly_demo", "simultaneous_demo"]
Freshness = Literal["LIVE", "STALE", "DISCONNECTED", "NOT_AVAILABLE", "HISTORICAL"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Measurement(StrictModel):
    code: Literal["heart_rate", "spo2", "suit_pressure"]
    value: float = Field(strict=True, allow_inf_nan=False)
    unit: str
    quality: Literal["VALID", "INVALID"]

    @model_validator(mode="after")
    def canonical(self):
        if self.unit != UNITS[self.code]:
            raise ValueError(f"{self.code} requires unit {UNITS[self.code]}")
        # Representation bounds, NOT clinical thresholds.
        ceiling = {"heart_rate": 1000, "spo2": 100, "suit_pressure": 1000}[self.code]
        if not 0 <= self.value <= ceiling:
            raise ValueError("value outside documented representation bounds")
        return self


class TelemetryPacket(StrictModel):
    schema_version: Literal["1.0"]
    event_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    sequence: int = Field(ge=0, le=9_223_372_036_854_775_807, strict=True)
    observed_at: AwareDatetime
    astronaut_id: Literal["DEMO-CREW-001"]
    device_id: Literal["DEMO-SUIT-001"]
    source_type: Literal["SIMULATED"]
    scenario_id: Scenario
    measurements: list[Measurement] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def unique_codes(self):
        codes = [item.code for item in self.measurements]
        if len(set(codes)) != len(codes):
            raise ValueError("duplicate measurement codes")
        return self


class Health(StrictModel):
    status: Literal["ok"] = "ok"
    version: str = "0.1.0"
    mode: Literal["DEMO"] = "DEMO"
    server_time: datetime
    stale_seconds: int
    disconnect_seconds: int


class CrewMember(StrictModel):
    id: str = "DEMO-CREW-001"
    display_name: str = "Alex Morgan (synthetic)"
    mission_id: str = "DEMO-MISSION-001"
    source_type: Literal["SIMULATED"] = "SIMULATED"


class Observation(Measurement):
    id: int
    event_id: str
    sequence: int
    observed_at: datetime
    received_at: datetime
    astronaut_id: str
    device_id: str
    source_type: Literal["SIMULATED"] = "SIMULATED"
    scenario_id: Scenario
    freshness: Freshness
    sequence_gap: bool


class Device(StrictModel):
    id: str = "DEMO-SUIT-001"
    model: str = "Rust virtual telemetry instrument"
    astronaut_id: str = "DEMO-CREW-001"
    source_type: Literal["SIMULATED"] = "SIMULATED"
    capabilities: list[str] = Field(default_factory=lambda: list(UNITS))
    calibration: Literal["CALIBRATION_UNKNOWN"] = "CALIBRATION_UNKNOWN"
    status: Freshness
    last_seen: datetime | None


class Alert(StrictModel):
    id: int
    priority: Literal[1, 2]
    severity: Literal["CRITICAL_DEMO", "WARNING_DEMO"]
    state: Literal["PENDING_REVIEW"] = "PENDING_REVIEW"
    rule_id: str
    rule_version: Literal["demo-fixture-v1"] = "demo-fixture-v1"
    message: str
    event_id: str
    device_id: str
    astronaut_id: str
    occurred_at: datetime
    source_type: Literal["SIMULATED"] = "SIMULATED"
    evidence: list[Observation]


class IngestResult(StrictModel):
    event_id: str
    duplicate: bool
    sequence_gap: bool
    observations: list[Observation]
    alerts: list[Alert]
