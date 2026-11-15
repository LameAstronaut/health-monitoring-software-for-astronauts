// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { readReactionResult, saveReactionResult } from "./reactionResults";

afterEach(() => localStorage.clear());

it("keeps the latest result per crew after reading storage again", () => {
  const first = {
    responses: [230],
    early: 1,
    missed: 0,
    completedAt: "2026-11-14T09:00:00Z",
  };
  saveReactionResult("crew-a", first);
  expect(readReactionResult("crew-a")).toEqual(first);
  expect(readReactionResult("crew-b")).toBeNull();
  const next = {
    ...first,
    responses: [310],
    completedAt: "2026-11-14T10:00:00Z",
  };
  saveReactionResult("crew-a", next);
  saveReactionResult("crew-b", first);
  expect(readReactionResult("crew-a")).toEqual(next);
  expect(readReactionResult("crew-b")).toEqual(first);
});

it("ignores corrupted stored results", () => {
  localStorage.setItem("astra-latest-reaction-test:crew-a", "broken");
  expect(readReactionResult("crew-a")).toBeNull();
  localStorage.setItem(
    "astra-latest-reaction-test:crew-a",
    JSON.stringify({
      responses: [-1],
      early: 0,
      missed: 0,
      completedAt: "bad",
    }),
  );
  expect(readReactionResult("crew-a")).toBeNull();
});
