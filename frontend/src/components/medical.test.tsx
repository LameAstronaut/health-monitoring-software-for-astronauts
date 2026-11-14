// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EcgChart, TrendChart } from "./medical";
import { NOW, reading } from "../test/fixtures";
import type { WaveformReading } from "../services/api";

afterEach(cleanup);
const chunk: WaveformReading = {
  event_id: "wave-1",
  astronaut_id: "DEMO-CREW-001",
  device_id: "DEMO-SUIT-001",
  observed_at: new Date(NOW).toISOString(),
  received_at: new Date(NOW).toISOString(),
  source_type: "SIMULATED",
  quality: "VALID",
  freshness: "LIVE",
  run_id: "test-run",
  waveform: {
    sample_rate_hz: 125,
    start_simulated_at: 0,
    unit: "mV",
    lead: "DEMO-II",
    samples: [0, 0.1, 0.8, -0.1, 0],
  },
};

it("expires ECG independently of a connected API heartbeat", () => {
  const view = render(<EcgChart chunks={[chunk]} connected serverNow={NOW} />);
  expect(screen.getByText("LIVE")).toBeVisible();
  view.rerender(<EcgChart chunks={[chunk]} connected serverNow={NOW + 6000} />);
  expect(screen.getByText("STALE")).toBeVisible();
  view.rerender(
    <EcgChart chunks={[chunk]} connected serverNow={NOW + 16000} />,
  );
  expect(screen.getByText("DISCONNECTED")).toBeVisible();
});
it("never joins old playback to a new run to imply a physiological jump", () => {
  render(
    <TrendChart
      code="heart_rate"
      readings={[
        { ...reading, id: 1, run_id: "old", value: 140 },
        { ...reading, id: 2, run_id: "new", value: 68 },
      ]}
    />,
  );
  expect(screen.getByText("Trend awaiting samples")).toBeVisible();
});
it("does not fabricate an ECG when only numeric readings exist", () => {
  render(<EcgChart chunks={[]} connected serverNow={NOW} />);
  expect(screen.getByText("ECG waveform unavailable")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("renders the simulator's terminal ECG samples flat while retaining freshness", () => {
  const terminal = {
    ...chunk,
    waveform: { ...chunk.waveform, samples: [0, 0, 0, 0] },
  };
  const view = render(
    <EcgChart deceased chunks={[terminal]} connected serverNow={NOW} />,
  );
  expect(screen.getByText("DECEASED")).toBeVisible();
  const waveform = screen.getByRole("img").querySelector("polyline")!;
  expect(
    waveform
      .getAttribute("points")!
      .split(" ")
      .every((point) => point.endsWith(",108")),
  ).toBe(true);
  view.rerender(
    <EcgChart deceased chunks={[terminal]} connected={false} serverNow={NOW} />,
  );
  expect(screen.getByText("DISCONNECTED")).toBeVisible();
});
