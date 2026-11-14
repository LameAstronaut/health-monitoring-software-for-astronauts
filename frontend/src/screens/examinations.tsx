import { useState } from "react";
import { Empty, NAMES, Panel, stamp, Status } from "../components/medical";
import type { Examination } from "../services/api";
import type { ScreenProps } from "./types";

const EXAMS = [
  {
    kind: "BLOOD_PRESSURE",
    label: "Blood pressure",
    device: "DEMO-BP-001",
    description: "Event-based cuff fixture · systolic / diastolic",
  },
  {
    kind: "LAB_PANEL",
    label: "Laboratory panel",
    device: "DEMO-LAB-001",
    description: "Synthetic report · WBC / hemoglobin",
  },
  {
    kind: "BONE_DENSITY",
    label: "Bone density",
    device: "DEMO-DXA-001",
    description: "Synthetic report · bone mineral density",
  },
] as const;

function downloadReport(exam: Examination) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(exam, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${exam.id}-SIMULATED.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function Examinations({
  mission,
  crewId,
  busy,
  action,
  navigate,
  deceasedCrewIds,
}: ScreenProps) {
  const deceased = deceasedCrewIds?.has(crewId) ?? false;
  const [kind, setKind] = useState<string>("BLOOD_PRESSURE");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string>();
  const definition = EXAMS.find((e) => e.kind === kind)!;
  const exams =
    mission.operations?.examinations.filter((e) => e.astronaut_id === crewId) ??
    [];
  const active = exams.find(
    (e) => e.status === "ACQUIRING" || e.status === "REVIEW",
  );
  const report = active ?? exams.find((e) => e.id === selected);
  const saved = exams.filter((e) => e.status === "SAVED");
  const failed = exams.find((e) => e.status === "FAILED");
  return (
    <div className="screen-stack">
      <div className="workflow-steps" aria-label="Examination workflow">
        {[
          "1 · Select crew & instrument",
          "2 · Acquire",
          "3 · Review",
          "4 · Save",
        ].map((step, i) => (
          <span
            className={
              i ===
              (active?.status === "ACQUIRING"
                ? 1
                : active?.status === "REVIEW"
                  ? 2
                  : 0)
                ? "current"
                : ""
            }
            key={step}
          >
            {step}
          </span>
        ))}
      </div>
      <div className="examination-grid">
        <Panel title="New simulated examination">
          <p className="caption">
            Crew:{" "}
            <strong>
              {mission.crew.find((c) => c.id === crewId)?.display_name ??
                crewId}
            </strong>
            . Use the crew selector in the header to change participants.
          </p>
          {deceased && (
            <p className="error-inline">
              Crew is deceased in this simulation run. Restart playback to
              acquire new results.
            </p>
          )}
          <fieldset disabled={busy || Boolean(active) || deceased}>
            <legend>Examination type</legend>
            <div className="exam-options">
              {EXAMS.map((exam) => (
                <label
                  className={`exam-option ${kind === exam.kind ? "selected" : ""}`}
                  key={exam.kind}
                >
                  <input
                    type="radio"
                    name="examination-type"
                    value={exam.kind}
                    checked={kind === exam.kind}
                    onChange={() => setKind(exam.kind)}
                  />
                  <span>
                    <strong>{exam.label}</strong>
                    <span>{exam.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="field">
              Instrument
              <select
                aria-label="Examination instrument"
                value={definition.device}
                onChange={() => {}}
              >
                <option value={definition.device}>
                  {mission.devices.find((d) => d.id === definition.device)
                    ?.model ?? definition.device}
                </option>
              </select>
            </label>
            <div className="instrument-note">
              <Status
                value={
                  mission.devices.find((d) => d.id === definition.device)
                    ?.status ?? "NOT_AVAILABLE"
                }
              />
              <span>SIMULATED · Calibration unknown</span>
            </div>
            <button
              className="primary-button full-width"
              disabled={
                !mission.connected || !mission.operations?.control.running
              }
              onClick={() =>
                void action(
                  "examinations",
                  { astronaut_id: crewId, kind, device_id: definition.device },
                  "Acquisition requested from the Rust simulator",
                )
              }
            >
              Initiate simulated acquisition
            </button>
          </fieldset>
          {!mission.operations?.control.running && (
            <p className="hint">
              Resume playback in{" "}
              <button
                className="link-button"
                onClick={() => navigate("Simulator controls")}
              >
                Simulator controls
              </button>{" "}
              before acquiring.
            </p>
          )}
          {failed && (
            <p className="error-inline">
              Previous acquisition failed: {failed.error}. Select an examination
              and retry.
            </p>
          )}
          <p className="caption">
            Static measurements change only after a corresponding acquisition.
            These fixtures are not diagnostic results.
          </p>
        </Panel>
        <Panel
          id="examination-review"
          title={
            report?.status === "SAVED"
              ? "Saved examination report"
              : "Acquisition & review"
          }
          action={report && <Status value={report.status} />}
        >
          {!report ? (
            <Empty title="Ready for an examination">
              Select a crew member and virtual instrument, acquire a result,
              then explicitly review and save it here.
            </Empty>
          ) : report.status === "ACQUIRING" ? (
            <div className="acquisition-state" role="status">
              <span className="empty-symbol">⌁</span>
              <h3>Waiting for virtual instrument…</h3>
              <p>
                Requested {stamp(report.started_at)}. The Rust worker must
                return a complete, validated result.
              </p>
              <p className="caption">
                No result is generated by the browser. A lost connection will
                time out visibly.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void action(
                    `examinations/${report.id}/actions`,
                    { action: "CANCEL" },
                    "Acquisition cancelled",
                  )
                }
              >
                Cancel acquisition
              </button>
            </div>
          ) : (
            <>
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Measurement</th>
                    <th>Result</th>
                    <th>Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results?.map((result) => (
                    <tr key={result.code}>
                      <td>{NAMES[result.code]}</td>
                      <td className="numeric">
                        {result.value.toFixed(
                          result.code === "bone_density" ? 2 : 1,
                        )}{" "}
                        {result.unit}
                      </td>
                      <td>
                        <Status value={result.quality} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="detail-list">
                <div>
                  <dt>Observed / acquired</dt>
                  <dd>{stamp(report.acquired_at, true)}</dd>
                </div>
                <div>
                  <dt>Instrument</dt>
                  <dd>{report.device_id}</dd>
                </div>
                <div>
                  <dt>Origin</dt>
                  <dd>SIMULATED</dd>
                </div>
              </dl>
              <details>
                <summary>Measurement provenance</summary>
                <p className="monospace">
                  Examination: {report.id}
                  <br />
                  Event: {report.event_id}
                  <br />
                  Crew: {report.astronaut_id}
                </p>
              </details>
              {report.status === "REVIEW" ? (
                <>
                  <label className="field">
                    Demo review note
                    <textarea
                      value={note}
                      maxLength={2000}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional observation about this synthetic acquisition"
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={async () => {
                        const saved = await action(
                          `examinations/${report.id}/actions`,
                          { action: "SAVE", note },
                          "Examination saved to local history",
                        );
                        if (saved) setSelected(report.id);
                      }}
                    >
                      Review & save result
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(
                          `examinations/${report.id}/actions`,
                          { action: "CANCEL" },
                          "Result discarded",
                        )
                      }
                    >
                      Discard result
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="success-inline">
                    Saved {stamp(report.saved_at, true)} ·{" "}
                    {report.note || "No review note"}
                  </p>
                  <button onClick={() => downloadReport(report)}>
                    Export synthetic report
                  </button>
                </>
              )}
            </>
          )}
        </Panel>
      </div>
      <Panel
        title="Examination history"
        action={<span className="muted">{saved.length} saved reports</span>}
      >
        {!saved.length ? (
          <Empty title="No saved examinations">
            Reviewing a result does not save it automatically. Saved reports
            remain available after page reloads and backend restarts.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Saved · UTC</th>
                  <th>Examination</th>
                  <th>Instrument</th>
                  <th>Source</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((exam) => (
                  <tr key={exam.id}>
                    <td>{stamp(exam.saved_at, true)}</td>
                    <td>{EXAMS.find((e) => e.kind === exam.kind)?.label}</td>
                    <td>{exam.device_id}</td>
                    <td>
                      <Status value="SIMULATED" />
                    </td>
                    <td>
                      <button
                        disabled={Boolean(active)}
                        onClick={() => {
                          setSelected(exam.id);
                          document
                            .getElementById("examination-review")
                            ?.scrollIntoView({
                              behavior: "auto",
                              block: "start",
                            });
                        }}
                      >
                        View report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
