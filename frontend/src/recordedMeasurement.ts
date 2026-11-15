import type { Examination, Observation } from "./services/api";

/** Compare source timestamps so a retained old sample cannot mask a newer report. */
export function recordedMeasurement(
  code: string,
  observations: Observation[],
  examinations: Examination[],
) {
  const candidates = [
    ...observations
      .filter((item) => item.code === code)
      .map((item) => ({
        result: item,
        device: item.device_id,
        time: item.observed_at,
      })),
    ...examinations
      .filter((item) => item.status === "SAVED")
      .flatMap((exam) =>
        (exam.results ?? [])
          .filter((item) => item.code === code)
          .map((result) => ({
            result,
            device: exam.device_id,
            time: exam.acquired_at ?? exam.started_at,
          })),
      ),
  ];
  return candidates
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
    .at(-1);
}
