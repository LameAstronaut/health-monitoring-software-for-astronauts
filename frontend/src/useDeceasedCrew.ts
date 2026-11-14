import { useState } from "react";
import type { Mission } from "./screens/types";
import type { Observation } from "./services/api";
import { displayState } from "./telemetry";

// Explicit synthetic deceased-status fixtures, not medical death criteria.
const DECEASED_SIGNALS = new Set([
  "heart_rate",
  "respiratory_rate",
  "spo2",
  "suit_pressure",
  "systolic_bp",
  "diastolic_bp",
]);

export function useDeceasedCrew(mission: Mission) {
  const runId = mission.operations?.control.run_id;
  const [record, setRecord] = useState<{
    runId: string | undefined;
    crewIds: Set<string>;
  }>({ runId, crewIds: new Set() });
  const deceased = new Set(record.runId === runId ? record.crewIds : []);
  const latest = new Map<string, Observation>();
  for (const reading of [
    ...mission.summaries.flatMap((summary) => summary.readings),
    ...mission.observations,
  ]) {
    if (reading.examination_id || reading.run_id !== runId) continue;
    const key = `${reading.astronaut_id}/${reading.code}`;
    const previous = latest.get(key);
    if (
      !previous ||
      Date.parse(reading.observed_at) > Date.parse(previous.observed_at) ||
      (reading.observed_at === previous.observed_at && reading.id > previous.id)
    )
      latest.set(key, reading);
  }
  if (runId && !mission.loading)
    for (const reading of latest.values()) {
      if (reading.deceased) {
        deceased.add(reading.astronaut_id);
        continue;
      }
      if (!DECEASED_SIGNALS.has(reading.code) || reading.value !== 0) continue;
      const device = mission.devices.find(
        (item) => item.id === reading.device_id,
      );
      if (
        reading.source_type === "SIMULATED" &&
        device?.status !== "ERROR" &&
        device?.status !== "DISCONNECTED" &&
        displayState(
          reading,
          mission.connected,
          mission.now,
          mission.serverNow,
          mission.health?.stale_seconds ?? 5,
          mission.health?.disconnect_seconds ?? 15,
        ) === "LIVE"
      )
        deceased.add(reading.astronaut_id);
    }
  if (record.runId !== runId || deceased.size !== record.crewIds.size) {
    setRecord({ runId, crewIds: deceased });
  }
  return deceased;
}
