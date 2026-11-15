import type { AlertAudioControls } from "../useAlertAudio";
import { Icon } from "./Icon";

export function AlertAudioControl({ audio }: { audio: AlertAudioControls }) {
  const audible = audio.enabled && audio.ready;
  const label = !audio.available
    ? "Alert audio unavailable"
    : audible
      ? "Mute alert sounds"
      : "Enable alert sounds";
  return (
    <button
      type="button"
      className="alert-audio-control"
      data-alert-audio-control
      disabled={!audio.available}
      onClick={audio.toggle}
      aria-pressed={audible}
      title={label}
    >
      <Icon name={audible ? "volume" : "muted"} />
      {label}
    </button>
  );
}
