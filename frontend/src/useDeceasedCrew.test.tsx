// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useDeceasedCrew } from "./useDeceasedCrew";
import { makeMission, reading } from "./test/fixtures";

afterEach(cleanup);

it.each([
  "heart_rate",
  "respiratory_rate",
  "spo2",
  "suit_pressure",
  "systolic_bp",
  "diastolic_bp",
] as const)(
  "marks the affected crew deceased on a live zero %s reading",
  (code) => {
    const { result } = renderHook(() =>
      useDeceasedCrew(
        makeMission({
          observations: [{ ...reading, code, value: 0 }],
        }),
      ),
    );
    expect([...result.current]).toEqual(["DEMO-CREW-001"]);
  },
);

it.each([
  { quality: "INVALID" as const },
  { freshness: "STALE" as const },
  { freshness: "HISTORICAL" as const },
  { freshness: "ERROR" as const },
  { run_id: "previous-run" },
  { examination_id: "exam-1" },
  { observed_at: "2026-11-14T08:00:00Z" },
  { value: 1 },
  { code: "wbc" as const },
])("ignores nonterminal or unusable readings: %j", (update) => {
  const { result } = renderHook(() =>
    useDeceasedCrew(
      makeMission({
        observations: [{ ...reading, value: 0, ...update }],
      }),
    ),
  );
  expect(result.current.size).toBe(0);
});

it.each(["disconnected", "sensor error", "loading"])(
  "ignores zero during %s",
  (state) => {
    const mission = makeMission({ observations: [{ ...reading, value: 0 }] });
    if (state === "disconnected") mission.connected = false;
    if (state === "sensor error") mission.devices[0].status = "ERROR";
    if (state === "loading") mission.loading = true;
    const { result } = renderHook(() => useDeceasedCrew(mission));
    expect(result.current.size).toBe(0);
  },
);

it("uses the latest sample instead of an older zero in history", () => {
  const { result } = renderHook(() =>
    useDeceasedCrew(
      makeMission({
        observations: [
          { ...reading, value: 0 },
          { ...reading, id: 2, value: 68 },
        ],
      }),
    ),
  );
  expect(result.current.size).toBe(0);
});

it("detects another crew through summaries and latches until a new run", () => {
  const mission = makeMission({
    summaries: [
      {
        crew: makeMission().crew[1],
        readings: [
          {
            ...reading,
            astronaut_id: "DEMO-CREW-002",
            device_id: "DEMO-SUIT-002",
            value: 0,
          },
        ],
      },
    ],
  });
  const { result, rerender } = renderHook(
    ({ input }) => useDeceasedCrew(input),
    {
      initialProps: { input: mission },
    },
  );
  expect([...result.current]).toEqual(["DEMO-CREW-002"]);
  rerender({ input: makeMission({ connected: false }) });
  expect([...result.current]).toEqual(["DEMO-CREW-002"]);
  const restarted = makeMission();
  restarted.operations!.control.run_id = "new-run";
  rerender({ input: restarted });
  expect(result.current.size).toBe(0);
});

it("restores persisted deceased state even when the latest vitals are historical", () => {
  const { result } = renderHook(() =>
    useDeceasedCrew(
      makeMission({
        connected: false,
        observations: [{ ...reading, deceased: true, freshness: "HISTORICAL" }],
      }),
    ),
  );
  expect([...result.current]).toEqual([reading.astronaut_id]);
});
