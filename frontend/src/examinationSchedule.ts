import { EXAM_TYPES } from "./examinationTypes";
import type { Operations } from "./services/api";

export function pendingExaminations(
  operations: Operations | undefined,
  crewId: string,
) {
  return (operations?.exam_plans ?? [])
    .filter((plan) => plan.astronaut_id === crewId && plan.status === "PLANNED")
    .sort(
      (a, b) =>
        Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) ||
        a.id.localeCompare(b.id),
    );
}

export function upcomingTasks(
  operations: Operations | undefined,
  crewId: string,
  serverNow: number,
) {
  const today = new Date(serverNow).toISOString().slice(0, 10);
  const linkedTasks = new Set(
    (operations?.exam_plans ?? []).map((plan) => plan.task_id),
  );
  return [
    ...(operations?.tasks ?? [])
      .filter(
        (task) =>
          task.astronaut_id === crewId &&
          task.status === "PENDING" &&
          !linkedTasks.has(task.id),
      )
      .map((task) => ({ ...task, examination: false })),
    ...pendingExaminations(operations, crewId).map((plan) => ({
      id: plan.id,
      title: `${EXAM_TYPES.find((exam) => exam.kind === plan.kind)?.label} examination`,
      due_at: plan.scheduled_at,
      destination: "Examinations" as const,
      examination: true,
    })),
  ]
    .filter(
      (task) => new Date(task.due_at).toISOString().slice(0, 10) === today,
    )
    .sort(
      (a, b) =>
        Date.parse(a.due_at) - Date.parse(b.due_at) || a.id.localeCompare(b.id),
    );
}
