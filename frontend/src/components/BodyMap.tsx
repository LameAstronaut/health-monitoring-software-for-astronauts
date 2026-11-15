import { useState } from "react";
import type { Observation, Examination, CrewMember } from "../services/api";
import type { CompletedReactionTest } from "../reactionResults";
import { NAMES, stamp, Status } from "./medical";
import { AverageReactionTime } from "./AverageReactionTime";

type BodyPart = {
  id: string;
  label: string;
  short: string;
  codes: string[];
  hint: string;
};

const PARTS: BodyPart[] = [
  {
    id: "head",
    label: "Head & eyes",
    short: "HEAD",
    codes: ["sleep_duration"],
    hint: "Completed sleep duration and average reaction time provide context. Vision, vestibular and neurological examinations are not configured.",
  },
  {
    id: "chest",
    label: "Heart & lungs",
    short: "CHEST",
    codes: [
      "heart_rate",
      "respiratory_rate",
      "spo2",
      "systolic_bp",
      "diastolic_bp",
    ],
    hint: "Continuous synthetic cardiopulmonary observations.",
  },
  {
    id: "arms",
    label: "Arms & movement",
    short: "ARMS",
    codes: ["body_temperature"],
    hint: "Body temperature is an event-based synthetic examination. Strength, grip and range-of-motion testing are not configured.",
  },
  {
    id: "abdomen",
    label: "Nutrition & labs",
    short: "ABDOMEN",
    codes: ["weight", "wbc", "hemoglobin"],
    hint: "Weight is the latest recorded synthetic body mass in kilograms. Laboratory values are event-based synthetic reports.",
  },
  {
    id: "legs",
    label: "Bones & fitness",
    short: "LEGS",
    codes: ["bone_density", "suit_pressure"],
    hint: "Bone density is event-based; pressure is suit telemetry context.",
  },
];

const REGION_SHAPES: Record<
  string,
  { shape: string; label: [number, number] }
> = {
  head: { shape: "M180 6a30 30 0 1 0 1 0z", label: [180, 36] },
  chest: {
    shape: "M139 85 Q180 72 221 85 L228 171 Q180 189 132 171 Z",
    label: [180, 148],
  },
  arms: {
    shape:
      "M135 95 L112 100 L78 248 L98 285 L128 165 Z M225 95 L248 100 L282 248 L262 285 L232 165 Z",
    label: [100, 210],
  },
  abdomen: {
    shape: "M136 176 Q180 189 224 176 L235 245 Q180 265 125 245 Z",
    label: [180, 224],
  },
  legs: {
    shape:
      "M125 250 L176 260 L163 520 L119 520 Z M184 260 L235 250 L241 520 L197 520 Z",
    label: [180, 392],
  },
};

export function BodyMap({
  observations,
  examinations,
  bodyVariant,
  latestReactionResult,
}: {
  observations: Observation[];
  examinations: Examination[];
  bodyVariant?: CrewMember["body_variant"];
  latestReactionResult?: CompletedReactionTest | null;
}) {
  const [selected, setSelected] = useState("chest");
  const part = PARTS.find((item) => item.id === selected) ?? PARTS[1];
  const latest = part.codes.map((code) => {
    const observation = observations
      .filter((item) => item.code === code)
      .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
      .at(-1);
    const exam = [...examinations]
      .filter((item) => item.status === "SAVED")
      .sort(
        (a, b) =>
          Date.parse(b.acquired_at ?? b.started_at) -
          Date.parse(a.acquired_at ?? a.started_at),
      )
      .find((item) => item.results?.some((result) => result.code === code));
    const result =
      observation ?? exam?.results?.find((item) => item.code === code);
    return {
      code,
      result,
      device: observation?.device_id ?? exam?.device_id,
      time: observation?.observed_at ?? exam?.acquired_at,
    };
  });
  return (
    <section className="body-map panel" aria-labelledby="body-map-title">
      <div className="panel-heading">
        <h2 id="body-map-title">Crew body view</h2>
        <span className="body-map-origin">SIMULATED · tap a body region</span>
      </div>
      <div className="button-row body-view-controls" aria-label="Body display">
        <button aria-pressed={true}>High-resolution image</button>
      </div>
      <div className="body-map-layout">
        <div>
          <div
            className="body-figure"
            role="group"
            aria-label="Interactive astronaut body regions"
          >
            <img
              className="body-image"
              src={
                bodyVariant === "male"
                  ? "/assets/astronaut-body-male.png"
                  : "/assets/astronaut-body-realistic.png"
              }
              alt={`Realistic synthetic ${bodyVariant ? bodyVariant + " " : ""}astronaut body illustration`}
            />
            <svg
              className="body-diagram"
              viewBox="0 0 360 540"
              role="group"
              aria-label="Clickable astronaut body diagram"
            >
              {PARTS.map((item) => {
                const region = REGION_SHAPES[item.id];
                return (
                  <g
                    key={item.id}
                    className={`body-region ${selected === item.id ? "selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={item.label}
                    aria-pressed={selected === item.id}
                    onClick={() => setSelected(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(item.id);
                      }
                    }}
                  >
                    <path d={region.shape} />
                    <text
                      x={region.label[0]}
                      y={region.label[1]}
                      textAnchor="middle"
                    >
                      {item.short}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
        <div className="body-map-detail">
          <p className="eyebrow">SELECTED REGION</p>
          <h3 aria-live="polite">{part.label}</h3>
          <p className="body-map-hint">{part.hint}</p>
          {!part.codes.length ? (
            <div className="body-map-empty">
              <Status value="NOT_AVAILABLE" />
              <span>No accepted measurement is linked to this region.</span>
            </div>
          ) : (
            <div className="body-map-measurements">
              {latest.map(({ code, result, device, time }) => (
                <div className="body-map-measurement" key={code}>
                  <strong>{NAMES[code]}</strong>
                  {result ? (
                    <>
                      <b>
                        {result.value} <small>{result.unit}</small>
                      </b>
                      <span>
                        SIMULATED · {device} · {stamp(time)}
                      </span>
                    </>
                  ) : (
                    <Status value="NOT_AVAILABLE" />
                  )}
                </div>
              ))}
              {selected === "head" && (
                <AverageReactionTime result={latestReactionResult} />
              )}
            </div>
          )}
          <p className="caption">
            This region view organizes records for review. It does not indicate
            a diagnosis or clinical finding.
          </p>
        </div>
      </div>
    </section>
  );
}

export { PARTS };
