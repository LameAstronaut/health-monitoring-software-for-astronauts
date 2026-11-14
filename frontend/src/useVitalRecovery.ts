import { useEffect, useState } from "react";
import type { Mission } from "./screens/types";
import { displayState } from "./telemetry";

// Allow the simulator's ordinary resting variation; these are not clinical limits.
const TOLERANCE: Record<string, number> = {
  heart_rate: 4,
  respiratory_rate: 1.5,
  spo2: 0.7,
  suit_pressure: 0.35,
  systolic_bp: 5,
  diastolic_bp: 3,
};
const STORAGE_KEY = "astra-recovered-alert-vitals";

export function useVitalRecovery(mission: Mission, crewId: string) {
  const [resolved, setResolved] = useState<Set<string>>(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "[]",
      );
      return new Set(
        Array.isArray(stored)
          ? stored.filter((item): item is string => typeof item === "string")
          : [],
      );
    } catch {
      return new Set();
    }
  });
  const completed = new Set(resolved);
  const active = new Set<string>();
  const baseline = mission.crew.find((crew) => crew.id === crewId)?.baseline;
  for (const alert of mission.alerts) {
    if (alert.state !== "ACKNOWLEDGED" || alert.astronaut_id !== crewId)
      continue;
    for (const evidence of alert.evidence) {
      const key = `${crewId}/${alert.id}/${evidence.code}`;
      if (completed.has(key)) continue;
      const readings = mission.observations.filter(
        (reading) =>
          reading.astronaut_id === crewId &&
          reading.code === evidence.code &&
          !reading.examination_id,
      );
      const latest = readings.at(-1);
      if (latest && latest.run_id !== evidence.run_id) continue;
      const target = baseline?.[evidence.code];
      const tolerance = TOLERANCE[evidence.code];
      const live =
        displayState(
          latest,
          mission.connected,
          mission.now,
          mission.serverNow,
          mission.health?.stale_seconds ?? 5,
          mission.health?.disconnect_seconds ?? 15,
        ) === "LIVE";
      const sensor = mission.devices.find(
        (device) => device.id === latest?.device_id,
      );
      const recovered =
        live &&
        sensor?.status !== "ERROR" &&
        sensor?.status !== "DISCONNECTED" &&
        target !== undefined &&
        tolerance !== undefined &&
        readings.some(
          (reading) =>
            reading.run_id === evidence.run_id &&
            reading.id > evidence.id &&
            reading.quality === "VALID" &&
            Math.abs(reading.value - target) <= tolerance,
        );
      if (recovered) completed.add(key);
      else active.add(evidence.code);
    }
  }
  const completedKey = JSON.stringify([...completed].sort());
  useEffect(() => {
    const entries: string[] = JSON.parse(completedKey);
    setResolved((previous) =>
      entries.every((entry) => previous.has(entry))
        ? previous
        : new Set(entries),
    );
    try {
      localStorage.setItem(STORAGE_KEY, completedKey);
    } catch {
      /* Session tracking remains available. */
    }
  }, [completedKey]);
  return active;
}
