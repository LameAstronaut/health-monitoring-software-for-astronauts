// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAlertAudio } from "./useAlertAudio";

const voices: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}[] = [];
class AudioContextMock {
  state = "suspended";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createOscillator = vi.fn(() => {
    const voice = {
      frequency: { setValueAtTime: vi.fn() },
      type: "sine",
      onended: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    voices.push(voice);
    return voice;
  });
  createGain = vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  voices.length = 0;
  vi.stubGlobal("AudioContext", AudioContextMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const unlock = () =>
  act(async () => {
    document.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
  });

it("waits for a gesture, avoids duplicate polling cues, and stops on minimize", async () => {
  const view = renderHook(({ review }) => useAlertAudio(review), {
    initialProps: {
      review: { id: 1, priority: 1 } as
        { id: number; priority: number } | undefined,
    },
  });
  expect(voices).toHaveLength(0);
  await unlock();
  expect(view.result.current.ready).toBe(true);
  expect(voices).toHaveLength(3);
  view.rerender({ review: { id: 1, priority: 1 } });
  expect(voices).toHaveLength(3);
  act(() => vi.advanceTimersByTime(12000));
  expect(voices).toHaveLength(6);
  view.rerender({ review: undefined });
  const stops = voices.map((voice) => voice.stop.mock.calls.length);
  expect(stops.every((count) => count >= 2)).toBe(true);
  act(() => vi.advanceTimersByTime(24000));
  expect(voices).toHaveLength(6);
});

it("persists mute and permits explicit enabling and silencing of a warning cue", async () => {
  localStorage.setItem("astra-alert-audio", "muted");
  const view = renderHook(() => useAlertAudio({ id: 2, priority: 2 }));
  await unlock();
  expect(voices).toHaveLength(0);
  await act(async () => view.result.current.toggle());
  expect(voices).toHaveLength(2);
  expect(localStorage.getItem("astra-alert-audio")).toBe("enabled");
  act(() => view.result.current.toggle());
  expect(view.result.current.enabled).toBe(false);
  expect(localStorage.getItem("astra-alert-audio")).toBe("muted");
  act(() => vi.advanceTimersByTime(24000));
  expect(voices).toHaveLength(2);
});

it("cleans up on alert replacement and unmount and tolerates unsupported audio", async () => {
  const view = renderHook(({ id }) => useAlertAudio({ id, priority: 1 }), {
    initialProps: { id: 1 },
  });
  await unlock();
  view.rerender({ id: 2 });
  expect(voices).toHaveLength(6);
  expect(voices[0].stop).toHaveBeenCalledTimes(2);
  view.unmount();
  act(() => vi.advanceTimersByTime(24000));
  expect(voices).toHaveLength(6);
  vi.stubGlobal("AudioContext", undefined);
  const unsupported = renderHook(() => useAlertAudio({ id: 3, priority: 1 }));
  expect(unsupported.result.current.available).toBe(false);
  await act(async () => unsupported.result.current.toggle());
  expect(voices).toHaveLength(6);
});

it("keeps blocked browser audio retryable without throwing", async () => {
  class Blocked extends AudioContextMock {
    resume = vi.fn(async () => {
      throw new Error("Autoplay blocked");
    });
  }
  vi.stubGlobal("AudioContext", Blocked);
  const view = renderHook(() => useAlertAudio({ id: 1, priority: 1 }));
  await unlock();
  expect(view.result.current.ready).toBe(false);
  expect(voices).toHaveLength(0);
  await act(async () => view.result.current.toggle());
  expect(view.result.current.ready).toBe(false);
});
