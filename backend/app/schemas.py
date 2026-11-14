from datetime import datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from .registry import CREW_IDS, DEVICE_MAP, UNITS

Scenario = Literal[
    "REST",
    "EXERCISE",
    "RECOVERY",
    "ANOMALY",
    "EXAMINATION",
    "normal",
    "oxygen_drop_demo",
    "pressure_anomaly_demo",
    "simultaneous_demo",
]
Freshness = Literal["LIVE", "STALE", "DISCONNECTED", "NOT_AVAILABLE", "HISTORICAL", "IDLE", "ERROR"]
MeasurementCode = Literal[
    "heart_rate",
    "respiratory_rate",
    "spo2",
    "suit_pressure",
    "systolic_bp",
    "diastolic_bp",
    "wbc",
    "hemoglobin",
    "bone_density",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Measurement(StrictModel):
    code: MeasurementCode
    value: float = Field(strict=True, allow_inf_nan=False)
    unit: str
    quality: Literal["VALID", "INVALID"]

    @model_validator(mode="after")
    def canonical(self):
        if self.unit != UNITS[self.code]:
            raise ValueError(f"{self.code} requires unit {UNITS[self.code]}")
        # Representation bounds, NOT clinical thresholds.
        ceiling = 100 if self.code == "spo2" else 1000
        if not 0 <= self.value <= ceiling:
            raise ValueError("value outside documented representation bounds")
        return self


class PhysiologyState(StrictModel):
    deceased: bool = False
    seed: int = Field(ge=0, le=9_007_199_254_740_991)
    crew_index: int = Field(ge=0, le=2)
    ticks: int = Field(ge=0, le=9_007_199_254_740_991)
    heart_rate: float = Field(ge=0, le=1000, allow_inf_nan=False)
    respiratory_rate: float = Field(ge=0, le=1000, allow_inf_nan=False)
    spo2: float = Field(ge=0, le=100, allow_inf_nan=False)
    suit_pressure: float = Field(ge=0, le=1000, allow_inf_nan=False)
    systolic_bp: float = Field(default=118, ge=0, le=1000, allow_inf_nan=False)
    diastolic_bp: float = Field(default=76, ge=0, le=1000, allow_inf_nan=False)
    ecg_phase: float = Field(ge=0, le=1, allow_inf_nan=False)
    activity: Literal["REST", "EXERCISE", "RECOVERY", "ANOMALY"]


class Waveform(StrictModel):
    sample_rate_hz: Literal[125] = 125
    start_simulated_at: float = Field(ge=0, allow_inf_nan=False)
    unit: Literal["mV"] = "mV"
    lead: Literal["DEMO-II"] = "DEMO-II"
    samples: list[Annotated[float, Field(strict=True, allow_inf_nan=False, ge=-10, le=10)]] = Field(
        min_length=1, max_length=10000
    )

    @model_validator(mode="after")
    def finite_samples(self):
        import math

        if not all(math.isfinite(value) and -10 <= value <= 10 for value in self.samples):
            raise ValueError("ECG samples must be finite fixture values")
        return self


class TelemetryPacket(StrictModel):
    schema_version: Literal["1.0"]
    event_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    sequence: int = Field(ge=0, le=9_223_372_036_854_775_807, strict=True)
    observed_at: AwareDatetime
    astronaut_id: str
    device_id: str
    source_type: Literal["SIMULATED"]
    scenario_id: Scenario
    measurements: list[Measurement] = Field(min_length=1, max_length=9)
    run_id: str = Field(default="legacy", max_length=100)
    revision: int = Field(default=0, ge=0)
    simulated_at: float = Field(default=0, ge=0, allow_inf_nan=False)
    model_state: PhysiologyState | None = None
    waveform: Waveform | None = None
    examination_id: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def unique_codes(self):
        codes = [item.code for item in self.measurements]
        if len(set(codes)) != len(codes):
            raise ValueError("duplicate measurement codes")
        device = DEVICE_MAP.get(self.device_id)
        if self.astronaut_id not in CREW_IDS or device is None:
            raise ValueError("Unknown synthetic crew or instrument")
        if device["astronaut_id"] is not None and device["astronaut_id"] != self.astronaut_id:
            raise ValueError("Device-to-crew association does not match")
        if not set(codes).issubset(device["capabilities"]):
            raise ValueError("Measurement is not supported by this instrument")
        if device["kind"] != "CONTINUOUS" and not self.examination_id:
            raise ValueError("Event-based measurements require an examination")
        if self.waveform and device["kind"] != "CONTINUOUS":
            raise ValueError("ECG waveform requires a continuous simulator instrument")
        if self.model_state and self.model_state.crew_index != int(self.astronaut_id[-1]) - 1:
            raise ValueError("Model state belongs to a different crew member")
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
    role: str = "Commander"
    initials: str = "AM"
    baseline: dict[str, float] = Field(default_factory=dict)


class Observation(Measurement):
    deceased: bool = False
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
    examination_id: str | None = None
    run_id: str = "legacy"
    simulated_at: float = 0


class Device(StrictModel):
    id: str = "DEMO-SUIT-001"
    model: str = "Rust virtual telemetry instrument"
    astronaut_id: str | None = "DEMO-CREW-001"
    source_type: Literal["SIMULATED"] = "SIMULATED"
    capabilities: list[str] = Field(default_factory=lambda: list(UNITS))
    calibration: Literal["CALIBRATION_UNKNOWN"] = "CALIBRATION_UNKNOWN"
    status: Freshness
    last_seen: datetime | None
    kind: str = "CONTINUOUS"
    firmware: str = "sim-model-v2"
    last_error: str | None = None
    calibration_note: str = "Synthetic fixture; no physical calibration certificate"


class Alert(StrictModel):
    id: int
    priority: Literal[1, 2]
    severity: Literal["CRITICAL_DEMO", "WARNING_DEMO"]
    state: Literal["PENDING_REVIEW", "ACKNOWLEDGED"] = "PENDING_REVIEW"
    rule_id: str
    rule_version: str = "demo-fixture-v2"
    message: str
    event_id: str
    device_id: str
    astronaut_id: str
    occurred_at: datetime
    source_type: Literal["SIMULATED"] = "SIMULATED"
    evidence: list[Observation]
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None


class WaveformReading(StrictModel):
    event_id: str
    astronaut_id: str
    device_id: str
    observed_at: datetime
    received_at: datetime
    source_type: Literal["SIMULATED"] = "SIMULATED"
    quality: Literal["VALID", "INVALID"] = "VALID"
    freshness: Freshness
    run_id: str
    waveform: Waveform


class IngestResult(StrictModel):
    event_id: str
    duplicate: bool
    sequence_gap: bool
    observations: list[Observation]
    alerts: list[Alert]
