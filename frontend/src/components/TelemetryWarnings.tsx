import type { ScreenProps } from "../screens/types";
import type { Observation } from "../services/api";
import { displayState } from "../telemetry";
import { stamp } from "./medical";

export function TelemetryWarnings({
  mission,
  navigate,
}: Pick<ScreenProps, "mission" | "navigate">) {
  if (mission.loading) return null;
  if (!mission.connected)
    return (
      <aside className="error-banner" role="alert">
        <div>
          <strong>Live telemetry connection lost</strong>
          <p>
            Sensor status cannot be confirmed. Displayed values are last known
            readings. Reconnect to the backend to resume live monitoring.
          </p>
        </div>
        <button onClick={() => void mission.refresh()}>
          Reconnect telemetry
        </button>
      </aside>
    );
  const latest = new Map<string, Observation>();
  for (const reading of [
    ...mission.summaries.flatMap((summary) => summary.readings),
    ...mission.observations,
  ]) {
    if (reading.examination_id) continue;
    const previous = latest.get(reading.device_id);
    if (
      !previous ||
      Date.parse(reading.observed_at) > Date.parse(previous.observed_at) ||
      (reading.observed_at === previous.observed_at && reading.id > previous.id)
    )
      latest.set(reading.device_id, reading);
  }
  const control = mission.operations?.control;
  const failed = mission.devices.filter((device) => {
    if (device.kind !== "CONTINUOUS") return false;
    const injectedDisconnect =
      control?.astronaut_id === device.astronaut_id &&
      control.fault === "DISCONNECT";
    if (control?.running === false && !injectedDisconnect)
      return device.status === "ERROR";
    const reading = latest.get(device.id);
    return (
      device.status === "DISCONNECTED" ||
      device.status === "ERROR" ||
      (reading &&
        displayState(
          reading,
          true,
          mission.now,
          mission.serverNow,
          mission.health?.stale_seconds ?? 5,
          mission.health?.disconnect_seconds ?? 15,
        ) === "DISCONNECTED")
    );
  });
  if (!failed.length) return null;
  return (
    <aside className="error-banner" role="alert">
      <div>
        <strong>Sensor connection / quality warning</strong>
        <ul>
          {failed.map((device) => (
            <li key={device.id}>
              {mission.crew.find((crew) => crew.id === device.astronaut_id)
                ?.display_name ?? device.astronaut_id}
              {" · "}
              {device.id}:{" "}
              {device.status === "ERROR"
                ? "Sensor quality error — readings are unreliable."
                : "Sensor disconnected — no live measurements."}{" "}
              Last received:{" "}
              {stamp(
                latest.get(device.id)?.received_at ?? device.last_seen,
                true,
              )}
              .
            </li>
          ))}
        </ul>
        <p>
          Check the sensor connection and simulator worker. For an injected
          fault, select None in Fault injection and press Apply fault. Wait for
          fresh valid readings to resume live monitoring.
        </p>
      </div>
      <button onClick={() => navigate("Equipment")}>Check sensors</button>
    </aside>
  );
}
