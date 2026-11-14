import { describe, expect, it } from "vitest";
import { displayState, mergeObservations } from "./telemetry";
import type { Observation } from "./services/api";

const now = Date.parse("2026-11-14T10:00:00Z");
const reading: Observation = {
  id: 1,
  event_id: "test",
  sequence: 1,
  observed_at: new Date(now).toISOString(),
  received_at: new Date(now).toISOString(),
  astronaut_id: "DEMO-CREW-001",
  device_id: "DEMO-SUIT-001",
  source_type: "SIMULATED",
  scenario_id: "normal",
  code: "heart_rate",
  value: 72,
  unit: "beats/min",
  quality: "VALID",
  freshness: "LIVE",
  sequence_gap: false,
};

describe("freshness display", () => {
  it("expires values even if stream status stops updating", () => {
    expect(displayState(reading, true, now, now, 5, 15)).toBe("LIVE");
    expect(displayState(reading, true, now + 6000, now + 6000, 5, 15)).toBe(
      "STALE",
    );
    expect(displayState(reading, true, now + 16000, now + 16000, 5, 15)).toBe(
      "DISCONNECTED",
    );
  });
  it("marks loss of transport, historical data, invalid quality and missing values", () => {
    expect(displayState(reading, false, now, now, 5, 15)).toBe("DISCONNECTED");
    expect(
      displayState(
        { ...reading, freshness: "HISTORICAL" },
        true,
        now,
        now,
        5,
        15,
      ),
    ).toBe("HISTORICAL");
    expect(
      displayState({ ...reading, quality: "INVALID" }, true, now, now, 5, 15),
    ).toBe("INVALID");
    expect(displayState(undefined, true, now, now, 5, 15)).toBe(
      "NOT_AVAILABLE",
    );
  });
});

it("resync merges packets without duplication or sequence rollback", () => {
  const newer = { ...reading, id: 2, sequence: 2 };
  expect(mergeObservations([newer, reading], [reading])).toEqual([
    reading,
    newer,
  ]);
});
