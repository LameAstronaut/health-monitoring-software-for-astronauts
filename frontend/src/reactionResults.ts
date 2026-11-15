export type ReactionResults = {
  responses: number[];
  early: number;
  missed: number;
};
export type CompletedReactionTest = ReactionResults & { completedAt: string };
const storageKey = (crewId: string) => `astra-latest-reaction-test:${crewId}`;

export function readReactionResult(
  crewId: string,
): CompletedReactionTest | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(storageKey(crewId)) ?? "null",
    );
    if (
      !value ||
      !Array.isArray(value.responses) ||
      !value.responses.every(
        (time: unknown) =>
          typeof time === "number" &&
          Number.isFinite(time) &&
          time >= 0 &&
          time < 30_000,
      ) ||
      !Number.isInteger(value.early) ||
      value.early < 0 ||
      !Number.isInteger(value.missed) ||
      value.missed < 0 ||
      typeof value.completedAt !== "string" ||
      !Number.isFinite(Date.parse(value.completedAt))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function saveReactionResult(
  crewId: string,
  result: CompletedReactionTest,
) {
  try {
    localStorage.setItem(storageKey(crewId), JSON.stringify(result));
  } catch {
    /* The latest result remains available in the current view. */
  }
}
