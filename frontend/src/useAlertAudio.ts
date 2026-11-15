import { useCallback, useEffect, useRef, useState } from "react";

const PREFERENCE = "astra-alert-audio";
export type AlertAudioControls = {
  enabled: boolean;
  ready: boolean;
  available: boolean;
  toggle: () => void;
};

function preference() {
  try {
    return localStorage.getItem(PREFERENCE) !== "muted";
  } catch {
    return true;
  }
}

/** Offline synthesized cues; playback begins only after a browser user gesture. */
export function useAlertAudio(review?: {
  id: number;
  priority: number;
}): AlertAudioControls {
  const [enabled, setEnabled] = useState(preference);
  const [ready, setReady] = useState(false);
  const available = typeof window.AudioContext === "function";
  const context = useRef<AudioContext | null>(null);
  const voices = useRef<OscillatorNode[]>([]);
  const mounted = useRef(false);
  const silence = useCallback(() => {
    for (const voice of voices.current) {
      try {
        voice.stop();
      } catch {
        /* Already stopped. */
      }
      voice.disconnect();
    }
    voices.current = [];
  }, []);
  const unlock = useCallback(async () => {
    if (!available) return;
    try {
      const audio = (context.current ??= new AudioContext());
      if (audio.state !== "running") await audio.resume();
      if (mounted.current && context.current === audio)
        setReady(audio.state === "running");
    } catch {
      if (mounted.current) setReady(false);
    }
  }, [available]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      silence();
      const audio = context.current;
      context.current = null;
      if (audio) void audio.close().catch(() => {});
    };
  }, [silence]);

  useEffect(() => {
    if (!enabled || ready || !available) return;
    const gesture = (event: Event) => {
      if ((event.target as Element)?.closest?.("[data-alert-audio-control]"))
        return;
      void unlock();
    };
    document.addEventListener("pointerdown", gesture);
    document.addEventListener("keydown", gesture);
    return () => {
      document.removeEventListener("pointerdown", gesture);
      document.removeEventListener("keydown", gesture);
    };
  }, [enabled, ready, available, unlock]);

  const id = review?.id;
  const priority = review?.priority;
  useEffect(() => {
    if (!enabled || !ready || id === undefined) return;
    const play = () => {
      const audio = context.current;
      if (!audio || audio.state !== "running") {
        setReady(false);
        return;
      }
      silence();
      // Quiet, short tones with gain envelopes avoid clicks and sustained alarms.
      const notes = priority === 1 ? [880, 1100, 880] : [660, 880];
      for (const [index, frequency] of notes.entries()) {
        const start = audio.currentTime + 0.02 + index * 0.25;
        const voice = audio.createOscillator();
        const gain = audio.createGain();
        voice.type = "sine";
        voice.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.06, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        voice.connect(gain);
        gain.connect(audio.destination);
        voice.onended = () => {
          voice.disconnect();
          gain.disconnect();
        };
        voice.start(start);
        voice.stop(start + 0.2);
        voices.current.push(voice);
      }
    };
    play();
    const repeat = window.setInterval(play, 12000);
    return () => {
      window.clearInterval(repeat);
      silence();
    };
  }, [id, priority, enabled, ready, silence]);

  const toggle = useCallback(() => {
    const next = !enabled || !ready;
    setEnabled(next);
    if (!next) silence();
    try {
      localStorage.setItem(PREFERENCE, next ? "enabled" : "muted");
    } catch {
      /* Preference remains usable without storage. */
    }
    if (next) void unlock();
  }, [enabled, ready, unlock, silence]);
  return { enabled, ready, available, toggle };
}
