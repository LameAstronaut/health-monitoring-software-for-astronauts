// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VehicleRadiation } from "./VehicleRadiation";
import type { VehicleRadiationSnapshot } from "../services/api";
import { NOW } from "../test/fixtures";

afterEach(cleanup);
const data: VehicleRadiationSnapshot = {
  vehicle_id: "DEMO-VEHICLE-001",
  source_type: "SIMULATED",
  run_id: "vehicle-run",
  integration_start_simulated_at: 0,
  simulated_at: 3600,
  readings: [
    {
      sensor_id: "VEH-RAD-001",
      location: "Main cabin",
      dose_rate_ugy_h: 14.2,
      accumulated_dose_mgy: 0.014023,
      observed_at: new Date(NOW).toISOString(),
      freshness: "LIVE",
    },
  ],
};

it("shows environmental values and ages old readings even without another API response", () => {
  const view = render(
    <VehicleRadiation
      data={data}
      now={NOW}
      staleSeconds={2}
      disconnectSeconds={4}
    />,
  );
  const table = screen.getByRole("table", {
    name: "Vehicle radiation sensors",
  });
  expect(within(table).getByText("14.20")).toBeVisible();
  expect(within(table).getByText("0.014023")).toBeVisible();
  expect(within(table).getByText("LIVE")).toBeVisible();
  view.rerender(
    <VehicleRadiation
      data={data}
      now={NOW + 3000}
      staleSeconds={2}
      disconnectSeconds={4}
    />,
  );
  expect(within(table).getByText("STALE")).toBeVisible();
  view.rerender(
    <VehicleRadiation
      data={data}
      now={NOW + 5000}
      staleSeconds={2}
      disconnectSeconds={4}
    />,
  );
  expect(within(table).getByText("DISCONNECTED")).toBeVisible();
  expect(within(table).getByText("14.20")).toBeVisible();
});

it("keeps missing sensors unavailable and shows zero as a valid dose", () => {
  render(
    <VehicleRadiation
      data={{
        ...data,
        readings: [{ ...data.readings[0], accumulated_dose_mgy: 0 }],
      }}
      now={NOW}
    />,
  );
  expect(screen.getByText("0.000000")).toBeVisible();
  expect(screen.getAllByText("No reading received")).toHaveLength(2);
  expect(screen.getAllByText("NOT AVAILABLE")).toHaveLength(2);
});
