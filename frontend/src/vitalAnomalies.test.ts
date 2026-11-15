import { expect, it } from "vitest";
import { anomalousVitals } from "./vitalAnomalies";
import { makeMission, reading, NOW } from "./test/fixtures";
import type { Observation } from "./services/api";

it.each([
  ["heart_rate", 45, true],
  ["heart_rate", 115, true],
  ["heart_rate", 68, false],
  ["respiratory_rate", 26, true],
  ["respiratory_rate", 13, false],
  ["spo2", 92, true],
  ["spo2", 98, false],
  ["suit_pressure", 25, true],
  ["suit_pressure", 30, false],
] as const)(
  "checks %s at %s against the existing demo ranges",
  (code, value, expected) => {
    expect(
      anomalousVitals(
        makeMission({ observations: [{ ...reading, code, value }] }),
      ).length > 0,
    ).toBe(expected);
  },
);

it("uses the newest reading across all crew summaries and the selected stream", () => {
  const mission = makeMission();
  const other: Observation = {
    ...reading,
    id: 10,
    astronaut_id: "DEMO-CREW-002",
    device_id: "DEMO-SUIT-002",
    value: 125,
  };
  mission.summaries = [{ crew: mission.crew[1], readings: [other] }];
  expect(anomalousVitals(mission)).toEqual([other]);
  mission.observations = [reading, { ...other, id: 11, value: 72 }];
  expect(anomalousVitals(mission)).toEqual([]);
  // An older summary cannot override a newer healthy streamed value.
  mission.summaries[0].readings = [other];
  expect(anomalousVitals(mission)).toEqual([]);
});

it("does not use old runs, exams, invalid, stale or disconnected values", () => {
  const abnormal = { ...reading, value: 125 };
  for (const overrides of [
    { run_id: "old-run" },
    { examination_id: "exam" },
    { quality: "INVALID" as const },
    { freshness: "HISTORICAL" as const },
    { observed_at: new Date(NOW - 6000).toISOString() },
  ]) {
    expect(
      anomalousVitals(
        makeMission({ observations: [{ ...abnormal, ...overrides }] }),
      ),
    ).toEqual([]);
  }
  expect(
    anomalousVitals(
      makeMission({ connected: false, observations: [abnormal] }),
    ),
  ).toEqual([]);
  const mission = makeMission({ observations: [abnormal] });
  mission.devices[0].status = "ERROR";
  expect(anomalousVitals(mission)).toEqual([]);
});
