import { useEffect, useRef, useState } from "react";
import { EXAM_TYPES } from "../examinationTypes";
import { post, type ExaminationPlan } from "../services/api";
import type { ScreenProps } from "../screens/types";
import { Panel, Status } from "./medical";

const DAY = 86400000;
export function startOfWeek(time: number) {
  const date = new Date(time);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
}
const format = (time: number, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(
    time,
  );
const definition = (kind: ExaminationPlan["kind"]) =>
  EXAM_TYPES.find((exam) => exam.kind === kind)!;

type Props = Pick<
  ScreenProps,
  "mission" | "crewId" | "navigate" | "deceasedCrewIds"
>;
type Editor = { plan?: ExaminationPlan; scheduledAt: string };

export function ExaminationCalendar({
  mission,
  crewId,
  navigate,
  deceasedCrewIds,
}: Props) {
  const [week, setWeek] = useState(() => startOfWeek(mission.serverNow));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [updates, setUpdates] = useState<ExaminationPlan[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const crewName =
    mission.crew.find((crew) => crew.id === crewId)?.display_name ?? crewId;
  const all = new Map<string, ExaminationPlan>();
  for (const plan of [...(mission.operations?.exam_plans ?? []), ...updates]) {
    if (plan.astronaut_id !== crewId) continue;
    if ((all.get(plan.id)?.revision ?? -1) <= plan.revision)
      all.set(plan.id, plan);
  }
  const plans = [...all.values()]
    .filter((plan) => {
      const time = Date.parse(plan.scheduled_at);
      return time >= week && time < week + 7 * DAY;
    })
    .sort(
      (a, b) =>
        Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) ||
        a.id.localeCompare(b.id),
    );
  const unavailable = !mission.operations || mission.loading;
  const canAcquire =
    mission.connected &&
    mission.operations?.control.running &&
    !deceasedCrewIds?.has(crewId);
  const hasActiveExam = mission.operations?.examinations.some(
    (exam) =>
      exam.astronaut_id === crewId &&
      (exam.status === "ACQUIRING" || exam.status === "REVIEW"),
  );
  const activePlanIds = new Set(
    mission.operations?.examinations
      .filter((exam) => exam.status === "ACQUIRING" || exam.status === "REVIEW")
      .map((exam) => exam.plan_id),
  );
  const remember = (plan: ExaminationPlan) => {
    setUpdates((old) => [...old.filter((item) => item.id !== plan.id), plan]);
    void mission.refresh();
  };
  const editDay = (time: number) => {
    setError("");
    setNotice("");
    setEditor({
      scheduledAt: new Date(time).toISOString().slice(0, 10) + "T09:00",
    });
  };
  const cancel = async (plan: ExaminationPlan) => {
    setWorking(plan.id);
    setError("");
    setNotice("");
    try {
      const result = await post<ExaminationPlan>(
        `examination-plans/${plan.id}`,
        { action: "CANCEL", expected_revision: plan.revision },
      );
      remember(result);
      setNotice("Examination plan cancelled.");
    } catch (cause) {
      setError(
        `Could not cancel the plan: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setWorking(null);
    }
  };
  const start = async (plan: ExaminationPlan) => {
    setWorking(plan.id);
    setError("");
    setNotice("");
    try {
      await post("examinations", {
        astronaut_id: crewId,
        kind: plan.kind,
        device_id: definition(plan.kind).device,
        plan_id: plan.id,
      });
      await mission.refresh();
      navigate("Examinations");
    } catch (cause) {
      setError(
        `Could not start the examination: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setWorking(null);
    }
  };
  const today = new Date(mission.serverNow).toISOString().slice(0, 10);
  return (
    <div
      role="region"
      aria-label={`Weekly examination calendar for ${crewName}`}
    >
      <Panel
        title="Weekly examination calendar"
        className="examination-calendar"
        action={
          <button
            className="primary-button"
            disabled={unavailable || !!working}
            onClick={() =>
              editDay(
                startOfWeek(mission.serverNow) === week
                  ? mission.serverNow
                  : week,
              )
            }
          >
            Schedule examination
          </button>
        }
      >
        <div className="calendar-toolbar">
          <div>
            <strong>{crewName}</strong>
            <p>
              {format(week, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              –{" "}
              {format(week + 6 * DAY, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              · UTC
            </p>
          </div>
          <div className="button-row">
            <button
              onClick={() => setWeek(week - 7 * DAY)}
              aria-label="Previous week"
            >
              ← Previous week
            </button>
            <button onClick={() => setWeek(startOfWeek(mission.serverNow))}>
              This week
            </button>
            <button
              onClick={() => setWeek(week + 7 * DAY)}
              aria-label="Next week"
            >
              Next week →
            </button>
          </div>
        </div>
        <p className="caption">
          SIMULATED · Monday–Sunday · Plans do not run automatically. Start an
          examination when ready; review and save its result to complete the
          plan.
        </p>
        {unavailable ? (
          <p role="status">
            Calendar records unavailable. Reconnect to load planned
            examinations.
          </p>
        ) : (
          <>
            {!plans.length && (
              <p className="calendar-empty">
                No examinations scheduled for this crew this week.
              </p>
            )}
            <div className="calendar-scroll">
              <div className="calendar-week">
                {Array.from({ length: 7 }, (_, day) => {
                  const date = week + day * DAY;
                  const isoDate = new Date(date).toISOString().slice(0, 10);
                  const daily = plans.filter(
                    (plan) => plan.scheduled_at.slice(0, 10) === isoDate,
                  );
                  return (
                    <section
                      key={date}
                      className={`calendar-day ${isoDate === today ? "is-today" : ""}`}
                      aria-label={format(date, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    >
                      <h3>
                        {format(date, { weekday: "short" })}
                        <span>
                          {format(date, { day: "numeric", month: "short" })}
                          {isoDate === today ? " · Today" : ""}
                        </span>
                      </h3>
                      <button
                        className="calendar-add"
                        aria-label={`Schedule examination on ${isoDate}`}
                        disabled={!!working}
                        onClick={() => editDay(date)}
                      >
                        + Plan exam
                      </button>
                      {!daily.length && (
                        <p className="calendar-day-empty">No exams</p>
                      )}
                      <ul>
                        {daily.map((plan) => (
                          <li
                            key={plan.id}
                            className={`calendar-plan plan-${plan.status.toLowerCase()}`}
                          >
                            <time dateTime={plan.scheduled_at}>
                              {format(Date.parse(plan.scheduled_at), {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            <h4>{definition(plan.kind).label}</h4>
                            <Status
                              value={
                                plan.status === "PLANNED" &&
                                Date.parse(plan.scheduled_at) <
                                  mission.serverNow
                                  ? "OVERDUE"
                                  : plan.status
                              }
                            />
                            {plan.notes && (
                              <p className="calendar-notes">{plan.notes}</p>
                            )}
                            {plan.status !== "COMPLETED" && (
                              <div className="calendar-plan-actions">
                                {plan.status === "PLANNED" && (
                                  <button
                                    disabled={
                                      !canAcquire ||
                                      hasActiveExam ||
                                      !!working ||
                                      activePlanIds.has(plan.id)
                                    }
                                    onClick={() => void start(plan)}
                                  >
                                    {activePlanIds.has(plan.id)
                                      ? "In progress"
                                      : "Start examination"}
                                  </button>
                                )}
                                <button
                                  disabled={
                                    !!working || activePlanIds.has(plan.id)
                                  }
                                  onClick={() => {
                                    setError("");
                                    setEditor({
                                      plan,
                                      scheduledAt: plan.scheduled_at.slice(
                                        0,
                                        16,
                                      ),
                                    });
                                  }}
                                >
                                  Reschedule
                                </button>
                                {plan.status === "PLANNED" && (
                                  <button
                                    disabled={
                                      !!working || activePlanIds.has(plan.id)
                                    }
                                    onClick={() => void cancel(plan)}
                                  >
                                    Cancel plan
                                  </button>
                                )}
                              </div>
                            )}
                            {plan.status === "COMPLETED" &&
                              plan.examination_id && (
                                <button
                                  onClick={() => navigate("Examinations")}
                                >
                                  Open examination history
                                </button>
                              )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {hasActiveExam && (
          <p className="caption">
            Finish or cancel the current examination before starting another.
          </p>
        )}
        {error && (
          <p className="error-inline" role="alert">
            {error}. Refresh the calendar and retry.
          </p>
        )}
        {notice && (
          <p className="success-inline" role="status">
            {notice}
          </p>
        )}
        {!canAcquire && !unavailable && (
          <p className="caption">
            Planning remains available. Fresh, running telemetry for a living
            crew member is required to start an examination.
          </p>
        )}
        {editor && (
          <PlanEditor
            key={editor.plan?.id ?? editor.scheduledAt}
            editor={editor}
            crewId={crewId}
            crewName={crewName}
            onClose={() => setEditor(null)}
            onSaved={(plan) => {
              remember(plan);
              setEditor(null);
              setNotice(
                editor.plan
                  ? "Examination rescheduled."
                  : "Examination scheduled.",
              );
            }}
          />
        )}
      </Panel>
    </div>
  );
}

function PlanEditor({
  editor,
  crewId,
  crewName,
  onClose,
  onSaved,
}: {
  editor: Editor;
  crewId: string;
  crewName: string;
  onClose: () => void;
  onSaved: (plan: ExaminationPlan) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ExaminationPlan["kind"]>(
    editor.plan?.kind ?? "BLOOD_PRESSURE",
  );
  const [scheduledAt, setScheduledAt] = useState(editor.scheduledAt);
  const [notes, setNotes] = useState(editor.plan?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    dateInput.current?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="plan-dialog"
      aria-labelledby="plan-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !scheduledAt) return;
          setBusy(true);
          setError("");
          try {
            const timestamp = new Date(scheduledAt + ":00Z").toISOString();
            const result = editor.plan
              ? await post<ExaminationPlan>(
                  `examination-plans/${editor.plan.id}`,
                  {
                    action: "RESCHEDULE",
                    expected_revision: editor.plan.revision,
                    scheduled_at: timestamp,
                    notes,
                  },
                )
              : await post<ExaminationPlan>("examination-plans", {
                  astronaut_id: crewId,
                  kind,
                  scheduled_at: timestamp,
                  notes,
                });
            onSaved(result);
          } catch (cause) {
            setError(
              `Could not save the plan: ${cause instanceof Error ? cause.message : String(cause)}. Please try again.`,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="eyebrow">{crewName} · SIMULATED</p>
        <h2 id="plan-title">
          {editor.plan ? "Reschedule examination" : "Schedule examination"}
        </h2>
        <label className="field">
          Examination type
          <select
            disabled={busy || !!editor.plan}
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as ExaminationPlan["kind"])
            }
          >
            {EXAM_TYPES.map((exam) => (
              <option key={exam.kind} value={exam.kind}>
                {exam.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Date and time (UTC)
          <input
            ref={dateInput}
            type="datetime-local"
            required
            step="60"
            value={scheduledAt}
            disabled={busy}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </label>
        <label className="field">
          Notes (optional)
          <textarea
            maxLength={1000}
            value={notes}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {error && (
          <p className="error-inline" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={busy || !scheduledAt}>
            {busy ? "Saving…" : editor.plan ? "Save changes" : "Save plan"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
