import type { components } from "../types/api";

export type Observation = components["schemas"]["Observation"];
export type Alert = components["schemas"]["Alert"];
export type Device = components["schemas"]["Device"];
export type Health = components["schemas"]["Health"];
export type CrewMember = components["schemas"]["CrewMember"];
export type Examination = components["schemas"]["Examination"];
export type SimulatorControl = components["schemas"]["SimulatorControl"];
export type Operations = components["schemas"]["OperationsSnapshot"];
export type CrewSummary = components["schemas"]["CrewSummary"];
export type WaveformReading = components["schemas"]["WaveformReading"];
export type ControlCommand = components["schemas"]["ControlCommand"];
export type InventoryItem = components["schemas"]["InventoryItem"];
export type EvaSession = components["schemas"]["EvaSession"];
export type FitnessSession = components["schemas"]["FitnessSession"];
export type StreamEvent =
  | { type: "telemetry.observation"; data: Observation }
  | { type: "alert.created"; data: Alert }
  | { type: "telemetry.waveform"; data: WaveformReading }
  | { type: "device.status"; data: Device }
  | { type: "system.status"; data: Health };

export async function get<T>(route: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/${route}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${route}`);
  return response.json() as Promise<T>;
}

export async function post<T>(route: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const error = (await response.json()) as {
        detail?: string | { msg: string }[];
      };
      if (typeof error.detail === "string") message = error.detail;
      else if (Array.isArray(error.detail))
        message = error.detail.map((item) => item.msg).join("; ");
    } catch {
      /* preserve the HTTP status if the upstream response is not JSON */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function snapshot(
  signal?: AbortSignal,
  astronautId = "DEMO-CREW-001",
) {
  const [
    health,
    crew,
    devices,
    observations,
    alerts,
    operations,
    summaries,
    waveforms,
  ] = await Promise.all([
    get<Health>("health", signal),
    get<CrewMember[]>("crew", signal),
    get<Device[]>("devices", signal),
    get<Observation[]>(`observations?astronaut_id=${astronautId}`, signal),
    get<Alert[]>("alerts", signal),
    get<Operations>("operations", signal),
    get<CrewSummary[]>("crew/summaries", signal),
    get<WaveformReading[]>(`waveforms?astronaut_id=${astronautId}`, signal),
  ]);
  return {
    health,
    crew,
    devices,
    observations,
    alerts,
    operations,
    summaries,
    waveforms,
  };
}

export function connectStream(
  onEvent: (event: StreamEvent) => void,
  onConnection: (connected: boolean) => void,
  onError: (message: string) => void,
) {
  let disposed = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let lastMessage = Date.now();
  let delay = 500;
  const connect = () => {
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/v1/stream`,
    );
    socket.onopen = () => {
      delay = 500;
      lastMessage = Date.now();
      onConnection(true);
    };
    socket.onmessage = ({ data }) => {
      lastMessage = Date.now();
      try {
        const event = JSON.parse(String(data)) as StreamEvent;
        if (
          ![
            "telemetry.observation",
            "alert.created",
            "device.status",
            "system.status",
            "telemetry.waveform",
          ].includes(event.type) ||
          !event.data
        )
          throw new Error("Unsupported stream event");
        onEvent(event);
      } catch {
        onError("Invalid stream message. Reconnecting for a fresh snapshot.");
        socket?.close();
      }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      onConnection(false);
      if (!disposed) {
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 10000);
      }
    };
  };
  connect();
  const watchdog = setInterval(() => {
    if (Date.now() - lastMessage > 5000) {
      onConnection(false);
      socket?.close();
    }
  }, 1000);
  return () => {
    disposed = true;
    clearTimeout(retry);
    clearInterval(watchdog);
    socket?.close();
  };
}
