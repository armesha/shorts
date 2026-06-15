import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Repeat } from "lucide-react";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

/** Custom 9:16-friendly video player: click-to-play, seek bar, time, mute, loop, fullscreen, keyboard. */
export default function VideoPlayer({
  src,
  poster,
  className = "",
  autoPlay = true,
}: {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
}) {
  const vref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(true);

  const toggle = useCallback(() => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    const onTime = () => setCur(v.currentTime);
    const onMeta = () => setDur(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  // (re)start when the source changes
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    setCur(0);
    if (autoPlay) v.play().catch(() => {});
  }, [src, autoPlay]);

  const seek = (t: number) => {
    const v = vref.current;
    if (v && isFinite(t)) v.currentTime = t;
  };
  const fullscreen = () => {
    const el = wrap.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") seek(cur + 5);
    else if (e.key === "ArrowLeft") seek(cur - 5);
    else if (e.key === "m") setMuted((m) => !m);
    else if (e.key === "f") fullscreen();
  };

  return (
    <div
      ref={wrap}
      className={`relative bg-black overflow-hidden select-none outline-none group ${className}`}
      tabIndex={0}
      onKeyDown={onKey}
    >
      <video
        ref={vref}
        src={src}
        poster={poster}
        loop={loop}
        muted={muted}
        playsInline
        className="w-full h-full object-contain cursor-pointer"
        onClick={toggle}
      />

      {/* center play/pause flash */}
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Воспроизвести"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="bg-black/55 backdrop-blur-sm rounded-full p-5 transition-transform hover:scale-110">
            <Play size={34} className="text-white translate-x-0.5" fill="currentColor" />
          </span>
        </button>
      )}

      {/* control bar */}
      <div className="absolute inset-x-0 bottom-0 px-3 pb-2 pt-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.05}
          value={Math.min(cur, dur || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Перемотка"
          className="range range-xs range-primary w-full mb-1.5"
        />
        <div className="flex items-center gap-3 text-white">
          <button type="button" onClick={toggle} aria-label={playing ? "Пауза" : "Воспроизвести"} className="hover:text-primary">
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <span className="text-xs tabular-nums opacity-90">
            {fmt(cur)} / {fmt(dur)}
          </span>
          <button type="button" onClick={() => setMuted((m) => !m)} aria-label="Звук" className="hover:text-primary">
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            type="button"
            onClick={() => setLoop((l) => !l)}
            aria-label="Повтор"
            title="Зациклить"
            className={loop ? "text-primary" : "hover:text-primary opacity-70"}
          >
            <Repeat size={17} />
          </button>
          <button
            type="button"
            onClick={fullscreen}
            aria-label="На весь экран"
            className="ml-auto hover:text-primary"
          >
            <Maximize size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
