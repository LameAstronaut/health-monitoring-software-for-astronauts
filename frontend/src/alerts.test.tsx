// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { useMission } from "./useMission";
import { post, type Alert } from "./services/api";
import { makeMission, reading } from "./test/fixtures";

vi.mock("./useMission");
vi.mock("./services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/api")>()),
  post: vi.fn(),
}));
const critical: Alert = {
  id: 5,
  priority: 1,
  severity: "CRITICAL_DEMO",
  state: "PENDING_REVIEW",
  rule_id: "respiratory-rise-fixture",
  rule_version: "demo-fixture-v2",
  message: "SIMULATED respiratory-rise test marker reached",
  event_id: reading.event_id,
  device_id: "DEMO-SUIT-002",
  astronaut_id: "DEMO-CREW-002",
  occurred_at: reading.observed_at,
  source_type: "SIMULATED",
  evidence: [
    {
      ...reading,
      code: "respiratory_rate",
      value: 26,
      unit: "breaths/min",
      astronaut_id: "DEMO-CREW-002",
      device_id: "DEMO-SUIT-002",
    },
  ],
};
beforeEach(() => {
  localStorage.clear();
  // jsdom does not implement native dialog behavior; browser tests cover inert/focus trapping.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.mocked(post).mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("opens critical alerts for any crew, minimizes without acknowledging, and reopens", async () => {
  vi.mocked(useMission).mockReturnValue(makeMission({ alerts: [critical] }));
  render(<App />);
  const dialog = screen.getByRole("alertdialog", { name: /Jordan Lee/ });
  expect(within(dialog).getByText("26")).toHaveTextContent("26 breaths/min");
  expect(
    within(dialog).getByRole("button", { name: "Minimize" }),
  ).toHaveFocus();
  await userEvent.tab({ shift: true });
  expect(
    within(dialog).getByRole("button", { name: "Acknowledge" }),
  ).toHaveFocus();
  await userEvent.tab();
  expect(
    within(dialog).getByRole("button", { name: "Minimize" }),
  ).toHaveFocus();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Minimize" }),
  );
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Review alert full screen" }),
  );
  expect(screen.getByRole("alertdialog", { name: /Jordan Lee/ })).toBeVisible();
});

it("opens warning alerts full screen too and leaves a banner after minimizing", async () => {
  vi.mocked(useMission).mockReturnValue(
    makeMission({
      alerts: [{ ...critical, priority: 2, severity: "WARNING_DEMO" }],
    }),
  );
  render(<App />);
  expect(screen.getByRole("alertdialog")).toHaveTextContent("PRIORITY 2");
  await userEvent.click(screen.getByRole("button", { name: "Minimize" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Pending simulated alerts" }),
  ).toHaveTextContent("PRIORITY 2");
  await userEvent.click(
    screen.getByRole("button", { name: "Review alert full screen" }),
  );
  expect(screen.getByRole("alertdialog")).toBeVisible();
});

it("shows a new critical alert after another has been minimized", async () => {
  vi.mocked(useMission).mockReturnValue(makeMission({ alerts: [critical] }));
  const view = render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Minimize" }));
  vi.mocked(useMission).mockReturnValue(
    makeMission({ alerts: [critical, { ...critical, id: 6 }] }),
  );
  view.rerender(<App />);
  expect(screen.getByRole("alertdialog")).toHaveTextContent("2 pending");
});

it("escalates a newly arriving critical alert while a warning is being reviewed", async () => {
  const warning: Alert = {
    ...critical,
    id: 4,
    priority: 2,
    severity: "WARNING_DEMO",
    message: "Pulse-rise warning fixture",
  };
  vi.mocked(useMission).mockReturnValue(makeMission({ alerts: [warning] }));
  const view = render(<App />);
  expect(screen.getByRole("alertdialog")).toHaveTextContent("PRIORITY 2");
  vi.mocked(useMission).mockReturnValue(
    makeMission({ alerts: [warning, critical] }),
  );
  view.rerender(<App />);
  expect(screen.getByRole("alertdialog")).toHaveTextContent("PRIORITY 1");
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Breathing rate rising",
  );
});

it("keeps failed acknowledgment visible and saves an explicit successful retry", async () => {
  const mission = makeMission({ alerts: [critical] });
  vi.mocked(useMission).mockReturnValue(mission);
  vi.mocked(post).mockRejectedValueOnce(new Error("API disconnected"));
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  expect(
    within(screen.getByRole("alertdialog")).getByRole("alert"),
  ).toHaveTextContent("API disconnected");
  vi.mocked(post).mockImplementationOnce(async () => {
    vi.mocked(useMission).mockReturnValue(
      makeMission({ alerts: [{ ...critical, state: "ACKNOWLEDGED" }] }),
    );
    return {};
  });
  await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  expect(post).toHaveBeenLastCalledWith("alerts/5/acknowledge", undefined);
  expect(mission.refresh).toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Pending simulated alerts" }),
  ).not.toBeInTheDocument();
});

it("omits Evidence and allows flashing to stop without acknowledgment", async () => {
  vi.mocked(useMission).mockReturnValue(makeMission({ alerts: [critical] }));
  render(<App />);
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toHaveClass("is-flashing");
  expect(
    within(dialog).getByRole("heading", { name: "What to do · simulation" }),
  ).toBeVisible();
  expect(
    within(dialog).getByText(/Review the respiratory-rate trend/),
  ).toBeVisible();
  expect(within(dialog).getByText(/Pause playback/)).toBeVisible();
  expect(
    within(dialog).queryByText("Evidence", { exact: true }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Stop flashing" }),
  );
  expect(dialog).not.toHaveClass("is-flashing");
  expect(post).not.toHaveBeenCalled();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Enable flashing" }),
  );
  expect(dialog).toHaveClass("is-flashing");
});

it("opens without flashing when reduced motion is preferred", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.mocked(useMission).mockReturnValue(makeMission({ alerts: [critical] }));
  render(<App />);
  expect(screen.getByRole("alertdialog")).not.toHaveClass("is-flashing");
  expect(
    screen.queryByRole("button", { name: "Stop flashing" }),
  ).not.toBeInTheDocument();
});

it("escalates from a small warning to the full anomaly alert", () => {
  const prewarning = {
    ...reading,
    astronaut_id: critical.astronaut_id,
    device_id: critical.device_id,
    code: "respiratory_rate" as const,
    value: 23,
    unit: "breaths/min",
    scenario_id: "ANOMALY" as const,
  };
  vi.mocked(useMission).mockReturnValue(
    (() => {
      const base = makeMission();
      return makeMission({
        observations: [prewarning],
        operations: {
          ...base.operations!,
          control: {
            ...base.operations!.control,
            astronaut_id: prewarning.astronaut_id as "DEMO-CREW-002",
            scenario: "ANOMALY",
            fault: "RESPIRATORY_SURGE",
          },
        },
      });
    })(),
  );
  const view = render(<App />);
  expect(screen.getByText(/Early warning · approaching/)).toBeVisible();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  vi.mocked(useMission).mockReturnValue(
    makeMission({
      observations: [{ ...prewarning, value: 26 }],
      alerts: [critical],
    }),
  );
  view.rerender(<App />);
  expect(
    screen.queryByText(/Early warning · approaching/),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Breathing rate rising",
  );
});

it("keeps the affected vital flashing after acknowledgment until fresh recovery", async () => {
  const active = {
    ...reading,
    id: 10,
    code: "respiratory_rate" as const,
    value: 26,
    unit: "breaths/min",
    scenario_id: "ANOMALY" as const,
  };
  const warning: Alert = {
    ...critical,
    id: 99,
    astronaut_id: reading.astronaut_id,
    device_id: reading.device_id,
    evidence: [active],
  };
  const mission = makeMission({ alerts: [warning], observations: [active] });
  vi.mocked(useMission).mockReturnValue(mission);
  const view = render(<App />);
  vi.mocked(post).mockImplementationOnce(async () => {
    vi.mocked(useMission).mockReturnValue({
      ...mission,
      alerts: [{ ...warning, state: "ACKNOWLEDGED" }],
    });
    return {};
  });
  await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(
    screen
      .getByRole("heading", { name: "Respiratory rate" })
      .closest("article"),
  ).toHaveClass("is-recovering");
  vi.mocked(useMission).mockReturnValue({
    ...mission,
    alerts: [{ ...warning, state: "ACKNOWLEDGED" }],
    observations: [active, { ...active, id: 11, value: 13 }],
  });
  view.rerender(<App />);
  expect(
    screen
      .getByRole("heading", { name: "Respiratory rate" })
      .closest("article"),
  ).not.toHaveClass("is-recovering");
});

it("opens pulse decrease with the falling-pulse title and evidence", () => {
  vi.mocked(useMission).mockReturnValue(
    makeMission({
      alerts: [
        {
          ...critical,
          priority: 2,
          severity: "WARNING_DEMO",
          rule_id: "pulse-decrease-fixture",
          evidence: [
            {
              ...critical.evidence[0],
              code: "heart_rate",
              value: 45,
              unit: "beats/min",
            },
          ],
        },
      ],
    }),
  );
  render(<App />);
  const dialog = screen.getByRole("alertdialog", { name: /Pulse falling/ });
  expect(dialog).toHaveTextContent("45 beats/min");
  expect(dialog).toHaveTextContent("active pulse-decrease fault setting");
});

it("flashes the dashboard for current anomaly values even without pending alerts and stops on recovery", async () => {
  const active = { ...reading, value: 125 };
  const mission = makeMission({ observations: [active] });
  vi.mocked(useMission).mockReturnValue(mission);
  const view = render(<App />);
  const dashboard = screen.getByRole("button", { name: "Mission dashboard" });
  expect(dashboard).not.toHaveClass("nav-anomaly-attention");
  await userEvent.click(screen.getByRole("button", { name: "Equipment" }));
  expect(dashboard).toHaveClass("nav-anomaly-attention");
  expect(dashboard).toHaveAttribute(
    "aria-description",
    "1 vital readings in demo anomaly ranges",
  );
  vi.mocked(useMission).mockReturnValue({
    ...mission,
    alerts: [{ ...critical, state: "ACKNOWLEDGED" }],
  });
  view.rerender(<App />);
  expect(dashboard).toHaveClass("nav-anomaly-attention");
  await userEvent.click(dashboard);
  expect(dashboard).not.toHaveClass("nav-anomaly-attention");
  await userEvent.click(screen.getByRole("button", { name: "Equipment" }));
  expect(dashboard).toHaveClass("nav-anomaly-attention");
  vi.mocked(useMission).mockReturnValue({
    ...mission,
    observations: [active, { ...reading, id: 2 }],
  });
  view.rerender(<App />);
  expect(dashboard).not.toHaveClass("nav-anomaly-attention");
});
