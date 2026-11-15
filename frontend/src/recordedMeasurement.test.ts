import { expect, it } from "vitest";
import { recordedMeasurement } from "./recordedMeasurement";
import { NOW, reading, reviewExam } from "./test/fixtures";

it("selects a newer saved report over an older retained observation", () => {
  const observation = {
    ...reading,
    code: "systolic_bp" as const,
    value: 110,
    unit: "mmHg",
  };
  const report = {
    ...reviewExam,
    status: "SAVED" as const,
    acquired_at: new Date(NOW + 1000).toISOString(),
  };
  expect(
    recordedMeasurement("systolic_bp", [observation], [report])?.result.value,
  ).toBe(118);
  expect(
    recordedMeasurement(
      "systolic_bp",
      [{ ...observation, observed_at: new Date(NOW + 2000).toISOString() }],
      [report],
    )?.result.value,
  ).toBe(110);
});

it("excludes unsaved reports and preserves an invalid latest reading's quality", () => {
  expect(recordedMeasurement("systolic_bp", [], [reviewExam])).toBeUndefined();
  const invalid = { ...reading, quality: "INVALID" as const };
  expect(recordedMeasurement("heart_rate", [invalid], [])?.result.quality).toBe(
    "INVALID",
  );
});
