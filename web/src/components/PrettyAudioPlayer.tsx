import H5AudioPlayer, { RHAP_UI } from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css";
import "../styles/audio-player.css";

type PrettyAudioPlayerProps = {
  src: string;
  label?: string;
  durationHint?: number;
  compact?: boolean;
  className?: string;
};

export function PrettyAudioPlayer({ src, label, durationHint, compact = false, className = "" }: PrettyAudioPlayerProps) {
  const durationFallback = durationHint && durationHint > 0 ? formatDuration(durationHint) : "0:00";

  return (
    <div className={`pretty-audio-player ${compact ? "pretty-audio-player--compact" : ""} ${className}`}>
      {label && <div className="pretty-audio-player__label">{label}</div>}
      <H5AudioPlayer
        src={src}
        preload="metadata"
        autoPlayAfterSrcChange={false}
        showJumpControls={false}
        showSkipControls={false}
        showDownloadProgress={false}
        showFilledProgress
        showFilledVolume
        timeFormat="mm:ss"
        layout={compact ? "horizontal-reverse" : "stacked"}
        defaultCurrentTime="0:00"
        defaultDuration={durationFallback}
        customProgressBarSection={[RHAP_UI.CURRENT_TIME, RHAP_UI.PROGRESS_BAR, RHAP_UI.DURATION]}
        customControlsSection={compact ? [RHAP_UI.MAIN_CONTROLS] : [RHAP_UI.MAIN_CONTROLS, RHAP_UI.VOLUME_CONTROLS]}
        customAdditionalControls={[]}
        customVolumeControls={compact ? [] : [RHAP_UI.VOLUME]}
        i18nAriaLabels={{
          player: label ? `Аудио: ${label}` : "Аудиоплеер",
          progressControl: "Позиция аудио",
          volumeControl: "Громкость",
          play: "Слушать",
          pause: "Пауза",
          volume: "Звук",
          volumeMute: "Выключить звук",
        }}
      />
    </div>
  );
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value)) return "0:00";
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
