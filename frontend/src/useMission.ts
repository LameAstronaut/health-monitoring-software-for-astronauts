import { useCallback, useEffect, useRef, useState } from "react";
import { connectStream, get, snapshot } from "./services/api";
import type {
  Alert,
  CrewMember,
  CrewSummary,
  Device,
  Health,
  Observation,
  Operations,
  StreamEvent,
  WaveformReading,
  VehicleRadiationSnapshot,
} from "./services/api";
import { mergeObservations } from "./telemetry";

type MissionData = {
  observations: Observation[];
  alerts: Alert[];
  crew: CrewMember[];
  devices: Device[];
  health?: Health;
  operations?: Operations;
  summaries: CrewSummary[];
  waveforms: WaveformReading[];
  vehicleRadiation?: VehicleRadiationSnapshot;
};
const empty: MissionData = {
  observations: [],
  alerts: [],
  crew: [],
  devices: [],
  summaries: [],
  waveforms: [],
};

export function useMission(astronautId = "DEMO-CREW-001") {
  const [data, setData] = useState<MissionData>(empty);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [pollingError, setPollingError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let buffering = true;
    let generation = 0;
    let pending: StreamEvent[] = [];
    let controller: AbortController | undefined;
    let pollingController: AbortController | undefined;
    const apply = (events: StreamEvent[]) => {
      if (disposed || events.length === 0) return;
      const system = events
        .filter(
          (event): event is Extract<StreamEvent, { type: "system.status" }> =>
            event.type === "system.status",
        )
        .at(-1);
      if (system) setOffset(Date.parse(system.data.server_time) - Date.now());
      setData((previous) => {
        const next = { ...previous };
        for (const event of events) {
          switch (event.type) {
            case "telemetry.observation":
              if (event.data.astronaut_id === astronautId)
                next.observations = mergeObservations(next.observations, [
                  event.data,
                ]);
              break;
            case "telemetry.waveform":
              if (event.data.astronaut_id === astronautId)
                next.waveforms = [
                  ...next.waveforms.filter(
                    (w) =>
                      w.event_id !== event.data.event_id &&
                      w.run_id === event.data.run_id,
                  ),
                  event.data,
                ].slice(-8);
              break;
            case "alert.created":
              next.alerts = [
                ...next.alerts.filter((a) => a.id !== event.data.id),
                event.data,
              ]
                .sort((a, b) => a.priority - b.priority || b.id - a.id)
                .slice(0, 200);
              break;
            case "device.status":
              next.devices = [
                ...next.devices.filter((d) => d.id !== event.data.id),
                event.data,
              ];
              break;
            case "system.status":
              next.health = event.data;
              break;
          }
        }
        return next;
      });
    };
    const resnapshot = async () => {
      controller?.abort();
      pollingController?.abort();
      const current = new AbortController();
      controller = current;
      const version = ++generation;
      buffering = true;
      pending = [];
      try {
        const result = await snapshot(current.signal, astronautId);
        if (disposed || version !== generation) return;
        setData(result);
        setOffset(Date.parse(result.health.server_time) - Date.now());
        setError("");
        setPollingError("");
        apply(pending);
      } catch (cause) {
        if (!disposed && !current.signal.aborted) setError(String(cause));
      } finally {
        if (!disposed && version === generation) {
          buffering = false;
          pending = [];
          setLoading(false);
        }
      }
    };
    refreshRef.current = resnapshot;
    const stop = connectStream(
      (event) => {
        if (pending.length >= 5000) {
          pending = [];
          setError("Stream backlog exceeded. Refresh to resynchronize.");
          void resnapshot();
        } else pending.push(event);
      },
      (status) => {
        if (disposed) return;
        setConnected(status);
        if (status) void resnapshot();
      },
      (message) => {
        if (!disposed) setError(message);
      },
    );
    void resnapshot();
    const render = setInterval(() => {
      setNow(Date.now());
      if (!buffering) {
        const events = pending;
        pending = [];
        apply(events);
      }
    }, 250);
    const polling = setInterval(() => {
      if (buffering || pollingController) return;
      const current = new AbortController();
      pollingController = current;
      const pollingGeneration = generation;
      void Promise.all([
        get<Operations>("operations", current.signal),
        get<CrewSummary[]>("crew/summaries", current.signal),
        get<Alert[]>("alerts", current.signal),
        get<VehicleRadiationSnapshot>("vehicle/radiation", current.signal),
      ])
        .then(([operations, summaries, alerts, vehicleRadiation]) => {
          if (
            !disposed &&
            !current.signal.aborted &&
            generation === pollingGeneration
          ) {
            setData((old) => ({
              ...old,
              operations,
              summaries,
              alerts,
              vehicleRadiation,
            }));
            setPollingError("");
          }
        })
        .catch((cause) => {
          if (
            !disposed &&
            !current.signal.aborted &&
            generation === pollingGeneration
          )
            setPollingError(
              (cause instanceof Error || cause instanceof DOMException) &&
                cause.name === "TimeoutError"
                ? "Operational records timed out. Retrying automatically."
                : `Operational records unavailable: ${String(cause)}. Retrying automatically.`,
            );
        })
        .finally(() => {
          current.abort();
          if (pollingController === current) pollingController = undefined;
        });
    }, 2000);
    return () => {
      disposed = true;
      controller?.abort();
      pollingController?.abort();
      stop();
      clearInterval(render);
      clearInterval(polling);
    };
  }, [astronautId]);

  return {
    ...data,
    connected,
    error: error || pollingError,
    loading,
    now,
    serverNow: now + offset,
    refresh,
  };
}
