import { useState } from "react";
import {
  Empty,
  NAMES,
  Panel,
  stamp,
  Status,
  TrendChart,
} from "../components/medical";
import type { ScreenProps } from "./types";

export const RISK_MODULES = [
  {
    name: "ImmuneWatch",
    category: "Altered immune responses",
    codes: ["wbc"],
    candidates:
      "White blood cells, differential counts, inflammatory markers and viral reports.",
    explanation:
      "Review available immune-related laboratory observations over time. This view does not infer infection or immune dysfunction.",
    unavailable:
      "Differential counts, cytokines and PCR reports are not integrated.",
  },
  {
    name: "NeuroAdapt",
    category: "Sensorimotor & vestibular adaptation",
    codes: [],
    candidates:
      "Reaction time, eye movement, balance, gait and inertial measurements.",
    explanation:
      "Sensorimotor adaptation requires dedicated examinations and contextual interpretation.",
    unavailable:
      "No reaction-time, vestibular or movement-test adapter is configured.",
  },
  {
    name: "CardioPredict",
    category: "Cardiovascular changes",
    codes: [
      "heart_rate",
      "respiratory_rate",
      "systolic_bp",
      "diastolic_bp",
      "hemoglobin",
    ],
    candidates: "Heart rate, respiration, blood pressure, ECG and hematology.",
    explanation:
      "Compare continuous physiology with explicit examination events. Recorded ranges are descriptive, not cardiovascular risk predictions.",
    unavailable: "Ultrasound, HRV and cardiac output are unavailable.",
  },
  {
    name: "DecompSafe",
    category: "Decompression risk",
    codes: ["suit_pressure"],
    candidates:
      "Pressure history, gas composition, EVA timing and procedure logs.",
    explanation:
      "Pressure data is synthetic context only. This prototype cannot calculate decompression risk or authorize EVA.",
    unavailable:
      "Gas partial pressures, Doppler findings and approved procedural inputs are unavailable.",
  },
  {
    name: "MicrobiomeAI",
    category: "Host–microorganism interactions",
    codes: [],
    candidates:
      "Environmental sampling, cultures, sequencing, diversity and PCR reports.",
    explanation:
      "Sample collection time, location and laboratory provenance are required before meaningful comparison.",
    unavailable:
      "No microbiome or environmental laboratory reports are imported. No AI analysis is implemented.",
  },
  {
    name: "OxygenGuard",
    category: "Hypoxia-related observations",
    codes: [
      "spo2",
      "respiratory_rate",
      "heart_rate",
      "suit_pressure",
      "hemoglobin",
    ],
    candidates:
      "SpO₂, pulse, respiratory rate, pressure and blood-gas reports.",
    explanation:
      "Display available observations and their quality together. Demonstration alerts are arbitrary fixture markers and are not hypoxia diagnoses.",
    unavailable:
      "Blood gases, oxygen partial pressure and EtCO₂ are unavailable.",
  },
  {
    name: "AstroNutrition",
    category: "Nutrition",
    codes: [],
    candidates:
      "Recorded energy, macronutrients, intake history and inventory.",
    explanation:
      "Synthetic meal logs provide recorded totals without imposing recommended intake targets.",
    unavailable:
      "Nutrient biomarkers and individualized nutrition plans are not integrated.",
    destination: "Nutrition" as const,
  },
  {
    name: "EVA Assist",
    category: "EVA injury & performance",
    codes: ["heart_rate", "respiratory_rate", "spo2", "suit_pressure"],
    candidates:
      "Suit and physiological telemetry, EVA timeline and procedural records.",
    explanation:
      "Review simulated suit telemetry alongside the demonstration checklist. No hardware compatibility or operational fitness is inferred.",
    unavailable:
      "Joint movement, grip force and cognitive workload measures are unavailable.",
    destination: "EVA operations" as const,
  },
  {
    name: "AstroFit",
    category: "Reduced fitness",
    codes: ["heart_rate", "respiratory_rate"],
    candidates:
      "Exercise response, session duration, strength and metabolic measurements.",
    explanation:
      "Exercise/recovery trends and recorded sessions support a demonstration history. Fitness capacity is not estimated.",
    unavailable:
      "VO₂max, muscle structure and strength measurements are unavailable.",
    destination: "Fitness" as const,
  },
  {
    name: "VisionTrack",
    category: "Spaceflight-associated neuro-ocular changes",
    codes: [],
    candidates:
      "Visual acuity, fundus/OCT reports, intraocular pressure and refraction.",
    explanation:
      "Vision monitoring requires reviewed ophthalmic examinations and imaging reports.",
    unavailable: "No OCT, tonometry or vision-test adapter is configured.",
  },
  {
    name: "BoneGuard",
    category: "Bone changes",
    codes: ["bone_density"],
    candidates:
      "Bone-density reports, turnover markers and mineral laboratory results.",
    explanation:
      "Bone density is an event-based synthetic report. It never changes continuously with telemetry.",
    unavailable:
      "Structural imaging, bone-turnover markers and mineral panels are unavailable.",
  },
];

export function RiskMonitoring({ mission, crewId, navigate }: ScreenProps) {
  const [selected, setSelected] = useState(2);
  const module = RISK_MODULES[selected];
  const saved =
    mission.operations?.examinations.filter(
      (e) => e.astronaut_id === crewId && e.status === "SAVED",
    ) ?? [];
  const observations = mission.observations.filter(
    (o) => !o.examination_id || saved.some((e) => e.id === o.examination_id),
  );
  const available = module.codes.map((code) => ({
    code,
    observation: observations.filter((o) => o.code === code).at(-1),
    exam: saved.find((e) => e.results?.some((r) => r.code === code)),
  }));
  const count = available.filter(
    (item) => item.observation || item.exam,
  ).length;
  return (
    <div className="screen-stack">
      <div className="info-banner">
        Eleven shared-record views, based on the project specification.
        Availability is shown explicitly; no clinical risk scores or AI
        conclusions are generated.
      </div>
      <div className="risk-layout">
        <nav className="risk-nav" aria-label="Health risk categories">
          {RISK_MODULES.map((item, i) => (
            <button
              key={item.name}
              className={selected === i ? "selected" : ""}
              onClick={() => setSelected(i)}
              aria-pressed={selected === i}
            >
              <span className="risk-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{item.name}</strong>
                <span>{item.category}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="screen-stack">
          <Panel
            title={module.name}
            action={<Status value={count ? "PARTIAL_DATA" : "NO_DATA"} />}
          >
            <h3 className="risk-category">{module.category}</h3>
            <p>{module.explanation}</p>
            <div className="subsection">
              <h3>Measurements & context</h3>
              <p>{module.candidates}</p>
            </div>
            {available.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Measurement</th>
                      <th>Latest recorded value</th>
                      <th>Source & time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {available.map(({ code, observation, exam }) => {
                      const result =
                        observation ??
                        exam?.results?.find((r) => r.code === code);
                      return (
                        <tr key={code}>
                          <td>{NAMES[code]}</td>
                          <td>
                            {result ? (
                              `${result.value.toFixed(code === "bone_density" ? 2 : 1)} ${result.unit}`
                            ) : (
                              <Status value="NOT_AVAILABLE" />
                            )}
                          </td>
                          <td>
                            {result ? (
                              <>
                                SIMULATED ·{" "}
                                {observation?.device_id ?? exam?.device_id}
                                <small>
                                  {stamp(
                                    observation?.observed_at ??
                                      exam?.acquired_at,
                                    true,
                                  )}
                                </small>
                              </>
                            ) : (
                              "No accepted observation / saved report"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Specialized measurement data unavailable">
                {module.unavailable}
              </Empty>
            )}
            {available.length > 0 && (
              <p className="caption">{module.unavailable}</p>
            )}
            {"destination" in module && module.destination && (
              <button onClick={() => navigate(module.destination!)}>
                {module.destination === "Nutrition"
                  ? `Open meal records (${mission.operations?.meals.filter((m) => m.astronaut_id === crewId).length ?? 0})`
                  : `Open ${module.destination.toLowerCase()}`}{" "}
                →
              </button>
            )}
            {module.codes.some((code) =>
              ["wbc", "bone_density", "systolic_bp"].includes(code),
            ) && (
              <button
                className="link-button"
                onClick={() => navigate("Examinations")}
              >
                Acquire a synthetic report →
              </button>
            )}
          </Panel>
          {module.codes[0] && (
            <Panel title={`${NAMES[module.codes[0]]} · recorded trend`}>
              <TrendChart
                readings={observations}
                code={module.codes[0]}
                minutes={60}
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
