import {
  readReactionResult,
  saveReactionResult,
  type CompletedReactionTest,
} from "../reactionResults";
import { useMemo, useState } from "react";
import {
  Empty,
  NAMES,
  Panel,
  stamp,
  Status,
  TrendChart,
} from "../components/medical";
import type { ScreenProps } from "./types";
import { ReactionTest } from "../components/ReactionTest";
import { BodyMap } from "../components/BodyMap";
import { VehicleRadiation } from "../components/VehicleRadiation";

export const RISK_MODULES = [
  {
    name: "Immune Function",
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
    name: "Sensorimotor Adaptation",
    category: "Sensorimotor & vestibular adaptation",
    codes: ["sleep_duration"],
    candidates:
      "Reaction time, eye movement, balance, gait and inertial measurements.",
    explanation:
      "Completed sleep duration supplies simulation context; sensorimotor adaptation still requires dedicated examinations and contextual interpretation.",
    unavailable:
      "A 30-second spacebar reaction practice test is available below. Vestibular and movement-test adapters are not configured.",
  },
  {
    name: "Cardiovascular Status",
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
    name: "Pressure & Decompression",
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
    name: "Oxygenation Status",
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
    name: "Nutritional Status",
    category: "Nutrition",
    codes: ["weight"],
    candidates:
      "Recorded weight, energy, macronutrients, intake history and inventory.",
    explanation:
      "Synthetic meal logs provide recorded totals without imposing recommended intake targets.",
    unavailable:
      "Nutrient biomarkers and individualized nutrition plans are not integrated.",
    destination: "Nutrition" as const,
  },
  {
    name: "EVA Physiology",
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
    name: "Physical Conditioning",
    category: "Reduced fitness",
    codes: ["heart_rate", "respiratory_rate", "weight"],
    candidates:
      "Exercise response, session duration, strength and metabolic measurements.",
    explanation:
      "Exercise/recovery trends and recorded sessions support a demonstration history. Fitness capacity is not estimated.",
    unavailable:
      "VO₂max, muscle structure and strength measurements are unavailable.",
    destination: "Fitness" as const,
  },
  {
    name: "Skeletal Health",
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
  const [reactionResults, setReactionResults] = useState<
    Record<string, CompletedReactionTest>
  >({});
  const latestReactionResult = useMemo(
    () => reactionResults[crewId] ?? readReactionResult(crewId),
    [reactionResults, crewId],
  );
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
      <VehicleRadiation
        data={mission.vehicleRadiation}
        now={mission.serverNow}
        staleSeconds={mission.health?.stale_seconds}
        disconnectSeconds={mission.health?.disconnect_seconds}
      />
      <div className="info-banner">
        {RISK_MODULES.length} shared-record views, based on the project
        specification. Availability is shown explicitly; no clinical risk scores
        or AI conclusions are generated.
      </div>
      <BodyMap
        latestReactionResult={latestReactionResult}
        observations={observations}
        examinations={saved}
        bodyVariant={
          mission.crew.find((crew) => crew.id === crewId)?.body_variant
        }
      />
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
          {module.name === "Sensorimotor Adaptation" && (
            <div>
              <ReactionTest
                key={crewId}
                onComplete={(result) => {
                  saveReactionResult(crewId, result);
                  setReactionResults((previous) => ({
                    ...previous,
                    [crewId]: result,
                  }));
                }}
              />
            </div>
          )}
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
