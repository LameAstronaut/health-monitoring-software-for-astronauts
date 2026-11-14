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
