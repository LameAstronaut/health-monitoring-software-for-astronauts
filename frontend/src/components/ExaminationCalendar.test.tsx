// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ExaminationCalendar, startOfWeek } from "./ExaminationCalendar";
import { post, type ExaminationPlan } from "../services/api";
import { makeMission } from "../test/fixtures";

vi.mock("../services/api", async (original) => ({
  ...(await original<typeof import("../services/api")>()),
  post: vi.fn(),
}));
const plan: ExaminationPlan = {
  id: "plan-1",
  astronaut_id: "DEMO-CREW-001",
  kind: "BODY_TEMPERATURE",
  scheduled_at: "2026-11-14T09:00:00Z",
  notes: "Crew one",
  status: "PLANNED",
  revision: 0,
  source_type: "SIMULATED",
};
function props(entries: ExaminationPlan[] = [plan]) {
  const mission = makeMission();
  mission.operations!.exam_plans = entries;
  return { mission, crewId: "DEMO-CREW-001", navigate: vi.fn() };
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each([
  ["2026-11-14T12:00:00Z", "2026-11-09T00:00:00Z"],
  ["2027-01-03T23:00:00Z", "2026-12-28T00:00:00Z"],
  ["2027-01-04T00:00:00Z", "2027-01-04T00:00:00Z"],
])("computes the UTC Monday for %s", (time, monday) => {
  expect(startOfWeek(Date.parse(time))).toBe(Date.parse(monday));
});

it("shows only this crew's week and supports previous, next, and this week", async () => {
  const input = props([
    plan,
    { ...plan, id: "other", astronaut_id: "DEMO-CREW-002", notes: "Crew two" },
    {
      ...plan,
      id: "next",
      scheduled_at: "2026-11-16T10:00:00Z",
      notes: "Next week plan",
    },
  ]);
  render(<ExaminationCalendar {...input} />);
  expect(screen.getByText("Crew one")).toBeVisible();
  expect(screen.queryByText("Crew two")).not.toBeInTheDocument();
  expect(screen.queryByText("Next week plan")).not.toBeInTheDocument();
  const days = screen.getAllByRole("heading", { level: 3 });
  expect(days).toHaveLength(7);
  expect(days[0]).toHaveTextContent("Mon");
  expect(days[6]).toHaveTextContent("Sun");
  await userEvent.click(screen.getByRole("button", { name: "Next week" }));
  expect(screen.getByText("Next week plan")).toBeVisible();
  expect(screen.queryByText("Crew one")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
  expect(screen.getByText("Crew one")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
  expect(
    screen.getByText("No examinations scheduled for this crew this week."),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "This week" }));
  expect(screen.getByText("Crew one")).toBeVisible();
});

it("saves a selected day in UTC and immediately displays the returned plan", async () => {
  const input = props([]);
  vi.mocked(post).mockResolvedValueOnce(plan);
  render(<ExaminationCalendar {...input} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Schedule examination on 2026-11-14" }),
  );
  const modal = screen.getByRole("dialog", { name: "Schedule examination" });
  const date = within(modal).getByLabelText("Date and time (UTC)");
  expect(date).toHaveFocus();
  expect(date).toHaveValue("2026-11-14T09:00");
  await userEvent.selectOptions(
    within(modal).getByRole("combobox", { name: "Examination type" }),
    "BODY_TEMPERATURE",
  );
  await userEvent.type(
    within(modal).getByRole("textbox", { name: "Notes (optional)" }),
    "Crew one",
  );
  await userEvent.click(
    within(modal).getByRole("button", { name: "Save plan" }),
  );
  expect(post).toHaveBeenCalledWith("examination-plans", {
    astronaut_id: "DEMO-CREW-001",
    kind: "BODY_TEMPERATURE",
    scheduled_at: "2026-11-14T09:00:00.000Z",
    notes: "Crew one",
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Crew one")).toBeVisible();
});

it("keeps failed edits open with the draft intact", async () => {
  vi.mocked(post).mockRejectedValueOnce(new Error("Plan changed"));
  render(<ExaminationCalendar {...props()} />);
  await userEvent.click(screen.getByRole("button", { name: "Reschedule" }));
  fireEvent.change(screen.getByLabelText("Date and time (UTC)"), {
    target: { value: "2026-11-15T11:00" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Plan changed");
  expect(screen.getByLabelText("Date and time (UTC)")).toHaveValue(
    "2026-11-15T11:00",
  );
  expect(post).toHaveBeenCalledWith(
    "examination-plans/plan-1",
    expect.objectContaining({ expected_revision: 0, action: "RESCHEDULE" }),
  );
});

it("cancels without deleting the plan and allows rescheduling it", async () => {
  vi.mocked(post).mockResolvedValueOnce({
    ...plan,
    status: "CANCELLED",
    revision: 1,
  });
  render(<ExaminationCalendar {...props()} />);
  await userEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
  expect(screen.getByText("CANCELLED")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Start examination" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reschedule" })).toBeEnabled();
});

it("starts the correct crew, kind and instrument with the linked plan", async () => {
  const input = props();
  vi.mocked(post).mockResolvedValueOnce({});
  render(<ExaminationCalendar {...input} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Start examination" }),
  );
  expect(post).toHaveBeenCalledWith("examinations", {
    astronaut_id: "DEMO-CREW-001",
    kind: "BODY_TEMPERATURE",
    device_id: "DEMO-TEMP-001",
    plan_id: "plan-1",
  });
  expect(input.mission.refresh).toHaveBeenCalled();
  expect(input.navigate).toHaveBeenCalledWith("Examinations");
});

it("allows planning while paused but disables acquisition", () => {
  const input = props();
  input.mission.operations!.control.running = false;
  render(<ExaminationCalendar {...input} />);
  expect(
    screen.getByRole("button", { name: "Schedule examination" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Start examination" }),
  ).toBeDisabled();
});
