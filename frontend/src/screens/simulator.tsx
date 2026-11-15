import { useEffect, useState } from "react";
import { elapsed, Empty, Panel, stamp, Status } from "../components/medical";
import type { ControlCommand } from "../services/api";
import type { ScreenProps } from "./types";

export function SimulatorControls({
  mission,
  crewId,
  busy,
  action,
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
            Restart revives all crew, resets vitals and ECG using this seed, and
            clears faults and manual overrides. Existing examinations and
            history remain intact, under their original run IDs.
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
        <FaultInjection
          key={`${crewId}-${control.run_id}-${control.astronaut_id}-${control.fault}`}
          control={control}
          crewId={crewId}
          crewName={
            mission.crew.find((crew) => crew.id === crewId)?.display_name ??
            crewId
          }
          busy={busy}
          send={send}
        />
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

const FAULTS = [
  { value: "NONE", label: "None", description: "Normal simulated readings." },
  {
    value: "OXYGEN",
    label: "Low oxygen",
    description: "Gradually lowers oxygen saturation.",
  },
  {
    value: "PRESSURE",
    label: "Low suit pressure",
    description: "Gradually lowers suit pressure.",
  },
  {
    value: "BOTH",
    label: "Low oxygen + pressure",
    description: "Lowers oxygen saturation and suit pressure together.",
  },
  {
    value: "PULSE_SURGE",
    label: "Fast heart rate",
    description: "Gradually raises heart rate.",
  },
  {
    value: "PULSE_DECREASE",
    label: "Slow heart rate",
    description: "Gradually lowers heart rate.",
  },
  {
    value: "RESPIRATORY_SURGE",
    label: "Fast breathing",
    description: "Gradually raises respiratory rate.",
  },
  {
    value: "MULTI_SYSTEM",
    label: "Combined stress",
    description:
      "Raises heart and breathing rates; lowers oxygen and suit pressure.",
  },
  {
    value: "DISCONNECT",
    label: "Sensor disconnected",
    description: "Stops new readings from this crew’s monitor.",
  },
  {
    value: "SENSOR_ERROR",
    label: "Unreliable sensor",
    description: "Marks this crew’s readings as invalid.",
  },
] as const;

function FaultInjection({
  control,
  crewId,
  crewName,
  busy,
  send,
}: {
  control: NonNullable<ScreenProps["mission"]["operations"]>["control"];
  crewId: string;
  crewName: string;
  busy: boolean;
  send: (values: Omit<ControlCommand, "expected_revision">) => Promise<boolean>;
}) {
  const [fault, setFault] = useState<NonNullable<ControlCommand["fault"]>>(
    control.astronaut_id === crewId ? control.fault : "NONE",
  );
  const applied = control.astronaut_id === crewId ? control.fault : "NONE";
  const selection = FAULTS.find((item) => item.value === fault)!;
  const appliedLabel = FAULTS.find((item) => item.value === applied)!.label;
  return (
    <Panel
      title="Fault injection"
      action={<span className="caption">SIMULATED</span>}
    >
      <p className="caption">Applies to {crewName} only.</p>
      <label className="field">
        Fault
        <select
          value={fault}
          aria-describedby="fault-effect"
          disabled={busy}
          onChange={(e) =>
            setFault(e.target.value as NonNullable<ControlCommand["fault"]>)
          }
        >
          {FAULTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p id="fault-effect" className="caption">
        {selection.description}
      </p>
      <div className="button-row fault-actions">
        <button
          className="primary-button"
          disabled={busy || fault === applied}
          onClick={() =>
            void send({
              action: "CONFIGURE",
              fault,
              astronaut_id: crewId as ControlCommand["astronaut_id"],
              ...([
                "OXYGEN",
                "PRESSURE",
                "BOTH",
                "PULSE_SURGE",
                "PULSE_DECREASE",
                "RESPIRATORY_SURGE",
                "MULTI_SYSTEM",
              ].includes(fault)
                ? { scenario: "ANOMALY" as const }
                : {}),
            })
          }
        >
          Apply fault
        </button>
        <span
          className={applied === "NONE" ? "caption" : "fault-active"}
          role="status"
        >
          Applied: {appliedLabel}
        </span>
      </div>
    </Panel>
  );
}
