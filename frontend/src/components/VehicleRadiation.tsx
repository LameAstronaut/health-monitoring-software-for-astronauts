import { Panel, Status } from "./medical";

// Vehicle equipment only: these sensors have no crew association.
const SENSORS = [
  { id: "VEH-RAD-001", location: "Main cabin" },
  { id: "VEH-RAD-002", location: "Airlock" },
  { id: "VEH-RAD-003", location: "Radiation shelter" },
];

export function VehicleRadiation() {
  return (
    <Panel
      title="Space vehicle radiation sensors"
      action={<Status value="NOT_AVAILABLE" />}
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
            {SENSORS.map((sensor) => (
              <tr key={sensor.id}>
                <td>{sensor.id}</td>
                <td>{sensor.location}</td>
                <td>Not available</td>
                <td>Not available</td>
                <td>No reading received</td>
                <td>
                  <Status value="NOT_AVAILABLE" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">
        No vehicle radiation sensor feed is connected. Accumulated dose will
        require a documented measurement start time; no personal dose is
        inferred.
      </p>
    </Panel>
  );
}
