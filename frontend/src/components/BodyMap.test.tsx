// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { BodyMap } from "./BodyMap";
import { reading, reviewExam } from "../test/fixtures";

afterEach(cleanup);

it("selects body regions and exposes linked synthetic measurements", async () => {
  render(<BodyMap observations={[reading]} examinations={[]} />);
  expect(screen.getByRole("button", { name: "Heart & lungs" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("Heart rate")).toBeVisible();
  expect(screen.getByText("68")).toBeVisible();
  expect(screen.getByText("beats/min")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Head & eyes" }));
  expect(screen.getByRole("button", { name: "Head & eyes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getAllByText("NOT AVAILABLE")).toHaveLength(2);
  expect(screen.getByText(/Vision, vestibular/)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Heart & lungs" }));
  expect(screen.getByText(/SIMULATED · DEMO-SUIT-001/)).toBeVisible();
  expect(screen.getByText(/09:00:00 UTC/)).toBeVisible();
});

it("keeps image region controls keyboard accessible", async () => {
  render(<BodyMap observations={[reading]} examinations={[]} />);
  const head = screen.getByRole("button", { name: "Head & eyes" });
  head.focus();
  await userEvent.keyboard(" ");
  expect(head).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/Vision, vestibular/)).toBeVisible();
});

it("uses observation timestamps rather than array order", () => {
  render(
    <BodyMap
      observations={[
        { ...reading, id: 2, value: 75, observed_at: "2026-11-14T10:00:00Z" },
        reading,
      ]}
      examinations={[]}
    />,
  );
  expect(screen.getByText("75")).toBeVisible();
  expect(screen.queryByText("68")).not.toBeInTheDocument();
});

it("links saved body-temperature examinations to arms with instrument and time", async () => {
  const exam = {
    ...reviewExam,
    kind: "BODY_TEMPERATURE" as const,
    device_id: "DEMO-TEMP-001",
    results: [
      {
        code: "body_temperature" as const,
        value: 36.6,
        unit: "°C",
        quality: "VALID" as const,
      },
    ],
  };
  const view = render(<BodyMap observations={[]} examinations={[exam]} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Arms & movement" }),
  );
  expect(screen.getByText("Body temperature")).toBeVisible();
  expect(screen.queryByText("36.6")).not.toBeInTheDocument();
  view.rerender(
    <BodyMap observations={[]} examinations={[{ ...exam, status: "SAVED" }]} />,
  );
  expect(screen.getByText("36.6")).toBeVisible();
  expect(screen.getByText("°C")).toBeVisible();
  expect(screen.getByText(/SIMULATED · DEMO-TEMP-001/)).toBeVisible();
  expect(screen.getByText(/09:00:00 UTC/)).toBeVisible();
});

it("switches the crew body image while keeping the selected region interactive", async () => {
  const view = render(
    <BodyMap observations={[reading]} examinations={[]} bodyVariant="female" />,
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    "/assets/astronaut-body-realistic.png",
  );
  view.rerender(
    <BodyMap observations={[reading]} examinations={[]} bodyVariant="male" />,
  );
  expect(screen.getByRole("img", { name: /male astronaut/ })).toHaveAttribute(
    "src",
    "/assets/astronaut-body-male.png",
  );
  await userEvent.click(screen.getByRole("button", { name: "Head & eyes" }));
  expect(screen.getByRole("button", { name: "Head & eyes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("shows an unavailable average without a reaction-test launch button when no responses exist", async () => {
  render(
    <BodyMap
      observations={[]}
      examinations={[]}
      latestReactionResult={{
        responses: [],
        early: 1,
        missed: 2,
        completedAt: "2026-11-14T09:00:00Z",
      }}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Open reaction test" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Head & eyes" }));
  expect(screen.getByLabelText("Average reaction time")).toHaveTextContent(
    "NOT AVAILABLE",
  );
  expect(
    screen.queryByRole("button", { name: "Open reaction test" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Arms & movement" }),
  );
  expect(
    screen.queryByRole("button", { name: "Open reaction test" }),
  ).not.toBeInTheDocument();
});

it("shows only the average in a card matching sleep duration", async () => {
  render(
    <BodyMap
      observations={[
        { ...reading, code: "sleep_duration", value: 7.5, unit: "h" },
      ]}
      examinations={[]}
      latestReactionResult={{
        responses: [200, 300, 400],
        early: 2,
        missed: 1,
        completedAt: "2026-11-14T09:00:00Z",
      }}
    />,
  );
  expect(
    screen.queryByLabelText("Average reaction time"),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Head & eyes" }));
  const result = screen.getByLabelText("Average reaction time");
  expect(result).toHaveTextContent(/Average reaction time\s*300 ms/);
  expect(result).toHaveClass("body-map-measurement");
  expect(result.parentElement).toHaveClass("body-map-measurements");
  expect(screen.getByText("Sleep duration").parentElement).toHaveClass(
    "body-map-measurement",
  );
  expect(screen.getByText("7.5")).toBeVisible();
  expect(
    screen.queryByText(
      /Median reaction time|Fastest response|False starts|Missed cues/,
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Open reaction test" }),
  ).not.toBeInTheDocument();
  expect(result).toHaveTextContent("09:00:00 UTC");
});
