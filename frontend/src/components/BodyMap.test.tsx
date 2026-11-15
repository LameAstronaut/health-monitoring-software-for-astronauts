// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
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
  expect(screen.getByText("NOT AVAILABLE")).toBeVisible();
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

it("opens NeuroAdapt reaction practice from the head region only", async () => {
  const onOpenReactionTest = vi.fn();
  render(
    <BodyMap
      observations={[]}
      examinations={[]}
      onOpenReactionTest={onOpenReactionTest}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Open reaction test" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Head & eyes" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Open reaction test" }),
  );
  expect(onOpenReactionTest).toHaveBeenCalledOnce();
  await userEvent.click(
    screen.getByRole("button", { name: "Arms & movement" }),
  );
  expect(
    screen.queryByRole("button", { name: "Open reaction test" }),
  ).not.toBeInTheDocument();
});

it("shows the latest completed reaction results in the head section", async () => {
  render(
    <BodyMap
      observations={[]}
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
    screen.queryByLabelText("Latest reaction test result"),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Head & eyes" }));
  const result = screen.getByLabelText("Latest reaction test result");
  expect(result).toHaveTextContent("Average reaction time300 ms");
  expect(result).toHaveTextContent("Median reaction time300 ms");
  expect(result).toHaveTextContent("Fastest response200 ms");
  expect(result).toHaveTextContent("False starts2");
  expect(result).toHaveTextContent("Missed cues1");
  expect(result).toHaveTextContent("09:00:00 UTC");
});
