// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReactionTest } from "./ReactionTest";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const start = () => {
  render(<ReactionTest />);
  fireEvent.click(screen.getByRole("button", { name: "Start reaction test" }));
  return screen.getByRole("group", { name: "Spacebar reaction test area" });
};
const press = (target: HTMLElement, repeat = false) =>
  fireEvent.keyDown(target, { code: "Space", key: " ", repeat });
const release = (target: HTMLElement) =>
  fireEvent.keyUp(target, { code: "Space", key: " " });

it("focuses the test, waits for a cue and measures a single spacebar response", () => {
  const target = start();
  expect(target).toHaveFocus();
  expect(screen.getByText("WAIT FOR THE CUE")).toBeVisible();
  advance(1008);
  expect(within(target).getByText("PRESS SPACE")).toBeVisible();
  advance(200);
  press(target);
  release(target);
  expect(screen.getByText("WAIT FOR THE CUE")).toBeVisible();
  advance(30_000 - 1208);
  expect(screen.getByText("Test complete")).toBeVisible();
  const results = screen.getByLabelText("Reaction test results");
  expect(within(results).getAllByText("200 ms")).toHaveLength(3);
  expect(screen.getByRole("timer")).toHaveTextContent("0 seconds remaining");
});

it("counts false starts, ignores repeated and held keys, and counts missed cues", () => {
  const target = start();
  press(target);
  press(target, true);
  advance(1008);
  expect(within(target).getByText("PRESS SPACE")).toBeVisible();
  press(target); // Still held: cannot answer the cue.
  advance(2000);
  expect(screen.getByText("WAIT FOR THE CUE")).toBeVisible();
  release(target);
  advance(30_000 - 3008);
  const results = screen.getByLabelText("Reaction test results");
  expect(
    within(results).getByText("False starts").nextElementSibling,
  ).toHaveTextContent("1");
  expect(
    within(results).getByText("Responses").nextElementSibling,
  ).toHaveTextContent("0");
  expect(
    Number(
      within(results).getByText("Missed cues").nextElementSibling?.textContent,
    ),
  ).toBeGreaterThan(0);
  expect(within(results).getAllByText("No responses")).toHaveLength(3);
});

it("stops on focus loss, starts a clean attempt and cleans up on unmount", () => {
  const view = render(<ReactionTest />);
  fireEvent.click(screen.getByRole("button", { name: "Start reaction test" }));
  fireEvent.blur(
    screen.getByRole("group", { name: "Spacebar reaction test area" }),
  );
  expect(screen.getByText("Test stopped")).toBeVisible();
  expect(
    screen.queryByLabelText("Reaction test results"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByRole("timer")).toHaveTextContent("30 seconds remaining");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("stops when the window loses focus", () => {
  start();
  fireEvent(window, new Event("blur"));
  expect(screen.getByText("Test stopped")).toBeVisible();
  advance(30_000);
  expect(screen.queryByText("Test complete")).not.toBeInTheDocument();
});

it("publishes only completed attempts, once, and does not replace them on interruption", () => {
  const onComplete = vi.fn();
  render(<ReactionTest onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "Start reaction test" }));
  advance(30_000);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(
    expect.objectContaining({
      responses: [],
      early: 0,
      completedAt: expect.any(String),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent(window, new Event("blur"));
  expect(onComplete).toHaveBeenCalledTimes(1);
});
