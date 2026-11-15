// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ExaminationNotifications } from "./ExaminationNotifications";
import { upcomingTasks } from "../examinationSchedule";
import { makeMission, NOW } from "../test/fixtures";
import type { ExaminationPlan } from "../services/api";

const plan: ExaminationPlan = {
  id: "weekly-1",
  astronaut_id: "DEMO-CREW-001",
  kind: "BLOOD_PRESSURE",
  scheduled_at: new Date(NOW).toISOString(),
  status: "PLANNED",
  notes: "",
  task_id: "task-1",
  revision: 0,
  source_type: "SIMULATED",
};
afterEach(cleanup);

it("announces an examination exactly when due and opens examinations", () => {
  const mission = makeMission({ serverNow: NOW - 1 });
  mission.operations!.exam_plans = [plan];
  const props = { mission, crewId: plan.astronaut_id, navigate: vi.fn() };
  const view = render(<ExaminationNotifications {...props} />);
  expect(screen.queryByText("Examination due")).not.toBeInTheDocument();
  view.rerender(
    <ExaminationNotifications
      {...props}
      mission={{ ...mission, serverNow: NOW }}
    />,
  );
  expect(screen.getByText("Examination due")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Open examinations" }));
  expect(props.navigate).toHaveBeenCalledWith("Examinations");
  mission.operations!.exam_plans = [{ ...plan, status: "COMPLETED" }];
  view.rerender(<ExaminationNotifications {...props} />);
  expect(screen.queryByText("Examination due")).not.toBeInTheDocument();
});

it("excludes other crew, completed, cancelled and active examinations", () => {
  const mission = makeMission();
  mission.operations!.exam_plans = [
    { ...plan, astronaut_id: "DEMO-CREW-002" },
    { ...plan, id: "done", status: "COMPLETED" },
    { ...plan, id: "cancelled", status: "CANCELLED" },
    plan,
  ];
  mission.operations!.examinations = [
    {
      id: "exam",
      astronaut_id: plan.astronaut_id,
      kind: plan.kind,
      device_id: "DEMO-BP-001",
      status: "REVIEW",
      plan_id: plan.id,
      started_at: plan.scheduled_at,
      note: "",
      source_type: "SIMULATED",
    },
  ];
  render(
    <ExaminationNotifications
      mission={mission}
      crewId={plan.astronaut_id}
      navigate={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText("Examinations due")).not.toBeInTheDocument();
});

it("derives tasks from calendar plans without duplicates and follows their status", () => {
  const mission = makeMission();
  mission.operations!.tasks = [
    {
      id: "task-1",
      astronaut_id: plan.astronaut_id,
      title: "Old title",
      due_at: new Date(NOW - 1000).toISOString(),
      status: "PENDING",
      destination: "Examinations",
      source_type: "SIMULATED",
    },
  ];
  mission.operations!.exam_plans = [
    plan,
    { ...plan, id: "standalone", task_id: null },
  ];
  const tasks = upcomingTasks(mission.operations, plan.astronaut_id, NOW);
  expect(tasks).toHaveLength(2);
  expect(
    tasks.every(
      (task) => task.examination && task.due_at === plan.scheduled_at,
    ),
  ).toBe(true);
  mission.operations!.exam_plans = [{ ...plan, status: "COMPLETED" }];
  expect(upcomingTasks(mission.operations, plan.astronaut_id, NOW)).toEqual([]);
});

it("shows only today's UTC tasks, including multiple exams, and rolls over at midnight", () => {
  const mission = makeMission();
  mission.operations!.exam_plans = [
    {
      ...plan,
      id: "yesterday",
      scheduled_at: "2026-11-13T23:59:59Z",
      task_id: null,
    },
    {
      ...plan,
      id: "morning",
      scheduled_at: "2026-11-14T09:00:00Z",
      task_id: null,
    },
    {
      ...plan,
      id: "evening",
      scheduled_at: "2026-11-15T02:30:00+03:00",
      task_id: null,
    },
    {
      ...plan,
      id: "tomorrow",
      scheduled_at: "2026-11-15T00:00:00Z",
      task_id: null,
    },
  ];
  mission.operations!.tasks = [
    {
      id: "meal-today",
      astronaut_id: plan.astronaut_id,
      title: "Meal",
      due_at: "2026-11-14T12:00:00Z",
      status: "PENDING",
      destination: "Nutrition",
      source_type: "SIMULATED",
    },
    {
      id: "meal-tomorrow",
      astronaut_id: plan.astronaut_id,
      title: "Meal",
      due_at: "2026-11-15T12:00:00Z",
      status: "PENDING",
      destination: "Nutrition",
      source_type: "SIMULATED",
    },
  ];
  expect(
    upcomingTasks(mission.operations, plan.astronaut_id, NOW).map(
      (task) => task.id,
    ),
  ).toEqual(["morning", "meal-today", "evening"]);
  expect(
    upcomingTasks(
      mission.operations,
      plan.astronaut_id,
      Date.parse("2026-11-15T00:00:00Z"),
    ).map((task) => task.id),
  ).toEqual(["tomorrow", "meal-tomorrow"]);
});

it("does not replay overdue examinations and expires after the scheduled minute", () => {
  const mission = makeMission({ serverNow: NOW });
  mission.operations!.exam_plans = [
    plan,
    {
      ...plan,
      id: "old",
      kind: "LAB_PANEL",
      scheduled_at: new Date(NOW - 60_000).toISOString(),
    },
    {
      ...plan,
      id: "future",
      kind: "BONE_DENSITY",
      scheduled_at: new Date(NOW + 30 * 60_000).toISOString(),
    },
  ];
  const props = { mission, crewId: plan.astronaut_id, navigate: vi.fn() };
  const view = render(<ExaminationNotifications {...props} />);
  expect(screen.getByText("Examination due")).toBeVisible();
  expect(screen.queryByText(/Laboratory panel/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Bone density/)).not.toBeInTheDocument();
  view.rerender(
    <ExaminationNotifications
      {...props}
      mission={{ ...mission, serverNow: NOW + 60_000 }}
    />,
  );
  expect(screen.queryByLabelText("Examinations due")).not.toBeInTheDocument();
  view.rerender(
    <ExaminationNotifications
      {...props}
      mission={{ ...mission, serverNow: NOW + 30 * 60_000 }}
    />,
  );
  expect(screen.getByText(/Bone density/)).toBeVisible();
  expect(screen.queryByText(/Blood pressure/)).not.toBeInTheDocument();
});

it("keeps a notification dismissed across clock ticks and announces the next appointment", () => {
  const mission = makeMission();
  mission.operations!.exam_plans = [
    plan,
    {
      ...plan,
      id: "next",
      kind: "BODY_TEMPERATURE",
      scheduled_at: new Date(NOW + 30 * 60_000).toISOString(),
    },
  ];
  const props = { mission, crewId: plan.astronaut_id, navigate: vi.fn() };
  const view = render(<ExaminationNotifications {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Dismiss examination notification" }),
  );
  view.rerender(
    <ExaminationNotifications
      {...props}
      mission={{ ...mission, serverNow: NOW + 250 }}
    />,
  );
  expect(screen.queryByLabelText("Examinations due")).not.toBeInTheDocument();
  view.rerender(
    <ExaminationNotifications
      {...props}
      mission={{ ...mission, serverNow: NOW + 30 * 60_000 }}
    />,
  );
  expect(screen.getByText(/Body temperature/)).toBeVisible();
});
