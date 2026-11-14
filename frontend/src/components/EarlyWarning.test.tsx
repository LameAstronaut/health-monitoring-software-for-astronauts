// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { EarlyWarning } from "./EarlyWarning";
import { makeMission as baseMission, reading } from "../test/fixtures";

function makeMission(overrides: Parameters<typeof baseMission>[0] = {}) {
  const base = baseMission();
  return baseMission({
    operations: {
      ...base.operations!,
      control: {
        ...base.operations!.control,
        scenario: "ANOMALY",
        fault: "MULTI_SYSTEM",
      },
    },
    ...overrides,
  });
}

afterEach(cleanup);

it.each([
  ["spo2", 95, "%"],
  ["suit_pressure", 27, "kPa"],
  ["heart_rate", 108, "beats/min"],
  ["respiratory_rate", 23, "breaths/min"],
] as const)(
  "shows a small warning before the %s anomaly marker",
  (code, value, unit) => {
    const mission = makeMission({
      observations: [{ ...reading, code, value, unit, scenario_id: "ANOMALY" }],
    });
    render(
      <EarlyWarning
        mission={mission}
        selectCrew={vi.fn()}
        navigate={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Early warning");
    expect(screen.getByRole("status")).toHaveTextContent(`${value} ${unit}`);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  },
);

it("opens monitoring for the affected crew and clears when readings recover", async () => {
  const selectCrew = vi.fn();
  const navigate = vi.fn();
  const observation = {
    ...reading,
    code: "spo2" as const,
    value: 95,
    unit: "%",
    scenario_id: "ANOMALY" as const,
  };
  const mission = makeMission({ observations: [observation] });
  const view = render(
    <EarlyWarning
      mission={mission}
      selectCrew={selectCrew}
      navigate={navigate}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review live readings" }),
  );
  expect(selectCrew).toHaveBeenCalledWith(reading.astronaut_id);
  expect(navigate).toHaveBeenCalledWith("Live monitoring");
  view.rerender(
    <EarlyWarning
      mission={{
        ...mission,
        observations: [
          observation,
          { ...observation, id: observation.id + 1, value: 98 },
        ],
      }}
      selectCrew={selectCrew}
      navigate={navigate}
    />,
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each([
  "INVALID",
  "STALE",
  "DISCONNECTED",
  "HISTORICAL",
  "REST",
  "THRESHOLD",
])("does not show a preliminary warning for %s readings", (state) => {
  const mission = makeMission({
    connected: state !== "DISCONNECTED",
    observations: [
      {
        ...reading,
        code: "spo2",
        value: state === "THRESHOLD" ? 92 : 95,
        unit: "%",
        scenario_id: state === "REST" ? "REST" : "ANOMALY",
        quality: state === "INVALID" ? "INVALID" : "VALID",
        freshness:
          state === "HISTORICAL"
            ? "HISTORICAL"
            : state === "STALE"
              ? "STALE"
              : "LIVE",
      },
    ],
  });
  render(
    <EarlyWarning mission={mission} selectCrew={vi.fn()} navigate={vi.fn()} />,
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each(["NONE", "OXYGEN"] as const)(
  "does not warn about recovering suit pressure with fault %s",
  (fault) => {
    const base = makeMission();
    const observation = {
      ...reading,
      code: "suit_pressure" as const,
      value: 27,
      unit: "kPa",
      scenario_id: "ANOMALY" as const,
    };
    const mission = makeMission({
      observations: [observation],
      operations: {
        ...base.operations!,
        control: { ...base.operations!.control, fault },
      },
    });
    render(
      <EarlyWarning
        mission={mission}
        selectCrew={vi.fn()}
        navigate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  },
);

it.each([
  ["spo2", 93, 95],
  ["suit_pressure", 26, 27],
  ["heart_rate", 112, 108],
  ["respiratory_rate", 24, 22],
] as const)(
  "does not warn while %s moves toward baseline",
  (code, before, after) => {
    const sample = {
      ...reading,
      code,
      value: before,
      scenario_id: "ANOMALY" as const,
    };
    const mission = makeMission({
      observations: [sample, { ...sample, id: sample.id + 1, value: after }],
    });
    render(
      <EarlyWarning
        mission={mission}
        selectCrew={vi.fn()}
        navigate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  },
);

it("warns for falling pulse before its marker and clears during recovery", () => {
  const mission = makeMission();
  mission.operations!.control.fault = "PULSE_DECREASE";
  mission.observations = [
    { ...reading, code: "heart_rate", value: 52, scenario_id: "ANOMALY" },
  ];
  const props = { mission, selectCrew: vi.fn(), navigate: vi.fn() };
  const view = render(<EarlyWarning {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("52 beats/min");
  view.rerender(
    <EarlyWarning
      {...props}
      mission={{
        ...mission,
        observations: [
          ...mission.observations,
          { ...mission.observations[0], id: reading.id + 1, value: 54 },
        ],
      }}
    />,
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
