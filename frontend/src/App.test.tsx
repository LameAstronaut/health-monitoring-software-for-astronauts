// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { useMission } from "./useMission";
import { post } from "./services/api";
import { makeMission, reading, reviewExam, NOW } from "./test/fixtures";

vi.mock("./useMission");
vi.mock("./services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/api")>()),
  post: vi.fn(),
}));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(useMission).mockReturnValue(makeMission());
  vi.mocked(post).mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders a readable demo workspace with honest missing measurement states", () => {
  render(<App />);
  expect(
    screen.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { level: 1, name: "Mission dashboard" }),
  ).toBeVisible();
  expect(screen.getByText("API CONNECTED")).toBeVisible();
  expect(screen.getAllByText("DEMO / SIMULATED").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/^Awaiting first observation/).length).toBe(7);
  expect(
    screen.getByRole("heading", { name: "Systolic pressure" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Diastolic pressure" }),
  ).toBeVisible();
  expect(screen.getByText(/does not indicate crew health/)).toBeVisible();
});

it("shows loading, connection failure and a working retry action", async () => {
  const mission = makeMission({
    loading: true,
    connected: false,
    error: "API 503: health",
    observations: [],
  });
  vi.mocked(useMission).mockReturnValue(mission);
  render(<App />);
  expect(screen.getByRole("alert")).toHaveTextContent("API 503: health");
  expect(
    screen.getByText("Connecting to the local medical workspace…"),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry connection" }),
  );
  expect(mission.refresh).toHaveBeenCalled();
});

it("retains stale provenance even while the API is connected", () => {
  vi.mocked(useMission).mockReturnValue(
    makeMission({
      observations: [
        {
          ...reading,
          observed_at: new Date(NOW - 10000).toISOString(),
          received_at: new Date(NOW - 10000).toISOString(),
        },
      ],
    }),
  );
  render(<App />);
  expect(screen.getAllByText("STALE")).toHaveLength(2);
  expect(screen.getByText("Last known value · NO LIVE DATA")).toBeVisible();
  expect(screen.getByText("API CONNECTED")).toBeVisible();
});

it("selects another crew and navigates to that individual baseline", async () => {
  render(<App />);
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Selected crew" }),
    "DEMO-CREW-002",
  );
  await user.click(screen.getByRole("button", { name: "Crew profiles" }));
  expect(useMission).toHaveBeenLastCalledWith("DEMO-CREW-002");
  expect(
    screen.getByRole("heading", { name: "Individual simulation baseline" }),
  ).toBeVisible();
  expect(screen.getByText(/72 beats\/min/)).toBeVisible();
  expect(localStorage.getItem("astra-selected-crew")).toBe("DEMO-CREW-002");
});

it("acquires with the selected crew/device and explicitly reviews and saves a report", async () => {
  const mission = makeMission();
  vi.mocked(useMission).mockReturnValue(mission);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Examinations" }));
  await user.click(
    screen.getByRole("button", { name: "Initiate simulated acquisition" }),
  );
  expect(post).toHaveBeenCalledWith("examinations", {
    astronaut_id: "DEMO-CREW-001",
    kind: "BLOOD_PRESSURE",
    device_id: "DEMO-BP-001",
  });
  vi.mocked(useMission).mockReturnValue({
    ...mission,
    operations: { ...mission.operations!, examinations: [reviewExam] },
  });
  await user.click(screen.getByRole("button", { name: "Examinations" }));
  await user.type(
    screen.getByRole("textbox", { name: "Demo review note" }),
    "Synthetic review",
  );
  await user.click(
    screen.getByRole("button", { name: "Review & save result" }),
  );
  expect(post).toHaveBeenLastCalledWith("examinations/demo-exam-test/actions", {
    action: "SAVE",
    note: "Synthetic review",
  });
});

it("logs an actual inventory item and exposes the nine risk categories", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Nutrition" }));
  await user.click(screen.getByRole("button", { name: "Log meal" }));
  expect(post).toHaveBeenCalledWith("nutrition/meals", {
    astronaut_id: "DEMO-CREW-001",
    food_id: "oats",
    servings: 1,
  });
  await user.click(screen.getByRole("button", { name: "Risk monitoring" }));
  const categories = screen.getByRole("navigation", {
    name: "Health risk categories",
  });
  expect(within(categories).getAllByRole("button")).toHaveLength(9);
  expect(
    within(categories).queryByRole("button", {
      name: /VisionTrack|MicrobiomeAI/,
    }),
  ).not.toBeInTheDocument();
  await user.click(
    within(categories).getByRole("button", { name: /BoneGuard/ }),
  );
  expect(
    screen.getByText(
      /Structural imaging, bone-turnover markers and mineral panels are unavailable/,
    ),
  ).toBeVisible();
  const vehicleSensors = screen.getByRole("table", {
    name: "Vehicle radiation sensors",
  });
  expect(within(vehicleSensors).getAllByRole("row")).toHaveLength(4);
  expect(
    within(vehicleSensors).getAllByText("No reading received"),
  ).toHaveLength(3);
  const sharedReadings = vehicleSensors.textContent;
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Selected crew" }),
    "DEMO-CREW-002",
  );
  expect(vehicleSensors.textContent).toBe(sharedReadings);
  expect(vehicleSensors).not.toHaveTextContent(
    /Alex Morgan|Jordan Lee|DEMO-CREW/,
  );
});

it("pauses playback with a revision guard and displays failed mutations", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Simulator controls" }));
  await user.click(screen.getByRole("button", { name: "Pause simulation" }));
  expect(post).toHaveBeenCalledWith("demo/control", {
    action: "PAUSE",
    expected_revision: 0,
  });
  vi.mocked(post).mockRejectedValueOnce(
    new Error("Simulator settings changed"),
  );
  await user.click(
    screen.getByRole("button", { name: "Restart seeded playback" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Simulator settings changed",
  );
});

it("shows deceased for the affected crew without an end screen and keeps controls usable", async () => {
  const mission = makeMission({
    observations: [{ ...reading, value: 0 }],
    summaries: [
      {
        crew: makeMission().crew[1],
        readings: [
          {
            ...reading,
            id: 2,
            astronaut_id: "DEMO-CREW-002",
            device_id: "DEMO-SUIT-002",
            value: 72,
          },
        ],
      },
    ],
  });
  vi.mocked(useMission).mockReturnValue(mission);
  const view = render(<App />);
  expect(
    screen.getByRole("button", { name: /Alex Morgan/, pressed: true }),
  ).toHaveTextContent("DECEASED");
  expect(
    screen.getByRole("button", { name: /Jordan Lee/, pressed: false }),
  ).toHaveTextContent("LIVE");
  expect(screen.queryByText("The End")).not.toBeInTheDocument();
  expect(view.container.querySelector(".app-shell")).not.toHaveAttribute(
    "inert",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Simulator controls" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Mission dashboard" }),
  );
  expect(
    screen.getByRole("button", { name: /Alex Morgan/, pressed: true }),
  ).toHaveTextContent("DECEASED");
  const restarted = makeMission();
  restarted.operations!.control.run_id = "restarted-run";
  vi.mocked(useMission).mockReturnValue(restarted);
  view.rerender(<App />);
  expect(
    screen.getByRole("button", { name: /Alex Morgan/, pressed: true }),
  ).not.toHaveTextContent("DECEASED");
});
