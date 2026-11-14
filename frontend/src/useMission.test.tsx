// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectStream, get, snapshot } from "./services/api";
import { useMission } from "./useMission";
import { makeMission } from "./test/fixtures";

vi.mock("./services/api", () => ({
  connectStream: vi.fn(),
  get: vi.fn(),
  snapshot: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const mission = makeMission();
const data: Record<string, unknown> = {
  operations: mission.operations,
  "crew/summaries": mission.summaries,
  alerts: mission.alerts,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(connectStream).mockReturnValue(vi.fn());
  vi.mocked(snapshot).mockResolvedValue({
    ...mission,
    health: mission.health!,
    operations: mission.operations!,
  });
  vi.mocked(get).mockImplementation(<T,>(route: string) =>
    Promise.resolve(data[route] as T),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });

it("keeps one poll in flight and cancels its requests when unmounted", async () => {
  const pending = deferred<unknown>();
  vi.mocked(get).mockReturnValueOnce(pending.promise);
  const view = renderHook(() => useMission());
  await settle();
  await advance(8000);
  expect(get).toHaveBeenCalledTimes(3);
  pending.resolve(mission.operations);
  await settle();
  await advance(2000);
  expect(get).toHaveBeenCalledTimes(6);
  const held = deferred<unknown>();
  vi.mocked(get).mockReturnValueOnce(held.promise);
  await advance(2000);
  const signal = vi.mocked(get).mock.calls.at(-3)![1]!;
  expect(signal.aborted).toBe(false);
  view.unmount();
  expect(signal.aborted).toBe(true);
  held.reject(new DOMException("Cancelled", "AbortError"));
  await settle();
});

it("automatically clears the operational timeout after a successful retry", async () => {
  vi.mocked(get).mockRejectedValueOnce(
    new DOMException("Timed out", "TimeoutError"),
  );
  const { result } = renderHook(() => useMission());
  await settle();
  await advance(2000);
  expect(result.current.error).toBe(
    "Operational records timed out. Retrying automatically.",
  );
  await advance(2000);
  expect(result.current.error).toBe("");
  expect(result.current.operations).toEqual(mission.operations);
});

it("ignores a superseded poll failure after manual refresh", async () => {
  const pending = deferred<unknown>();
  vi.mocked(get).mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useMission());
  await settle();
  await advance(2000);
  const signal = vi.mocked(get).mock.calls[0][1]!;
  await act(() => result.current.refresh());
  expect(signal.aborted).toBe(true);
  pending.reject(new DOMException("Timed out", "TimeoutError"));
  await settle();
  expect(result.current.error).toBe("");
});

it("does not clear a snapshot failure just because the smaller poll succeeds", async () => {
  vi.mocked(snapshot).mockRejectedValueOnce(new Error("Snapshot unavailable"));
  const { result } = renderHook(() => useMission());
  await settle();
  await advance(2000);
  expect(result.current.error).toContain("Snapshot unavailable");
});
