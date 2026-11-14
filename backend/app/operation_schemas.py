from datetime import datetime
from typing import Literal

from pydantic import Field

from .schemas import CrewMember, Measurement, Observation, PhysiologyState, StrictModel

CrewId = Literal["DEMO-CREW-001", "DEMO-CREW-002", "DEMO-CREW-003"]
Activity = Literal["REST", "EXERCISE", "RECOVERY", "ANOMALY"]
Fault = Literal[
    "NONE",
    "OXYGEN",
    "PRESSURE",
    "BOTH",
    "PULSE_SURGE",
    "PULSE_DECREASE",
    "RESPIRATORY_SURGE",
    "MULTI_SYSTEM",
    "DISCONNECT",
    "SENSOR_ERROR",
]
ExamKind = Literal["BLOOD_PRESSURE", "LAB_PANEL", "BONE_DENSITY", "BODY_TEMPERATURE"]


class ManualValues(StrictModel):
    heart_rate: float | None = Field(default=None, ge=0, le=1000, allow_inf_nan=False)
    respiratory_rate: float | None = Field(default=None, ge=0, le=1000, allow_inf_nan=False)
    spo2: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    suit_pressure: float | None = Field(default=None, ge=0, le=1000, allow_inf_nan=False)
    systolic_bp: float | None = Field(default=None, ge=0, le=1000, allow_inf_nan=False)
    diastolic_bp: float | None = Field(default=None, ge=0, le=1000, allow_inf_nan=False)
    sleep_duration: float | None = Field(default=None, ge=0, le=24, allow_inf_nan=False)


class SimulatorControl(StrictModel):
    manual_values: ManualValues = Field(default_factory=ManualValues)
    scenario: Activity = "REST"
    astronaut_id: CrewId = "DEMO-CREW-001"
    running: bool = True
    speed: Literal[0.25, 0.5, 1, 2, 4] = 1
    seed: int = Field(default=42, ge=0, le=4_294_967_295)
    fault: Fault = "NONE"
    revision: int = 0
    run_id: str
    worker_seen: datetime | None = None
    worker_revision: int = -1
    worker_state: str = "NOT_AVAILABLE"
    simulated_at: float = 0
    source_type: Literal["SIMULATED"] = "SIMULATED"


class ControlCommand(StrictModel):
    manual_values: ManualValues | None = None
    action: Literal["CONFIGURE", "PAUSE", "RESUME", "RESTART"]
    scenario: Activity | None = None
    astronaut_id: CrewId | None = None
    speed: Literal[0.25, 0.5, 1, 2, 4] | None = None
    seed: int | None = Field(default=None, ge=0, le=4_294_967_295)
    fault: Fault | None = None
    expected_revision: int = Field(ge=0)


class WorkerHeartbeat(StrictModel):
    run_id: str
    revision: int = Field(ge=0)
    state: Literal["RUNNING", "PAUSED", "DISCONNECTED"]
    source_type: Literal["SIMULATED"] = "SIMULATED"


class ExamRequest(StrictModel):
    astronaut_id: CrewId
    kind: ExamKind
    device_id: str


class Examination(StrictModel):
    id: str
    astronaut_id: CrewId
    kind: ExamKind
    device_id: str
    status: Literal["ACQUIRING", "REVIEW", "SAVED", "CANCELLED", "FAILED"]
    started_at: datetime
    acquired_at: datetime | None = None
    saved_at: datetime | None = None
    results: list[Measurement] = Field(default_factory=list)
    event_id: str | None = None
    note: str = ""
    error: str | None = None
    source_type: Literal["SIMULATED"] = "SIMULATED"


class ExamAction(StrictModel):
    action: Literal["SAVE", "CANCEL"]
    note: str = Field(default="", max_length=2000)


class InventoryItem(StrictModel):
    id: str
    name: str
    servings: float
    kcal: float
    protein_g: float
    carbohydrate_g: float
    fat_g: float
    fiber_g: float
    expires_at: str
    source_type: Literal["SIMULATED"] = "SIMULATED"


class MealRequest(StrictModel):
    astronaut_id: CrewId
    food_id: str
    servings: float = Field(ge=0.25, le=5, allow_inf_nan=False)


class Meal(StrictModel):
    id: str
    astronaut_id: CrewId
    food_id: str
    food_name: str
    servings: float
    kcal: float
    protein_g: float
    carbohydrate_g: float
    fat_g: float
    fiber_g: float
    logged_at: datetime
    source_type: Literal["SIMULATED"] = "SIMULATED"


class FitnessRequest(StrictModel):
    astronaut_id: CrewId
    activity: Literal["CYCLE", "TREADMILL", "RESISTANCE"]
    planned_minutes: int = Field(ge=1, le=120)


class FitnessSession(FitnessRequest):
    id: str
    status: Literal["ACTIVE", "COMPLETED"]
    started_at: datetime
    completed_at: datetime | None = None
    duration_seconds: float = 0
    peak_heart_rate: float | None = None
    source_type: Literal["SIMULATED"] = "SIMULATED"


class CrewRequest(StrictModel):
    astronaut_id: CrewId


class ChecklistItem(StrictModel):
    id: str
    label: str
    complete: bool = False


class EvaEvent(StrictModel):
    at: datetime
    description: str


class EvaSession(StrictModel):
    id: str
    astronaut_id: CrewId
    status: Literal["PREPARATION", "ACTIVE", "COMPLETED"]
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    checklist: list[ChecklistItem]
    timeline: list[EvaEvent]
    source_type: Literal["SIMULATED"] = "SIMULATED"


class EvaAction(StrictModel):
    action: Literal["CHECK", "START", "COMPLETE"]
    step_id: str | None = None
    complete: bool = True


class Task(StrictModel):
    id: str
    astronaut_id: CrewId
    title: str
    due_at: datetime
    status: Literal["PENDING", "COMPLETE"] = "PENDING"
    destination: Literal["Examinations", "Fitness", "Nutrition"]
    source_type: Literal["SIMULATED"] = "SIMULATED"


class MoodRequest(StrictModel):
    astronaut_id: CrewId
    score: int = Field(strict=True, ge=1, le=3)


class MoodEntry(MoodRequest):
    id: str
    recorded_at: datetime
    source_type: Literal["SIMULATED"] = "SIMULATED"


class OperationsSnapshot(StrictModel):
    moods: list[MoodEntry] = Field(default_factory=list)
    control: SimulatorControl
    examinations: list[Examination]
    inventory: list[InventoryItem]
    meals: list[Meal]
    fitness: list[FitnessSession]
    eva: list[EvaSession]
    tasks: list[Task]


class RuntimeState(StrictModel):
    control: SimulatorControl
    crew: list[CrewMember]
    checkpoints: dict[str, PhysiologyState]
    next_sequences: dict[str, int]
    pending_examinations: list[Examination]


class CrewSummary(StrictModel):
    crew: CrewMember
    readings: list[Observation]
