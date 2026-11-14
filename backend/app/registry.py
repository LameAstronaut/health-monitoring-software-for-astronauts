"""Synthetic catalog only. No physical instrument or real identity is registered."""

CREW = [
    {
        "id": "DEMO-CREW-001",
        "display_name": "Alex Morgan",
        "role": "Commander",
        "initials": "AM",
        "baseline": {
            "heart_rate": 68.0,
            "systolic_bp": 118.0,
            "diastolic_bp": 76.0,
            "respiratory_rate": 13.0,
            "spo2": 98.2,
            "suit_pressure": 30.0,
        },
    },
    {
        "id": "DEMO-CREW-002",
        "display_name": "Jordan Lee",
        "role": "Flight engineer",
        "initials": "JL",
        "baseline": {
            "heart_rate": 72.0,
            "systolic_bp": 120.0,
            "diastolic_bp": 77.0,
            "respiratory_rate": 14.0,
            "spo2": 98.2,
            "suit_pressure": 30.0,
        },
    },
    {
        "id": "DEMO-CREW-003",
        "display_name": "Sam Rivera",
        "role": "Crew medical officer",
        "initials": "SR",
        "baseline": {
            "heart_rate": 64.0,
            "systolic_bp": 122.0,
            "diastolic_bp": 78.0,
            "respiratory_rate": 12.0,
            "spo2": 98.2,
            "suit_pressure": 30.0,
        },
    },
]
CREW_IDS = {item["id"] for item in CREW}
UNITS = {
    "heart_rate": "beats/min",
    "respiratory_rate": "breaths/min",
    "spo2": "%",
    "suit_pressure": "kPa",
    "systolic_bp": "mmHg",
    "diastolic_bp": "mmHg",
    "wbc": "10^9/L",
    "hemoglobin": "g/dL",
    "bone_density": "g/cm2",
}
EXAM_CODES = {
    "BLOOD_PRESSURE": ["systolic_bp", "diastolic_bp"],
    "LAB_PANEL": ["wbc", "hemoglobin"],
    "BONE_DENSITY": ["bone_density"],
}
EXAM_DEVICES = {
    "BLOOD_PRESSURE": "DEMO-BP-001",
    "LAB_PANEL": "DEMO-LAB-001",
    "BONE_DENSITY": "DEMO-DXA-001",
}
DEVICES = [
    {
        "id": f"DEMO-SUIT-00{i + 1}",
        "model": "Virtual physiology / suit monitor",
        "astronaut_id": member["id"],
        "capabilities": list(UNITS)[:6],
        "kind": "CONTINUOUS",
    }
    for i, member in enumerate(CREW)
] + [
    {
        "id": device,
        "model": {
            "BLOOD_PRESSURE": "Virtual blood pressure cuff",
            "LAB_PANEL": "Synthetic laboratory report",
            "BONE_DENSITY": "Synthetic bone-density report",
        }[kind],
        "astronaut_id": None,
        "capabilities": EXAM_CODES[kind],
        "kind": kind,
    }
    for kind, device in EXAM_DEVICES.items()
]
DEVICE_MAP = {item["id"]: item for item in DEVICES}


def crew_member(crew_id: str):
    return next((item for item in CREW if item["id"] == crew_id), None)
