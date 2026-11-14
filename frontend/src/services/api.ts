import type { components } from "../types/api";

export type Observation = components["schemas"]["Observation"];
export type Alert = components["schemas"]["Alert"];
export type Device = components["schemas"]["Device"];
export type Health = components["schemas"]["Health"];
export type CrewMember = components["schemas"]["CrewMember"];
export type StreamEvent =
  | { type: "telemetry.observation"; data: Observation }
  | { type: "alert.created"; data: Alert }
  | { type: "device.status"; data: Device }
  | { type: "system.status"; data: Health };

async function get<T>(route: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/${route}`, { signal });
  if (!response.ok) throw new Error(`API ${response.status}: ${route}`);
  return response.json() as Promise<T>;
}

export async function snapshot(signal?: AbortSignal) {
  const [health, crew, devices, observations, alerts] = await Promise.all([
    get<Health>("health", signal),
    get<CrewMember[]>("crew", signal),
    get<Device[]>("devices", signal),
    get<Observation[]>("observations", signal),
    get<Alert[]>("alerts", signal),
  ]);
  return { health, crew, devices, observations, alerts };
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
