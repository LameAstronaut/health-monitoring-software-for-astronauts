import type { Observation } from "../services/api";
import type { ScreenProps } from "../screens/types";
import { displayState } from "../telemetry";
import { NAMES } from "./medical";

const ACTIVE_FAULTS: Record<string, readonly string[]> = {
  spo2: ["OXYGEN", "BOTH", "MULTI_SYSTEM"],
  suit_pressure: ["PRESSURE", "BOTH", "MULTI_SYSTEM"],
  heart_rate: [
    "PULSE_DECREASE",
    "PULSE_SURGE",
    "RESPIRATORY_SURGE",
    "MULTI_SYSTEM",
  ],
  respiratory_rate: ["RESPIRATORY_SURGE", "MULTI_SYSTEM"],
};

// Demonstration bands leading up to the backend's anomaly markers, not clinical limits.
const BANDS = [
  {
    code: "heart_rate",
    low: 45,
    high: 55,
    falling: true,
    rule: "pulse-decrease-fixture",
  },
  { code: "spo2", low: 92, high: 96, falling: true, rule: "oxygen-fixture" },
  {
    code: "suit_pressure",
    low: 25,
    high: 28,
    falling: true,
    rule: "pressure-fixture",
  },
  {
    code: "heart_rate",
    low: 100,
    high: 115,
    falling: false,
    rule: "pulse-rise-fixture",
  },
  {
    code: "respiratory_rate",
    low: 20,
    high: 26,
    falling: false,
    rule: "respiratory-rise-fixture",
  },
] as const;

export function EarlyWarning({
  mission,
  selectCrew,
  navigate,
}: Pick<ScreenProps, "mission" | "selectCrew" | "navigate">) {
  const latest = new Map<string, Observation>();
  for (const reading of [
    ...mission.summaries.flatMap((summary) => summary.readings),
    ...mission.observations,
  ]) {
    if (reading.examination_id) continue;
    const key = `${reading.astronaut_id}/${reading.code}`;
    const previous = latest.get(key);
    if (
      !previous ||
      Date.parse(reading.observed_at) > Date.parse(previous.observed_at) ||
      (reading.observed_at === previous.observed_at && reading.id > previous.id)
    )
      latest.set(key, reading);
  }
  const warnings = [...latest.values()].filter((reading) => {
    const band = BANDS.find(
      (item) =>
        item.code === reading.code &&
        (item.falling
          ? reading.value > item.low && reading.value <= item.high
          : reading.value >= item.low && reading.value < item.high),
    );
    if (!band || reading.scenario_id !== "ANOMALY") return false;
    const control = mission.operations?.control;
    if (
      control &&
      (control.astronaut_id !== reading.astronaut_id ||
        control.scenario !== "ANOMALY" ||
        (!ACTIVE_FAULTS[reading.code]?.includes(control.fault) &&
          control.manual_values?.[band.code] == null))
    )
      return false;
    const previous = mission.observations
      .filter(
        (item) =>
          item.astronaut_id === reading.astronaut_id &&
          item.code === reading.code &&
          item.run_id === reading.run_id &&
          !item.examination_id &&
          item.quality === "VALID" &&
          (Date.parse(item.observed_at) < Date.parse(reading.observed_at) ||
            (item.observed_at === reading.observed_at && item.id < reading.id)),
      )
      .sort(
        (a, b) =>
          Date.parse(a.observed_at) - Date.parse(b.observed_at) || a.id - b.id,
      )
      .at(-1);
    if (
      previous &&
      (band.falling
        ? reading.value > previous.value
        : reading.value < previous.value)
    )
      return false;
    if (
      displayState(
        reading,
        mission.connected,
        mission.now,
        mission.serverNow,
        mission.health?.stale_seconds ?? 5,
        mission.health?.disconnect_seconds ?? 15,
      ) !== "LIVE"
    )
      return false;
    const device = mission.devices.find(
      (item) => item.id === reading.device_id,
    );
    if (device?.status === "ERROR" || device?.status === "DISCONNECTED")
      return false;
    if (
      mission.alerts.some(
        (alert) =>
          alert.astronaut_id === reading.astronaut_id &&
          alert.rule_id === band.rule &&
          alert.state === "PENDING_REVIEW",
      )
    )
      return false;
    return band.falling
      ? reading.value > band.low && reading.value <= band.high
      : reading.value >= band.low && reading.value < band.high;
  });
  if (!warnings.length) return null;
  return (
    <aside
      className="early-warning"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div>
        <strong>Early warning · approaching a demo anomaly marker</strong>
        <ul>
          {warnings.map((reading) => (
            <li key={`${reading.astronaut_id}/${reading.code}`}>
              {mission.crew.find((crew) => crew.id === reading.astronaut_id)
                ?.display_name ?? reading.astronaut_id}
              {" · "}
              {NAMES[reading.code]}: {reading.value} {reading.unit}
            </li>
          ))}
        </ul>
        <p>
          Review the trend and sensor quality. Pause the simulation to inspect
          or clear the active fault. These are simulated warning bands.
        </p>
      </div>
      <button
        onClick={() => {
          selectCrew(warnings[0].astronaut_id);
          navigate("Live monitoring");
        }}
      >
        Review live readings
      </button>
    </aside>
  );
}
