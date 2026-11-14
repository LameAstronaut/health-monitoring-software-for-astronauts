// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MoodCheckIn } from "./MoodCheckIn";
import { post, type MoodEntry } from "../services/api";
import { makeMission, NOW } from "../test/fixtures";

vi.mock("../services/api", async (original) => ({
  ...(await original<typeof import("../services/api")>()),
  post: vi.fn(),
}));
const entry = (score: number, astronaut_id = "DEMO-CREW-001"): MoodEntry => ({
  id: `mood-${astronaut_id}`,
  astronaut_id: astronaut_id as MoodEntry["astronaut_id"],
  score,
  recorded_at: new Date(NOW).toISOString(),
  source_type: "SIMULATED",
});
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  [1, "Unhappy"],
  [2, "Neutral"],
  [3, "Happy"],
] as const)(
  "submits mood %i and replaces the face with %s",
  async (score, label) => {
    const mission = makeMission();
    vi.mocked(post).mockResolvedValueOnce(entry(score));
    render(<MoodCheckIn mission={mission} crewId="DEMO-CREW-001" />);
    const trigger = screen.getByRole("button", {
      name: /Mood for Alex Morgan: Not recorded/,
    });
    await userEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "How are you feeling today?" }),
    ).toBeVisible();
    const slider = screen.getByRole("slider", { name: "Mood" });
    expect(slider).toHaveFocus();
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "3");
    expect(slider).toHaveAttribute("step", "1");
    fireEvent.change(slider, { target: { value: String(score) } });
    expect(slider).toHaveAttribute("aria-valuetext", `${label} (${score})`);
    await userEvent.click(screen.getByRole("button", { name: "Submit mood" }));
    expect(post).toHaveBeenCalledWith("moods", {
      astronaut_id: "DEMO-CREW-001",
      score,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Mood for Alex Morgan: ${label}. Update mood`,
      }),
    ).toHaveFocus();
    expect(mission.refresh).toHaveBeenCalledOnce();
  },
);

it("keeps each crew's saved mood separate and starts a new day unrecorded", () => {
  const mission = makeMission();
  mission.operations!.moods = [entry(3), entry(1, "DEMO-CREW-002")];
  const view = render(
    <MoodCheckIn key="one" mission={mission} crewId="DEMO-CREW-001" />,
  );
  expect(
    screen.getByRole("button", { name: /Alex Morgan: Happy/ }),
  ).toBeVisible();
  view.rerender(
    <MoodCheckIn key="two" mission={mission} crewId="DEMO-CREW-002" />,
  );
  expect(
    screen.getByRole("button", { name: /Jordan Lee: Unhappy/ }),
  ).toBeVisible();
  view.rerender(
    <MoodCheckIn
      key="one"
      mission={{ ...mission, serverNow: NOW + 86400000 }}
      crewId="DEMO-CREW-001"
    />,
  );
  expect(
    screen.getByRole("button", { name: /Alex Morgan: Not recorded/ }),
  ).toBeVisible();
});

it("cancels a draft without changing the recorded mood", async () => {
  render(<MoodCheckIn mission={makeMission()} crewId="DEMO-CREW-001" />);
  await userEvent.click(screen.getByRole("button", { name: /Mood for/ }));
  fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(post).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /Not recorded/ })).toBeVisible();
});

it("keeps the draft open after a failed save and supports retry", async () => {
  vi.mocked(post)
    .mockRejectedValueOnce(new Error("API 503"))
    .mockResolvedValueOnce(entry(1));
  render(<MoodCheckIn mission={makeMission()} crewId="DEMO-CREW-001" />);
  await userEvent.click(screen.getByRole("button", { name: /Mood for/ }));
  fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
  await userEvent.click(screen.getByRole("button", { name: "Submit mood" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Could not save your mood: API 503",
  );
  expect(screen.getByRole("slider")).toHaveValue("1");
  await userEvent.click(screen.getByRole("button", { name: "Submit mood" }));
  expect(
    screen.getByRole("button", { name: /Alex Morgan: Unhappy/ }),
  ).toBeVisible();
});
