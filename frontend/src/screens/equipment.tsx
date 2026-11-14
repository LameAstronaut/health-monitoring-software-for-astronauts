import { Empty, Panel, stamp, Status } from "../components/medical";
import type { ScreenProps } from "./types";

export function Equipment({ mission, navigate }: ScreenProps) {
  return (
    <div className="screen-stack">
      <div className="info-banner">
        Virtual instruments only. Connectivity describes the demo worker; no
        physical equipment is connected or controlled.
      </div>
      {!mission.devices.length ? (
        <Empty title="Equipment registry unavailable">
          Reconnect to the local API and refresh the registry.
        </Empty>
      ) : (
        <div className="equipment-grid">
          {[...mission.devices]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((device) => (
              <Panel
                key={device.id}
                title={device.model}
                action={
                  <Status
                    value={mission.connected ? device.status : "DISCONNECTED"}
                  />
                }
              >
                <p className="device-id">{device.id}</p>
                <Status value="SIMULATED" />
                <dl className="detail-list">
                  <div>
                    <dt>Association</dt>
                    <dd>
                      {mission.crew.find((c) => c.id === device.astronaut_id)
                        ?.display_name ?? "Shared examination instrument"}
                    </dd>
                  </div>
                  <div>
                    <dt>Acquisition</dt>
                    <dd>
                      {device.kind === "CONTINUOUS"
                        ? "Continuous · numeric + ECG"
                        : "Examination event only"}
                    </dd>
                  </div>
                  <div>
                    <dt>Last accepted sample</dt>
                    <dd>{stamp(device.last_seen, true)}</dd>
                  </div>
                  <div>
                    <dt>Model version</dt>
                    <dd>{device.firmware}</dd>
                  </div>
                  <div>
                    <dt>Calibration</dt>
                    <dd>{device.calibration.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
                <p className="caption">{device.calibration_note}</p>
                <div className="capability-tags">
                  {device.capabilities?.map((code) => (
                    <span key={code}>{code.replaceAll("_", " ")}</span>
                  ))}
                </div>
                {device.last_error && (
                  <div className="error-inline">{device.last_error}</div>
                )}
                <button
                  className="link-button"
                  onClick={() =>
                    navigate(
                      device.kind === "CONTINUOUS"
                        ? "Simulator controls"
                        : "Examinations",
                    )
                  }
                >
                  {device.kind === "CONTINUOUS"
                    ? "Inspect simulator controls"
                    : "Open examination center"}{" "}
                  →
                </button>
              </Panel>
            ))}
        </div>
      )}
    </div>
  );
}
