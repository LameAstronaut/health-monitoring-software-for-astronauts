export const EXAM_TYPES = [
  {
    kind: "BLOOD_PRESSURE",
    label: "Blood pressure",
    device: "DEMO-BP-001",
    description: "Event-based cuff fixture · systolic / diastolic",
  },
  {
    kind: "LAB_PANEL",
    label: "Laboratory panel",
    device: "DEMO-LAB-001",
    description: "Synthetic report · WBC / hemoglobin",
  },
  {
    kind: "BONE_DENSITY",
    label: "Bone density",
    device: "DEMO-DXA-001",
    description: "Synthetic report · bone mineral density",
  },
  {
    kind: "BODY_TEMPERATURE",
    label: "Body temperature",
    device: "DEMO-TEMP-001",
    description: "Event-based thermometer fixture · degrees Celsius",
  },
] as const;
