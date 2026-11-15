export const NASA_SOURCES = {
  medical: {
    title: "NASA-STD-3001 Vol. 1 · Health and Medical Care",
    url: "https://www.nasa.gov/reference/3-0-health-and-medical-care/",
    sections: "§§3.1, 3.4–3.5 · V1 3000, 3003, 3004",
    supports:
      "Flight Medicine team management, mission-specific medical capabilities, preventive monitoring and care.",
  },
  diagnostics: {
    title: "NASA · Crew Systems — Medical Kit",
    url: "https://www.nasa.gov/reference/crew-systems/",
    sections: "Medical Kit",
    supports:
      "Orion carries vital-sign, ECG and oximetry diagnostics. This describes equipment capability, not a treatment algorithm.",
  },
  atmosphere: {
    title: "NASA-STD-3001 Vol. 2 · Natural and Induced Environments",
    url: "https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2/",
    sections: "§§6.1–6.2 · V2 6001, 6003, 6004",
    supports:
      "Trend environmental and suit data; maintain inspired oxygen and control carbon dioxide. These are system requirements, not SpO₂ treatment targets.",
  },
  suit: {
    title: "NASA-STD-3001 Vol. 2 · Spacesuits",
    url: "https://www.nasa.gov/reference/11-0-spacesuits-vol-2/",
    sections: "§§11.1.4, 11.3.2–11.3.5 · V2 11006, 11007, 11034–11036, 11039",
    supports:
      "Maintain suit pressure set-points and monitor pressure, oxygen and carbon dioxide; alert when these exceed safe limits.",
  },
  cardiovascular: {
    title: "NASA · Risk of Cardiovascular Adaptations",
    url: "https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/",
    sections: "What can be done about it?",
    supports:
      "Regular exercise and a healthy diet help maintain cardiovascular fitness. This is long-term prevention, not treatment of an acute pulse alert.",
  },
} as const;
export type NasaSourceId = keyof typeof NASA_SOURCES;
type Step = { action: string; sources: NasaSourceId[] };
type Guidance = { focus: string; steps: Step[] };
const escalate: Step = {
  action:
    "For a real abnormal reading, involve the crew medical officer / flight surgeon and follow the mission-approved medical response. The medical team determines treatment and recovery targets.",
  sources: ["medical"],
};
const cardiacSteps: Step[] = [
  escalate,
  {
    action:
      "Have the medical team assess the heart-rate change with clinical context and available ECG, blood-pressure and oxygen measurements before choosing how to correct it.",
    sources: ["medical", "diagnostics"],
  },
  {
    action:
      "For longer-term cardiovascular fitness, follow the mission's exercise and nutrition plan. This preventive measure is not an acute treatment for a pulse alert.",
    sources: ["cardiovascular"],
  },
];
export const ALERT_GUIDANCE: Record<string, Guidance> = {
  "pulse-rise-fixture": {
    focus: "Rising heart rate: medical assessment and cause-specific recovery",
    steps: cardiacSteps,
  },
  "pulse-decrease-fixture": {
    focus: "Falling heart rate: medical assessment and cause-specific recovery",
    steps: cardiacSteps,
  },
  "respiratory-rise-fixture": {
    focus:
      "Rising breathing rate: assess the crew member and breathing environment",
    steps: [
      escalate,
      {
        action:
          "Have the medical team assess the breathing-rate change alongside available oxygen and other vital measurements; choose treatment through the mission medical procedure.",
        sources: ["medical", "diagnostics"],
      },
      {
        action:
          "Have life-support operators review oxygen, carbon dioxide and pressure trends and correct an identified environmental fault using the applicable mission procedure.",
        sources: ["atmosphere", "suit"],
      },
    ],
  },
  "oxygen-fixture": {
    focus: "Falling oxygen saturation: assess oxygenation and life support",
    steps: [
      escalate,
      {
        action:
          "Have the medical team evaluate oxygenation with the available oximetry and vital-sign equipment and select the appropriate medical response.",
        sources: ["medical", "diagnostics"],
      },
      {
        action:
          "Have life-support operators check oxygen supply and the oxygen, carbon dioxide and pressure data. Use the approved oxygen/life-support response to restore the prescribed breathing environment.",
        sources: ["atmosphere", "suit"],
      },
    ],
  },
  "pressure-fixture": {
    focus:
      "Falling suit pressure: restore the suit's approved operating conditions",
    steps: [
      escalate,
      {
        action:
          "Use the mission's off-nominal suit-pressure procedure with the responsible suit operators. Recovery must use the suit's approved operating set-point, not this simulator's baseline.",
        sources: ["suit"],
      },
      {
        action:
          "Review suit pressure, oxygen and carbon dioxide together and monitor their trends during the response, so pressure recovery also preserves the required breathing environment.",
        sources: ["suit", "atmosphere"],
      },
    ],
  },
};
export const FALLBACK_GUIDANCE: Guidance = {
  focus: "Medical assessment required",
  steps: [escalate],
};
