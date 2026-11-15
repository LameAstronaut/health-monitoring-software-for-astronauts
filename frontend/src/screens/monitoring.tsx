import { CrewAvatar } from "../components/CrewAvatar";
import { upcomingTasks } from "../examinationSchedule";
import { ExaminationCalendar } from "../components/ExaminationCalendar";
import { useVitalRecovery } from "../useVitalRecovery";
import { useState } from "react";
import {
  EcgChart,
  Empty,
  METRICS,
  MetricCard,
  NAMES,
  Panel,
  stamp,
  Status,
  TrendChart,
} from "../components/medical";
import { displayState } from "../telemetry";
import type { ScreenProps } from "./types";

export function MetricGrid({
  mission,
  crewId,
  deceasedCrewIds,
}: Pick<ScreenProps, "mission" | "crewId" | "deceasedCrewIds">) {
  const deceased = deceasedCrewIds?.has(crewId) ?? false;
  const recovering = useVitalRecovery(mission, crewId);
  const crew = mission.crew.find((c) => c.id === crewId);
  const suit = mission.devices.find(
    (d) => d.astronaut_id === crewId && d.kind === "CONTINUOUS",
  );
  return (
    <div className="metric-grid">
      {METRICS.map((metric) => (
        <MetricCard
          key={metric.code}
          code={metric.code}
          reading={mission.observations
            .filter(
              (o) =>
                o.astronaut_id === crewId &&
                o.code === metric.code &&
                !o.examination_id,
            )
            .at(-1)}
          connected={mission.connected}
          now={mission.now}
          serverNow={mission.serverNow}
          stale={mission.health?.stale_seconds}
          disconnect={mission.health?.disconnect_seconds}
          deviceStatus={suit?.status}
          baseline={crew?.baseline?.[metric.code]}
          deceased={deceased}
          recovering={!deceased && recovering.has(metric.code)}
        />
      ))}
    </div>
  );
}

export function CrewStrip({
  mission,
  crewId,
  selectCrew,
  deceasedCrewIds,
}: Pick<ScreenProps, "mission" | "crewId" | "selectCrew" | "deceasedCrewIds">) {
  return (
    <div className="crew-strip">
      {mission.crew.map((crew) => {
        const summary = mission.summaries.find((c) => c.crew.id === crew.id);
        const reading = [...(summary?.readings ?? []), ...mission.observations]
          .filter(
            (r) =>
              r.astronaut_id === crew.id &&
              r.code === "heart_rate" &&
              !r.examination_id,
          )
          .sort(
            (a, b) =>
              Date.parse(a.observed_at) - Date.parse(b.observed_at) ||
              a.id - b.id,
          )
          .at(-1);
        const state = displayState(
          reading,
          mission.connected,
          mission.now,
          mission.serverNow,
          mission.health?.stale_seconds ?? 5,
          mission.health?.disconnect_seconds ?? 15,
        );
        return (
          <button
            className={`crew-summary ${crewId === crew.id ? "selected" : ""}`}
            key={crew.id}
            onClick={() => selectCrew(crew.id)}
            aria-pressed={crewId === crew.id}
          >
            <CrewAvatar crew={crew} />
            <span className="crew-summary-name">
              <strong>{crew.display_name}</strong>
              <span>{crew.role}</span>
            </span>
            <span className="crew-summary-reading">
              {reading?.quality === "VALID"
                ? `${reading.value.toFixed(0)} bpm`
                : "No data"}
              <Status
                value={deceasedCrewIds?.has(crew.id) ? "DECEASED" : state}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Dashboard(props: ScreenProps) {
  const { mission, crewId, navigate, action, busy } = props;
  const alerts = mission.alerts.filter(
    (a) => a.astronaut_id === crewId && a.state === "PENDING_REVIEW",
  );
  const tasks = upcomingTasks(mission.operations, crewId, mission.serverNow);
  return (
    <div className="screen-stack">
      <CrewStrip {...props} />
      <MetricGrid {...props} />
      <div className="dashboard-grid">
        <Panel title="ECG · synthetic lead">
          <EcgChart
            deceased={props.deceasedCrewIds?.has(crewId)}
            chunks={mission.waveforms}
            connected={mission.connected}
            serverNow={mission.serverNow}
            stale={mission.health?.stale_seconds}
            disconnect={mission.health?.disconnect_seconds}
          />
        </Panel>
        <Panel
          title="Review queue"
          action={<span className="count">{alerts.length} pending</span>}
        >
          {alerts.length ? (
            alerts.slice(0, 3).map((alert) => (
              <div
                className={`alert-preview priority-${alert.priority}`}
                key={alert.id}
              >
                <div>
                  <Status value={alert.severity} />
                  <span>{stamp(alert.occurred_at)}</span>
                </div>
                <h3>{alert.message}</h3>
                <button
                  className="link-button"
                  onClick={() => navigate("Alerts")}
                >
                  Inspect evidence →
                </button>
              </div>
            ))
          ) : (
            <Empty title="No pending demo alerts">
              No matching synthetic test markers are awaiting acknowledgment.
              This does not indicate crew health.
            </Empty>
          )}
        </Panel>
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Heart rate trend"
          action={
            <button
              className="link-button"
              onClick={() => navigate("Live monitoring")}
            >
              Open live monitoring ↗
            </button>
          }
        >
          <TrendChart readings={mission.observations} code="heart_rate" />
          <p className="caption">
            Stable display scale · Source timestamps · Synthetic fixture
            dynamics
          </p>
        </Panel>
        <Panel
          title="Upcoming tasks"
          action={<span className="muted">{tasks.length} today · UTC</span>}
        >
          {tasks.length ? (
            <ul className="task-list">
              {tasks.map((task) => (
                <li key={task.id}>
                  <span className="task-icon">□</span>
                  <div>
                    <h3>{task.title}</h3>
                    <p>{stamp(task.due_at, true)} · SIMULATED</p>
                    <button
                      className="link-button"
                      onClick={() => navigate(task.destination)}
                    >
                      Open {task.destination.toLowerCase()} →
                    </button>
                  </div>
                  {!task.examination && (
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Complete task: ${task.title}`}
                      onClick={() =>
                        void action(
                          `tasks/${task.id}/complete`,
                          undefined,
                          "Demo task completed",
                        )
                      }
                    >
                      ✓
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No pending tasks">
              No pending tasks scheduled for today (UTC). View the calendar for
              other days.
            </Empty>
          )}
        </Panel>
      </div>
      <ExaminationCalendar {...props} />
    </div>
  );
}

export function LiveMonitoring(props: ScreenProps) {
  const [code, setCode] = useState("heart_rate");
  const [minutes, setMinutes] = useState(5);
  return (
    <div className="screen-stack">
      <MetricGrid {...props} />
      <Panel
        title="Longitudinal telemetry"
        action={
          <div className="inline-controls">
            <label>
              Measurement
              <select value={code} onChange={(e) => setCode(e.target.value)}>
                {METRICS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Window
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                <option value="1">Last minute</option>
                <option value="5">Last 5 minutes</option>
                <option value="10">Last 10 minutes</option>
              </select>
            </label>
          </div>
        }
      >
        <TrendChart
          readings={props.mission.observations}
          code={code}
          minutes={minutes}
        />
        <p className="caption">
          History is bounded to the latest 2,400 observations in this session.
          Ranges describe recorded values, not clinical limits.
        </p>
      </Panel>
      <Panel title="Continuous ECG waveform">
        <EcgChart
          deceased={props.deceasedCrewIds?.has(props.crewId)}
          chunks={props.mission.waveforms}
          connected={props.mission.connected}
          serverNow={props.mission.serverNow}
          stale={props.mission.health?.stale_seconds}
          disconnect={props.mission.health?.disconnect_seconds}
        />
      </Panel>
      <History {...props} />
    </div>
  );
}

export function History({
  mission,
  crewId,
}: Pick<ScreenProps, "mission" | "crewId">) {
  const values = mission.observations
    .filter((o) => o.astronaut_id === crewId)
    .slice(-32)
    .reverse();
  return (
    <Panel
      title="Observation history"
      action={
        <span className="muted">Latest {values.length} observations</span>
      }
    >
      {!values.length ? (
        <Empty title="No observations recorded">
          Run the simulator or acquire a demonstration examination. No
          historical values are invented.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Observed · UTC</th>
                <th>Measurement</th>
                <th>Value</th>
                <th>Quality</th>
                <th>Instrument / provenance</th>
              </tr>
            </thead>
            <tbody>
              {values.map((value) => (
                <tr key={value.id}>
                  <td>
                    {stamp(value.observed_at, true)}
                    <small>Received {stamp(value.received_at)}</small>
                  </td>
                  <td>
                    {NAMES[value.code]}
                    <small>
                      #{value.id} · sequence {value.sequence}
                      {value.sequence_gap ? " · SEQUENCE GAP" : ""}
                    </small>
                  </td>
                  <td className="numeric">
                    {value.value.toFixed(1)} {value.unit}
                  </td>
                  <td>
                    <Status value={value.quality} />
                  </td>
                  <td>
                    {value.device_id}
                    <small>SIMULATED · {value.event_id}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function CrewProfiles(props: ScreenProps) {
  const crew = props.mission.crew.find((c) => c.id === props.crewId);
  return (
    <div className="screen-stack">
      <CrewStrip {...props} />
      <div className="two-columns">
        <Panel title="Crew profile">
          {crew ? (
            <>
              <div className="profile-heading">
                <CrewAvatar crew={crew} large />
                <div>
                  <h2>{crew.display_name}</h2>
                  <p>{crew.role}</p>
                  <Status value="SIMULATED" />
                </div>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Stable identity</dt>
                  <dd>{crew.id}</dd>
                </div>
                <div>
                  <dt>Mission</dt>
                  <dd>{crew.mission_id}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>Entirely synthetic demo identity</dd>
                </div>
              </dl>
            </>
          ) : (
            <Empty title="Crew registry unavailable" />
          )}
        </Panel>
        <Panel title="Individual simulation baseline">
          <p className="caption">
            These constants initialize this crew's model. They are not reference
            intervals, clinical targets, or astronaut-specific measurements.
          </p>
          <dl className="detail-list">
            {METRICS.map((metric) => (
              <div key={metric.code}>
                <dt>{metric.label}</dt>
                <dd>
                  {crew?.baseline?.[metric.code] ?? "Unavailable"} {metric.unit}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      <Panel title="Recent heart-rate history">
        <TrendChart readings={props.mission.observations} code="heart_rate" />
      </Panel>
      <History {...props} />
    </div>
  );
}
