// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AlertGuidance } from "./AlertGuidance";
import { ALERT_GUIDANCE, NASA_SOURCES } from "../alertGuidance";

afterEach(cleanup);

it.each(Object.keys(ALERT_GUIDANCE))(
  "shows response actions without citations for %s",
  (ruleId) => {
    render(<AlertGuidance ruleId={ruleId} />);
    const area = screen.getByRole("region", { name: "Response guidance" });
    expect(area).toHaveTextContent(ALERT_GUIDANCE[ruleId].focus);
    for (const step of ALERT_GUIDANCE[ruleId].steps) {
      expect(area).toHaveTextContent(step.action);
      // Provenance stays in the source registry, outside the alert interface.
      for (const id of step.sources)
        expect(new URL(NASA_SOURCES[id].url).hostname).toBe("www.nasa.gov");
    }
    expect(within(area).queryByRole("link")).not.toBeInTheDocument();
    expect(area).not.toHaveTextContent(
      /NASA|Source supports|References checked/,
    );
  },
);

it("keeps the medical-assessment fallback for unknown rules", () => {
  render(<AlertGuidance ruleId="unknown-future-rule" />);
  expect(screen.getByText("Medical assessment required")).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/off-nominal suit-pressure procedure/),
  ).not.toBeInTheDocument();
});
