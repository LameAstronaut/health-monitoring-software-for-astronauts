import type { Observation } from "./services/api";

export function mergeObservations(
  previous: Observation[],
  incoming: Observation[],
): Observation[] {
  const unique = new Map(previous.map((item) => [item.id, item]));
  for (const item of incoming) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => a.id - b.id).slice(-2400);
}

export function displayState(
  reading: Observation | undefined,
  connected: boolean,
  now: number,
  serverNow: number,
  staleSeconds: number,
  disconnectSeconds: number,
): string {
  if (!reading) return "NOT_AVAILABLE";
  if (reading.quality === "INVALID") return "INVALID";
  if (reading.freshness === "HISTORICAL") return "HISTORICAL";
  if (!connected) return "DISCONNECTED";
  const age =
    Math.max(
      serverNow - Date.parse(reading.observed_at),
      serverNow - Date.parse(reading.received_at),
    ) / 1000;
  if (!Number.isFinite(now) || !Number.isFinite(age)) return "INVALID";
  if (age > disconnectSeconds) return "DISCONNECTED";
  if (age > staleSeconds) return "STALE";
  return reading.freshness;
}

/** A delayed creation frame must never undo a durable acknowledgment. */
export function mergeAlerts(
  previous: import("./services/api").Alert[],
  incoming: import("./services/api").Alert[],
) {
  const unique = new Map(previous.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (
      unique.get(item.id)?.state !== "ACKNOWLEDGED" ||
      item.state === "ACKNOWLEDGED"
    )
      unique.set(item.id, item);
  }
  return [...unique.values()]
    .sort(
      (a, b) =>
        Number(b.state === "PENDING_REVIEW") -
          Number(a.state === "PENDING_REVIEW") ||
        a.priority - b.priority ||
        b.id - a.id,
    )
    .slice(0, 200);
}
