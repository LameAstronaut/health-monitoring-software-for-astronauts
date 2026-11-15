import { Panel, stamp, Status } from "./medical";
import type { VehicleRadiationSnapshot } from "../services/api";

// Vehicle equipment only: these sensors have no crew association.
const SENSORS = [
  { id: "VEH-RAD-001", location: "Main cabin" },
  { id: "VEH-RAD-002", location: "Airlock" },
  { id: "VEH-RAD-003", location: "Radiation shelter" },
];

export function VehicleRadiation({
  data,
  now,
  staleSeconds = 5,
  disconnectSeconds = 15,
}: {
  data?: VehicleRadiationSnapshot;
  now: number;
  staleSeconds?: number;
  disconnectSeconds?: number;
}) {
  // Age locally too, so a failed request cannot leave old radiation data live.
  const freshness = (reading: VehicleRadiationSnapshot["readings"][number]) => {
    if (!reading.observed_at) return "NOT_AVAILABLE";
    const age = (now - Date.parse(reading.observed_at)) / 1000;
    if (age > disconnectSeconds) return "DISCONNECTED";
    if (age > staleSeconds && reading.freshness === "LIVE") return "STALE";
    return reading.freshness ?? "NOT_AVAILABLE";
  };
  return (
    <Panel
      title="Space vehicle radiation sensors"
      action={<Status value="SIMULATED" />}
    >
      <p>
        Shared vehicle environmental monitoring. These readings belong to the
        space vehicle and are the same for every crew selection. They are not
        personal dosimetry or individual exposure records.
      </p>
      <div className="table-scroll">
        <table aria-label="Vehicle radiation sensors">
          <thead>
            <tr>
              <th>Sensor</th>
              <th>Vehicle location</th>
              <th>Absorbed dose rate (µGy/h)</th>
              <th>Accumulated absorbed dose (mGy)</th>
              <th>Last reading</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {SENSORS.map((sensor) => {
              const reading = data?.readings.find(
                (item) => item.sensor_id === sensor.id,
              );
              return (
                <tr key={sensor.id}>
                  <td>{sensor.id}</td>
                  <td>{sensor.location}</td>
                  <td>
                    {reading?.dose_rate_ugy_h?.toFixed(2) ?? "Not available"}
                  </td>
                  <td>
                    {reading?.accumulated_dose_mgy?.toFixed(6) ??
                      "Not available"}
                  </td>
                  <td>
                    {reading?.observed_at
                      ? stamp(reading.observed_at, true)
                      : "No reading received"}
                  </td>
                  <td>
                    <Status
                      value={reading ? freshness(reading) : "NOT_AVAILABLE"}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="caption">
        {data
          ? `${data.vehicle_id} · Simulation time ${data.simulated_at.toFixed(1)} s. `
          : "Awaiting the vehicle simulator. "}
        Accumulated environmental dose is integrated from simulation run start
        (0 s) and resets on restart. These are arbitrary simulated sensor
        readings; no personal dose is inferred.
      </p>
    </Panel>
  );
}
