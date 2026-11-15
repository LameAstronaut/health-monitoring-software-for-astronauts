import type { Mission } from "./screens/types";
import type { Observation } from "./services/api";
import { displayState } from "./telemetry";

// Match the backend's synthetic anomaly markers, not clinical operating limits.
const outsideDemoRange = (reading: Observation) => {
  switch (reading.code) {
    case "heart_rate":
      return reading.value <= 45 || reading.value >= 115;
    case "respiratory_rate":
      return reading.value >= 26;
    case "spo2":
      return reading.value <= 92;
    case "suit_pressure":
      return reading.value <= 25;
    default:
      return false;
  }
};

export function anomalousVitals(mission: Mission) {
  const latest = new Map<string, Observation>();
  const runId = mission.operations?.control.run_id;
  for (const reading of [
    ...mission.summaries.flatMap((summary) => summary.readings),
    ...mission.observations,
  ]) {
    if (reading.examination_id || (runId && reading.run_id !== runId)) continue;
    const key = `${reading.astronaut_id}/${reading.code}`;
    const previous = latest.get(key);
    if (
      !previous ||
      Date.parse(reading.observed_at) > Date.parse(previous.observed_at) ||
      (reading.observed_at === previous.observed_at && reading.id > previous.id)
    )
      latest.set(key, reading);
  }
  return [...latest.values()].filter((reading) => {
    const device = mission.devices.find(
      (item) => item.id === reading.device_id,
    );
    return (
      reading.quality === "VALID" &&
      Number.isFinite(reading.value) &&
      device?.status !== "ERROR" &&
      device?.status !== "DISCONNECTED" &&
      displayState(
        reading,
        mission.connected,
        mission.now,
        mission.serverNow,
        mission.health?.stale_seconds ?? 5,
        mission.health?.disconnect_seconds ?? 15,
      ) === "LIVE" &&
      outsideDemoRange(reading)
    );
  });
}
