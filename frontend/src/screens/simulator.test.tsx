// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SimulatorControls } from "./simulator";
import { makeMission } from "../test/fixtures";
import type { ScreenProps } from "./types";

afterEach(cleanup);
function props(): ScreenProps {
  return {
    mission: makeMission(),
    crewId: "DEMO-CREW-001",
    busy: false,
    action: vi.fn().mockResolvedValue(true),
    navigate: vi.fn(),
    selectCrew: vi.fn(),
  };
}

it("stages a fault and applies it with the selected crew and latest revision", async () => {
  const input = props();
  const view = render(<SimulatorControls {...input} />);
  const select = screen.getByLabelText("Fault");
  expect(screen.getByRole("button", { name: "Apply fault" })).toBeDisabled();
  expect(screen.getByText("Applies to Alex Morgan only.")).toBeVisible();
  await userEvent.selectOptions(select, "PRESSURE");
  expect(screen.getByText("Gradually lowers suit pressure.")).toBeVisible();
  expect(screen.getByText("Applied: None")).toBeVisible();
  expect(input.action).not.toHaveBeenCalled();
  const mission = {
    ...input.mission,
    operations: {
      ...input.mission.operations!,
      control: { ...input.mission.operations!.control, revision: 7 },
    },
  };
  view.rerender(<SimulatorControls {...input} mission={mission} />);
  expect(select).toHaveValue("PRESSURE");
  await userEvent.click(screen.getByRole("button", { name: "Apply fault" }));
  expect(input.action).toHaveBeenCalledWith(
    "demo/control",
    {
      action: "CONFIGURE",
      expected_revision: 7,
      astronaut_id: input.crewId,
      fault: "PRESSURE",
      scenario: "ANOMALY",
    },
    "Playback settings updated",
  );
});

it("keeps the current fault until None is explicitly applied", async () => {
  const input = props();
  input.mission.operations!.control.fault = "DISCONNECT";
  render(<SimulatorControls {...input} />);
  await userEvent.selectOptions(screen.getByLabelText("Fault"), "NONE");
  expect(input.action).not.toHaveBeenCalled();
  expect(screen.getByText("Applied: Sensor disconnected")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Apply fault" }));
  expect(input.action).toHaveBeenCalledWith(
    "demo/control",
    expect.objectContaining({ fault: "NONE", astronaut_id: input.crewId }),
    "Playback settings updated",
  );
});

it("retains the staged selection on a failed apply and disables applying while busy", async () => {
  const input = props();
  input.action = vi.fn().mockResolvedValue(false);
  const view = render(<SimulatorControls {...input} />);
  await userEvent.selectOptions(screen.getByLabelText("Fault"), "DISCONNECT");
  await userEvent.click(screen.getByRole("button", { name: "Apply fault" }));
  expect(screen.getByLabelText("Fault")).toHaveValue("DISCONNECT");
  expect(screen.getByText("Applied: None")).toBeVisible();
  view.rerender(<SimulatorControls {...input} busy />);
  expect(screen.getByRole("button", { name: "Apply fault" })).toBeDisabled();
});

it("applies a pulse decrease as an anomaly for the selected crew", async () => {
  const input = props();
  render(<SimulatorControls {...input} />);
  await userEvent.selectOptions(
    screen.getByLabelText("Fault"),
    "PULSE_DECREASE",
  );
  await userEvent.click(screen.getByRole("button", { name: "Apply fault" }));
  expect(input.action).toHaveBeenCalledWith(
    "demo/control",
    expect.objectContaining({
      fault: "PULSE_DECREASE",
      scenario: "ANOMALY",
      astronaut_id: input.crewId,
    }),
    "Playback settings updated",
  );
});
