import { useEffect, useState } from "react";
import { connectStream, snapshot } from "./services/api";
import type {
  Alert,
  CrewMember,
  Device,
  Health,
  Observation,
  StreamEvent,
} from "./services/api";
import { mergeObservations } from "./telemetry";

export function useMission() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [health, setHealth] = useState<Health>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    let buffering = true;
    let events: StreamEvent[] = [];
    let generation = 0;
    const apply = (event: StreamEvent) => {
      switch (event.type) {
        case "telemetry.observation":
          setObservations((old) => mergeObservations(old, [event.data]));
          break;
        case "alert.created":
          setAlerts((old) => [
            ...old.filter((a) => a.id !== event.data.id),
            event.data,
          ]);
          break;
        case "device.status":
          setDevices([event.data]);
          break;
        case "system.status":
          setHealth(event.data);
          setClockOffset(Date.parse(event.data.server_time) - Date.now());
          break;
      }
    };
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const currentController = controller;
      const currentGeneration = ++generation;
      buffering = true;
      events = [];
      try {
        const data = await snapshot(currentController.signal);
        if (disposed || currentGeneration !== generation) return;
        setHealth(data.health);
        setClockOffset(Date.parse(data.health.server_time) - Date.now());
        setCrew(data.crew);
        setDevices(data.devices);
        setObservations(data.observations);
        setAlerts(data.alerts);
        setError("");
        for (const event of events) apply(event);
      } catch (cause) {
        if (!disposed && !currentController.signal.aborted)
          setError(String(cause));
      } finally {
        if (!disposed && currentGeneration === generation) {
          buffering = false;
          events = [];
          setLoading(false);
        }
      }
    };
    const stop = connectStream(
      (event) => {
        if (buffering) {
          if (events.length < 1000) events.push(event);
          else {
            setError("Stream backlog exceeded. Reload to resynchronize.");
            controller?.abort();
          }
        } else apply(event);
      },
      (status) => {
        if (disposed) return;
        setConnected(status);
        if (status) void refresh();
      },
      setError,
    );
    void refresh();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      disposed = true;
      controller?.abort();
      stop();
      clearInterval(clock);
    };
  }, []);

  return {
    observations,
    alerts: [...alerts].sort((a, b) => a.priority - b.priority || b.id - a.id),
    crew,
    devices,
    health,
    connected,
    error,
    loading,
    now,
    serverNow: now + clockOffset,
  };
}
