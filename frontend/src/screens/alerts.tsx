import { useState } from "react";
import { Empty, NAMES, Panel, stamp, Status } from "../components/medical";
import type { ScreenProps } from "./types";

export function Alerts({ mission, crewId, action, busy }: ScreenProps) {
  const [filter, setFilter] = useState("ALL");
  const alerts = [...mission.alerts]
    .filter(
      (a) =>
        a.astronaut_id === crewId && (filter === "ALL" || a.state === filter),
    )
    .sort((a, b) => a.priority - b.priority || b.id - a.id);
  return (
    <Panel
      title="Alert review & history"
      action={
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">All history</option>
            <option value="PENDING_REVIEW">Pending review</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
          </select>
        </label>
      }
    >
      <p className="caption">
        Priority 1 precedes priority 2. These are versioned synthetic scenario
        markers, not clinical diagnoses. Acknowledgment records a demo operator
        action.
      </p>
      {!alerts.length ? (
        <Empty title="No matching demo alerts">
          Use a reproducible anomaly scenario to inspect rule evidence. An empty
          queue is not a medical assessment.
        </Empty>
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => (
            <article
              className={`alert-record priority-${alert.priority}`}
              key={alert.id}
            >
              <div className="alert-record-heading">
                <div>
                  <span className="priority-label">P{alert.priority}</span>
                  <Status value={alert.severity} />
                  <Status value={alert.state ?? "PENDING_REVIEW"} />
                </div>
                <span>{stamp(alert.occurred_at, true)}</span>
              </div>
              <h3>{alert.message}</h3>
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Triggering measurement</th>
                    <th>Value</th>
                    <th>Observed</th>
                    <th>Instrument</th>
                  </tr>
                </thead>
                <tbody>
                  {alert.evidence.map((e) => (
                    <tr key={e.id}>
                      <td>{NAMES[e.code]}</td>
                      <td>
                        {e.value} {e.unit}
                      </td>
                      <td>{stamp(e.observed_at)}</td>
                      <td>{e.device_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <details>
                <summary>Rule & provenance</summary>
                <p className="monospace">
                  Rule: {alert.rule_id} / {alert.rule_version}
                  <br />
                  Event: {alert.event_id}
                  <br />
                  Crew: {alert.astronaut_id}
                  <br />
                  Origin: SIMULATED
                </p>
              </details>
              {alert.state === "PENDING_REVIEW" ? (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      `alerts/${alert.id}/acknowledge`,
                      undefined,
                      "Demo alert acknowledged",
                    )
                  }
                >
                  Acknowledge demo alert
                </button>
              ) : (
                <p className="success-inline">
                  Acknowledged by {alert.acknowledged_by} ·{" "}
                  {stamp(alert.acknowledged_at, true)}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
