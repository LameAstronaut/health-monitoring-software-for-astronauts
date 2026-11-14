import { useState } from "react";
import type { Observation, Examination } from "../services/api";
import { NAMES, stamp, Status } from "./medical";

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
    codes: [],
    hint: "Vision, vestibular and neurological examinations are not configured.",
  },
  {
    id: "chest",
    label: "Heart & lungs",
    short: "CHEST",
    codes: ["heart_rate", "respiratory_rate", "spo2"],
    hint: "Continuous synthetic cardiopulmonary observations.",
  },
  {
    id: "arms",
    label: "Arms & movement",
    short: "ARMS",
    codes: [],
    hint: "Strength, grip, range-of-motion and reaction testing are not configured.",
  },
  {
    id: "abdomen",
    label: "Nutrition & labs",
    short: "ABDOMEN",
    codes: ["wbc", "hemoglobin"],
    hint: "Available laboratory values are event-based synthetic reports.",
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
  head: { shape: "M180 28a38 38 0 1 0 1 0z", label: [180, 36] },
  chest: {
    shape: "M130 92 Q180 72 230 92 L242 205 Q180 230 118 205 Z",
    label: [180, 148],
  },
  arms: {
    shape:
      "M124 100 L84 112 L45 250 L76 258 L136 178 Z M236 100 L276 112 L315 250 L284 258 L224 178 Z",
    label: [180, 246],
  },
  abdomen: {
    shape: "M126 202 Q180 220 234 202 L225 305 Q180 325 135 305 Z",
    label: [180, 260],
  },
  legs: {
    shape:
      "M137 300 L176 308 L170 482 L126 482 Z M184 308 L223 300 L234 482 L190 482 Z",
    label: [180, 392],
  },
};

export function BodyMap({
  observations,
  examinations,
}: {
  observations: Observation[];
  examinations: Examination[];
}) {
  const [selected, setSelected] = useState("chest");
  const part = PARTS.find((item) => item.id === selected) ?? PARTS[1];
  const latest = part.codes.map((code) => {
    const observation = observations
      .filter((item) => item.code === code)
      .at(-1);
    const exam = examinations.find((item) =>
      item.results?.some((result) => result.code === code),
    );
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
      <div className="body-map-layout">
        <div
          className="body-figure"
          role="group"
          aria-label="Interactive astronaut body regions"
        >
          <img
            className="body-image"
            src="/assets/astronaut-body-realistic.png"
            alt="Realistic synthetic astronaut body illustration"
          />
          <svg
            className="body-diagram"
            viewBox="0 0 360 520"
            role="img"
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
                    if (event.key === "Enter" || event.key === " ")
                      setSelected(item.id);
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
        <div className="body-map-detail">
          <p className="eyebrow">SELECTED REGION</p>
          <h3>{part.label}</h3>
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
