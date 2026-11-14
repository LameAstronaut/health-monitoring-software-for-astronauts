// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CrewStrip, MetricGrid } from "./monitoring";
import { makeMission, reading } from "../test/fixtures";
import type { Alert } from "../services/api";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
const abnormal = {
  ...reading,
  id: 2,
  value: 125,
  scenario_id: "ANOMALY" as const,
};
const alert: Alert = {
  id: 501,
  priority: 2,
  severity: "WARNING_DEMO",
  state: "ACKNOWLEDGED",
  rule_id: "pulse-rise-fixture",
  rule_version: "demo-fixture-v2",
  message: "Pulse rise",
  event_id: reading.event_id,
  device_id: reading.device_id,
  astronaut_id: reading.astronaut_id,
  occurred_at: reading.observed_at,
  source_type: "SIMULATED",
  evidence: [abnormal],
};

it("uses streamed live heart rate while crew summaries are catching up", () => {
  render(
    <CrewStrip
      mission={makeMission()}
      crewId={reading.astronaut_id}
      selectCrew={vi.fn()}
    />,
  );
  const crew = screen.getByRole("button", { name: /Alex Morgan/ });
  expect(crew).toHaveTextContent("68 bpm");
  expect(crew).toHaveTextContent("LIVE");
  expect(crew).not.toHaveTextContent("No data");
});

it("flashes only the acknowledged vital until recovery and remembers recovery", () => {
  const mission = makeMission({ alerts: [alert], observations: [abnormal] });
  const view = render(
    <MetricGrid mission={mission} crewId={reading.astronaut_id} />,
  );
  const pulse = screen
    .getByRole("heading", { name: "Heart rate" })
    .closest("article");
  expect(pulse).toHaveClass("is-recovering");
  expect(
    screen
      .getByRole("heading", { name: "Respiratory rate" })
      .closest("article"),
  ).not.toHaveClass("is-recovering");
  const recovered = { ...reading, id: 3, value: 70 };
  view.rerender(
    <MetricGrid
      mission={{ ...mission, observations: [abnormal, recovered] }}
      crewId={reading.astronaut_id}
    />,
  );
  expect(pulse).not.toHaveClass("is-recovering");
  view.unmount();
  render(
    <MetricGrid
      mission={{ ...mission, observations: [{ ...abnormal, id: 4 }] }}
      crewId={reading.astronaut_id}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Heart rate" }).closest("article"),
  ).not.toHaveClass("is-recovering");
});

it.each(["STALE", "INVALID", "DISCONNECTED"])(
  "does not resolve recovery from %s data",
  (state) => {
    const sample = {
      ...reading,
      id: 3,
      value: 68,
      quality: state === "INVALID" ? ("INVALID" as const) : ("VALID" as const),
      freshness: state === "STALE" ? ("STALE" as const) : ("LIVE" as const),
    };
    const mission = makeMission({
      alerts: [alert],
      observations: [abnormal, sample],
      connected: state !== "DISCONNECTED",
    });
    render(<MetricGrid mission={mission} crewId={reading.astronaut_id} />);
    expect(
      screen.getByRole("heading", { name: "Heart rate" }).closest("article"),
    ).toHaveClass("is-recovering");
  },
);

it("ignores alerts from older runs and other crew", () => {
  const mission = makeMission({
    alerts: [alert],
    observations: [{ ...abnormal, run_id: "new-run" }],
  });
  const view = render(
    <MetricGrid mission={mission} crewId={reading.astronaut_id} />,
  );
  expect(
    screen.getByRole("heading", { name: "Heart rate" }).closest("article"),
  ).not.toHaveClass("is-recovering");
  view.rerender(<MetricGrid mission={mission} crewId="DEMO-CREW-002" />);
  expect(
    screen.queryByText(/awaiting baseline recovery/),
  ).not.toBeInTheDocument();
});

it("shows terminal vitals, unavailable oxygen and independent live suit pressure", () => {
  const deceasedCrewIds = new Set([reading.astronaut_id]);
  const observations = [
    { ...reading, value: 0, deceased: true },
    {
      ...reading,
      id: 2,
      code: "spo2" as const,
      value: 98.2,
      unit: "%",
      deceased: true,
      quality: "INVALID" as const,
    },
    {
      ...reading,
      id: 3,
      code: "suit_pressure" as const,
      value: 30,
      unit: "kPa",
      deceased: true,
    },
  ];
  render(
    <MetricGrid
      mission={makeMission({ observations })}
      crewId={reading.astronaut_id}
      deceasedCrewIds={deceasedCrewIds}
    />,
  );
  const heart = screen
    .getByRole("heading", { name: "Heart rate" })
    .closest("article")!;
  expect(heart).toHaveTextContent("DECEASED");
  expect(heart).not.toHaveTextContent("NO LIVE DATA");
  const oxygen = screen
    .getByRole("heading", { name: "Oxygen saturation" })
    .closest("article")!;
  expect(oxygen).toHaveTextContent("NO SIGNAL");
  expect(oxygen).toHaveTextContent("No pulsatile signal");
  expect(oxygen).not.toHaveTextContent("98.2");
  const suit = screen
    .getByRole("heading", { name: "Suit pressure" })
    .closest("article")!;
  expect(suit).toHaveTextContent("LIVE");
});
