// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { TelemetryWarnings } from "./TelemetryWarnings";
import { makeMission, reading, NOW } from "../test/fixtures";

afterEach(cleanup);

it("identifies the disconnected sensor and explains how to reconnect", async () => {
  const mission = makeMission();
  mission.devices[0].status = "DISCONNECTED";
  const navigate = vi.fn();
  render(<TelemetryWarnings mission={mission} navigate={navigate} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Alex Morgan · DEMO-SUIT-001: Sensor disconnected",
  );
  expect(screen.getByRole("alert")).toHaveTextContent("no live measurements");
  expect(screen.getByRole("alert")).toHaveTextContent("Apply fault");
  await userEvent.click(screen.getByRole("button", { name: "Check sensors" }));
  expect(navigate).toHaveBeenCalledWith("Equipment");
});

it("detects expired sensor data even if the last device status was live", () => {
  render(
    <TelemetryWarnings
      mission={makeMission({ serverNow: NOW + 16000 })}
      navigate={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Sensor disconnected");
});

it("clears the sensor warning when fresh data resumes", () => {
  const mission = makeMission();
  const view = render(
    <TelemetryWarnings
      mission={{ ...mission, serverNow: NOW + 16000 }}
      navigate={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert")).toBeVisible();
  view.rerender(
    <TelemetryWarnings
      mission={{ ...mission, observations: [{ ...reading, id: 2 }] }}
      navigate={vi.fn()}
    />,
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("distinguishes a backend connection loss from a sensor disconnection", () => {
  render(
    <TelemetryWarnings
      mission={makeMission({ connected: false })}
      navigate={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Live telemetry connection lost",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent(
    "Sensor disconnected",
  );
});

it("does not call an intentionally paused simulation a disconnected sensor", () => {
  const mission = makeMission({ serverNow: NOW + 16000 });
  mission.operations!.control.running = false;
  render(<TelemetryWarnings mission={mission} navigate={vi.fn()} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("shows sensor errors separately from disconnected sensors", () => {
  const mission = makeMission();
  mission.devices[0].status = "ERROR";
  render(<TelemetryWarnings mission={mission} navigate={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Sensor quality error");
  expect(screen.getByRole("alert")).not.toHaveTextContent(
    "Sensor disconnected",
  );
});
