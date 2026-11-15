import { useState } from "react";
import { pendingExaminations } from "../examinationSchedule";
import { EXAM_TYPES } from "../examinationTypes";
import type { ScreenProps } from "../screens/types";
import { stamp } from "./medical";

export function ExaminationNotifications({
  mission,
  crewId,
  navigate,
  deceasedCrewIds,
}: Pick<ScreenProps, "mission" | "crewId" | "navigate" | "deceasedCrewIds">) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const notificationKey = (id: string, scheduledAt: string) =>
    `${crewId}:${id}:${scheduledAt}`;
  const active = new Set(
    (mission.operations?.examinations ?? [])
      .filter((exam) => exam.status === "ACQUIRING" || exam.status === "REVIEW")
      .map((exam) => exam.plan_id),
  );
  const due = pendingExaminations(mission.operations, crewId).filter((plan) => {
    const elapsed = mission.serverNow - Date.parse(plan.scheduled_at);
    // Notify at the appointment time, rather than replaying overdue reminders.
    return (
      elapsed >= 0 &&
      elapsed < 60_000 &&
      !active.has(plan.id) &&
      !dismissed.has(notificationKey(plan.id, plan.scheduled_at))
    );
  });
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {!mission.loading && !deceasedCrewIds?.has(crewId) && due.length > 0 && (
        <section className="examination-reminder" aria-label="Examinations due">
          <div>
            <strong>
              {due.length === 1
                ? "Examination due"
                : `${due.length} examinations due`}
            </strong>
            <ul>
              {due.map((plan) => (
                <li key={plan.id}>
                  {EXAM_TYPES.find((exam) => exam.kind === plan.kind)?.label} ·{" "}
                  {stamp(plan.scheduled_at, true)} UTC
                </li>
              ))}
            </ul>
            {!mission.connected && (
              <p>Showing the last received schedule. Reconnect to confirm.</p>
            )}
          </div>
          <div className="button-row">
            <button onClick={() => navigate("Examinations")}>
              Open examinations
            </button>
            <button
              aria-label="Dismiss examination notification"
              onClick={() => {
                setDismissed(
                  (previous) =>
                    new Set([
                      ...previous,
                      ...due.map((plan) =>
                        notificationKey(plan.id, plan.scheduled_at),
                      ),
                    ]),
                );
              }}
            >
              Dismiss
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
