import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectStream } from "./api";

class MockSocket {
  static instances: MockSocket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  closed = false;
  constructor(public url: string) {
    MockSocket.instances.push(this);
  }
  close() {
    if (!this.closed) {
      this.closed = true;
      this.onclose?.();
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  MockSocket.instances = [];
  vi.stubGlobal("WebSocket", MockSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "127.0.0.1:5173" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("reconnects after loss and stops reconnecting when disposed", () => {
  const status = vi.fn();
  const stop = connectStream(vi.fn(), status, vi.fn());
  const first = MockSocket.instances[0];
  expect(first.url).toBe("ws://127.0.0.1:5173/api/v1/stream");
  first.onopen?.();
  expect(status).toHaveBeenLastCalledWith(true);
  first.close();
  expect(status).toHaveBeenLastCalledWith(false);
  vi.advanceTimersByTime(500);
  expect(MockSocket.instances).toHaveLength(2);
  stop();
  vi.advanceTimersByTime(20000);
  expect(MockSocket.instances).toHaveLength(2);
});

it("closes a silent stream and reports malformed frames", () => {
  const error = vi.fn();
  const stop = connectStream(vi.fn(), vi.fn(), error);
  const first = MockSocket.instances[0];
  first.onopen?.();
  first.onmessage?.({ data: "not json" });
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("Invalid stream message"),
  );
  vi.advanceTimersByTime(500);
  const second = MockSocket.instances[1];
  second.onopen?.();
  vi.advanceTimersByTime(6000);
  expect(second.closed).toBe(true);
  stop();
});
