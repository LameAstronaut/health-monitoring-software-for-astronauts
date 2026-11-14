// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { BodyMap } from "./BodyMap";
import { reading } from "../test/fixtures";

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

it("keeps region controls keyboard accessible in the 3D view", async () => {
  render(<BodyMap observations={[reading]} examinations={[]} />);
  await userEvent.click(screen.getByRole("button", { name: "3D schematic" }));
  const head = screen.getByRole("button", { name: "Head & eyes" });
  head.focus();
  await userEvent.keyboard(" ");
  expect(head).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("slider", { name: "Rotate body" })).toBeVisible();
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
