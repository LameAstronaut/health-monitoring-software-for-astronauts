import { useEffect, useRef, useState } from "react";
import { post, type MoodEntry } from "../services/api";
import type { Mission } from "../screens/types";

const LABELS: Record<number, string> = {
  1: "Unhappy",
  2: "Neutral",
  3: "Happy",
};

function MoodFace({
  score,
  unrecorded = false,
}: {
  score: number;
  unrecorded?: boolean;
}) {
  return (
    <svg
      className={`mood-face mood-${unrecorded ? "unrecorded" : score}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <circle className="mood-face-fill" cx="32" cy="32" r="28" />
      <g fill="currentColor">
        <circle cx="22" cy="25" r="2.5" />
        <circle cx="42" cy="25" r="2.5" />
      </g>
      <path
        d={
          score === 1
            ? "M20 44 Q32 30 44 44"
            : score === 3
              ? "M20 36 Q32 50 44 36"
              : "M21 40 H43"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoodCheckIn({
  mission,
  crewId,
}: {
  mission: Mission;
  crewId: string;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<MoodEntry | null>(null);
  const today = new Date(mission.serverNow).toISOString().slice(0, 10);
  const entries = [
    ...(mission.operations?.moods ?? []),
    ...(saved ? [saved] : []),
  ]
    .filter(
      (entry) =>
        entry.astronaut_id === crewId &&
        entry.recorded_at.slice(0, 10) === today,
    )
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const mood = entries.at(-1);
  const crewName =
    mission.crew.find((crew) => crew.id === crewId)?.display_name ?? crewId;
  return (
    <div className="mood-control">
      <button
        className="mood-trigger"
        aria-haspopup="dialog"
        aria-label={`Mood for ${crewName}: ${mood ? LABELS[mood.score] : "Not recorded"}. Update mood`}
        disabled={mission.loading || !mission.operations}
        onClick={() => setOpen(true)}
      >
        <MoodFace score={mood?.score ?? 2} unrecorded={!mood} />
        <span>{mood ? LABELS[mood.score] : "Not recorded"}</span>
      </button>
      {open && (
        <MoodDialog
          key={crewId}
          crewId={crewId}
          crewName={crewName}
          score={mood?.score ?? 2}
          onClose={() => setOpen(false)}
          onSaved={(entry) => {
            setSaved(entry);
            setOpen(false);
            void mission.refresh();
          }}
        />
      )}
    </div>
  );
}

function MoodDialog({
  crewId,
  crewName,
  score,
  onClose,
  onSaved,
}: {
  crewId: string;
  crewName: string;
  score: number;
  onClose: () => void;
  onSaved: (entry: MoodEntry) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(score);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    slider.current?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="mood-dialog"
      aria-labelledby="mood-title"
      aria-describedby="mood-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          setSaving(true);
          setError("");
          try {
            const entry = await post<MoodEntry>("moods", {
              astronaut_id: crewId,
              score: draft,
            });
            onSaved(entry);
          } catch (cause) {
            setError(
              `Could not save your mood: ${cause instanceof Error ? cause.message : String(cause)}. Please try again.`,
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <p className="eyebrow">{crewName} · Daily check-in</p>
        <h2 id="mood-title">How are you feeling today?</h2>
        <p id="mood-description">
          Move the slider to choose your mood, then submit.
        </p>
        <div className="mood-preview">
          <MoodFace score={draft} />
          <output htmlFor="mood-slider">{LABELS[draft]}</output>
        </div>
        <label className="mood-slider-label" htmlFor="mood-slider">
          Mood
        </label>
        <input
          ref={slider}
          id="mood-slider"
          type="range"
          min="1"
          max="3"
          step="1"
          value={draft}
          aria-valuetext={`${LABELS[draft]} (${draft})`}
          disabled={saving}
          onChange={(event) => setDraft(Number(event.target.value))}
        />
        <div className="mood-scale" aria-hidden="true">
          <span>Unhappy (1)</span>
          <span>Neutral (2)</span>
          <span>Happy (3)</span>
        </div>
        {error && (
          <p className="error-inline" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Submit mood"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
