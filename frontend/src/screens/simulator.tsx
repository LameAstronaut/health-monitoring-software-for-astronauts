import { ManualTelemetry } from "../components/ManualTelemetry";
import { useEffect, useState } from "react";
import { elapsed, Empty, Panel, stamp, Status } from "../components/medical";
import type { ControlCommand } from "../services/api";
import type { ScreenProps } from "./types";

export function SimulatorControls({
  mission,
  crewId,
  busy,
  action,
  ...rest
}: ScreenProps) {
  const control = mission.operations?.control;
  const [seed, setSeed] = useState(42);
  useEffect(() => {
    if (control?.seed !== undefined) setSeed(control.seed);
  }, [control?.seed]);
  if (!control)
    return (
      <Empty title="Simulator controls unavailable">
        Reconnect to the local backend to load persisted playback settings.
      </Empty>
    );
  const send = (values: Omit<ControlCommand, "expected_revision">) =>
    action(
      "demo/control",
      { expected_revision: control.revision ?? 0, ...values },
      "Playback settings updated",
    );
  const workerLive =
    control.worker_seen &&
    mission.serverNow - Date.parse(control.worker_seen) < 5000;
  return (
    <div className="screen-stack">
      <ManualTelemetry
        key={`${crewId}-${control.run_id}`}
        mission={mission}
        crewId={crewId}
        busy={busy}
        action={action}
        {...rest}
      />
      <div className="two-columns">
        <Panel
          title="Playback"
          action={
            <Status
              value={
                workerLive
                  ? (control.worker_state ?? "NOT_AVAILABLE")
                  : "DISCONNECTED"
              }
            />
          }
        >
          <div className="playback-clock">
            <span>{elapsed(control.simulated_at ?? 0)}</span>
            <p>
              Simulated time · target{" "}
              {
                mission.crew.find((c) => c.id === control.astronaut_id)
                  ?.display_name
              }
            </p>
          </div>
          <div className="button-row">
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void send({ action: control.running ? "PAUSE" : "RESUME" })
              }
            >
              {control.running ? "Pause simulation" : "Resume simulation"}
            </button>
            <span className="muted">
              Desired state: {control.running ? "RUNNING" : "PAUSED"}
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Worker heartbeat</dt>
              <dd>{stamp(control.worker_seen)}</dd>
            </div>
            <div>
              <dt>Control revision</dt>
              <dd>
                {control.worker_revision ?? -1} acknowledged /{" "}
                {control.revision ?? 0} requested
              </dd>
            </div>
            <div>
              <dt>Playback run</dt>
              <dd className="monospace">{control.run_id.slice(0, 12)}</dd>
            </div>
          </dl>
          {!workerLive && (
            <p className="error-inline">
              Worker is not connected. Run <code>make dev</code> or start the
              Rust CLI with <code>--controlled</code>. Changing a desired
              setting does not create telemetry.
            </p>
          )}
        </Panel>
        <Panel title="Scenario & sampling">
          <label className="field">
            Scenario for selected crew
            <select
              disabled={busy}
              value={control.scenario}
              onChange={(e) =>
                void send({
                  action: "CONFIGURE",
                  scenario: e.target.value as ControlCommand["scenario"],
                  astronaut_id: crewId as ControlCommand["astronaut_id"],
                  fault: e.target.value === "ANOMALY" ? "BOTH" : "NONE",
                })
              }
            >
              <option value="REST">REST · stable baseline</option>
              <option value="EXERCISE">
                EXERCISE · gradual demand increase
              </option>
              <option value="RECOVERY">RECOVERY · gradual return</option>
              <option value="ANOMALY">
                ANOMALY · reproducible test markers
              </option>
            </select>
          </label>
          <label className="field">
            Simulation speed
            <select
              disabled={busy}
              value={control.speed ?? 1}
              onChange={(e) =>
                void send({
                  action: "CONFIGURE",
                  speed: Number(e.target.value) as ControlCommand["speed"],
                })
              }
            >
              {[0.25, 0.5, 1, 2, 4].map((speed) => (
                <option key={speed} value={speed}>
                  {speed}× simulated time
                </option>
              ))}
            </select>
          </label>
          <p className="caption">
            Physiology integration: 25 Hz. ECG sampling: 125 Hz in simulated
            time. Default publication: 1 Hz. UI event batching: 4 Hz. Speed
            changes model time; it does not invent extra independent readings.
          </p>
        </Panel>
      </div>
      <div className="two-columns">
        <Panel title="Seeded replay">
          <label className="field">
            Seed
            <input
              type="number"
              min="0"
              max="4294967295"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
            />
          </label>
          <p className="caption">
            Restart resets physiological state and ECG phase using this seed.
            Existing examinations and history remain intact, under their
            original run IDs.
          </p>
          <button
            disabled={
              busy || !Number.isInteger(seed) || seed < 0 || seed > 4294967295
            }
            onClick={() =>
              void send({
                action: "RESTART",
                seed,
                astronaut_id: crewId as ControlCommand["astronaut_id"],
              })
            }
          >
            Restart seeded playback
          </button>
        </Panel>
        <Panel title="Fault injection">
          <label className="field">
            Synthetic sensor / anomaly fault
            <select
              value={control.fault ?? "NONE"}
              disabled={busy}
              onChange={(e) =>
                void send({
                  action: "CONFIGURE",
                  fault: e.target.value as ControlCommand["fault"],
                  astronaut_id: crewId as ControlCommand["astronaut_id"],
                  ...([
                    "OXYGEN",
                    "PRESSURE",
                    "BOTH",
                    "PULSE_SURGE",
                    "RESPIRATORY_SURGE",
                    "MULTI_SYSTEM",
                  ].includes(e.target.value)
                    ? { scenario: "ANOMALY" as const }
                    : {}),
                })
              }
            >
              <option value="NONE">None</option>
              <option value="OXYGEN">Gradual oxygen-decrease fixture</option>
              <option value="PRESSURE">Gradual suit-pressure fixture</option>
              <option value="BOTH">Oxygen + pressure · priority 1 & 2</option>
              <option value="PULSE_SURGE">Pulse rise · priority 2</option>
              <option value="RESPIRATORY_SURGE">
                Respiratory rise · priority 1
              </option>
              <option value="MULTI_SYSTEM">
                Combined stress · all four markers
              </option>
              <option value="DISCONNECT">Sensor disconnected</option>
              <option value="SENSOR_ERROR">Sensor quality error</option>
            </select>
          </label>
          <p className="caption">
            Anomaly markers are arbitrary demonstration settings. They are not
            clinical or spacesuit operating limits. Every new anomaly marker
            opens a full-screen alert. Disconnect and quality faults affect only
            the target crew.
          </p>
        </Panel>
      </div>
      <div className="info-banner">
        Simplified, non-validated dynamics: individual baselines, smooth
        first-order exercise/recovery response, correlated respiration, and a
        synthetic ECG shape. No diagnosis, treatment recommendation, or hardware
        actuation.
      </div>
    </div>
  );
}
