import { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "../../components/AppIcon";
import type { GeminiTtsCharacter, GeminiTtsPreviewResult } from "../../lib/api";

type AvatarDirectorProps = {
  transcript: string;
  generatedAudio: GeminiTtsPreviewResult | null;
  characters: GeminiTtsCharacter[];
};

type AudioSource = {
  id: string;
  label: string;
  src: string;
  durationSec: number;
};

type AvatarCommand =
  | "neutral"
  | "smile"
  | "laugh"
  | "surprised"
  | "angry"
  | "sad"
  | "sarcastic"
  | "whisper"
  | "look_left"
  | "look_right"
  | "nod"
  | "blink";

type TimelineCue = {
  at: number;
  command: AvatarCommand;
  duration: number;
  source: "tag" | "manual";
};

type AvatarFrame = {
  time: number;
  mouth: number;
  blink: number;
  smile: number;
  surprise: number;
  anger: number;
  sad: number;
  laugh: number;
  whisper: number;
  gazeX: number;
  gazeY: number;
  headTilt: number;
  headBob: number;
};

const MANUAL_TIMELINE = `0.0 look_left
0.5 smile
1.4 nod
2.2 look_right
3.1 laugh
4.0 blink`;

const COMMANDS: { command: AvatarCommand; label: string }[] = [
  { command: "smile", label: "улыбка" },
  { command: "laugh", label: "смех" },
  { command: "surprised", label: "удивление" },
  { command: "sarcastic", label: "сарказм" },
  { command: "angry", label: "злость" },
  { command: "sad", label: "грусть" },
  { command: "whisper", label: "шёпот" },
  { command: "look_left", label: "влево" },
  { command: "look_right", label: "вправо" },
  { command: "nod", label: "кивок" },
  { command: "blink", label: "моргнуть" },
];

const TAG_TO_COMMAND: Record<string, AvatarCommand> = {
  "[laughs]": "laugh",
  "[whispers]": "whisper",
  "[sighs]": "sad",
  "[sarcastic]": "sarcastic",
  "[excited]": "smile",
  "[short pause]": "blink",
  "[very fast]": "nod",
  "[very slow]": "neutral",
};

export function AvatarDirector({ transcript, generatedAudio, characters }: AvatarDirectorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const sourceConnectedRef = useRef(false);
  const timelineRef = useRef<TimelineCue[]>([]);
  const durationRef = useRef(8);
  const selectedSourceRef = useRef<AudioSource | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(8);
  const [currentTime, setCurrentTime] = useState(0);
  const [manualTimeline, setManualTimeline] = useState(MANUAL_TIMELINE);
  const [instantCommand, setInstantCommand] = useState<TimelineCue | null>(null);

  const sources = useMemo<AudioSource[]>(() => {
    const result: AudioSource[] = [];
    if (generatedAudio) {
      result.push({
        id: "generated",
        label: `Последняя генерация · ${generatedAudio.voice}`,
        src: generatedAudio.audioDataUrl,
        durationSec: generatedAudio.durationSec,
      });
    }
    for (const character of characters) {
      result.push({
        id: `character:${character.id}`,
        label: `${character.name} · ${character.voice}`,
        src: character.sampleUrl,
        durationSec: character.sampleDurationSec,
      });
    }
    return result;
  }, [characters, generatedAudio]);

  const selectedSource = useMemo(() => {
    if (!sources.length) return null;
    return sources.find((source) => source.id === selectedSourceId) ?? sources[0];
  }, [selectedSourceId, sources]);

  const cues = useMemo(() => {
    const timelineDuration = selectedSource?.durationSec || duration || estimateDuration(transcript);
    return [...buildTagTimeline(transcript, timelineDuration), ...parseManualTimeline(manualTimeline)].sort((a, b) => a.at - b.at);
  }, [duration, manualTimeline, selectedSource?.durationSec, transcript]);

  useEffect(() => {
    if (!sources.length) {
      setSelectedSourceId("");
      return;
    }
    if (!selectedSourceId || !sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(sources[0].id);
    }
  }, [selectedSourceId, sources]);

  useEffect(() => {
    timelineRef.current = instantCommand ? [...cues, instantCommand].sort((a, b) => a.at - b.at) : cues;
  }, [cues, instantCommand]);

  useEffect(() => {
    selectedSourceRef.current = selectedSource;
    const nextDuration = selectedSource?.durationSec || estimateDuration(transcript);
    durationRef.current = nextDuration;
    setDuration(nextDuration);
    setCurrentTime(0);
    setPlaying(false);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [selectedSource, transcript]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frameId = 0;
    const loop = () => {
      const audio = audioRef.current;
      const time = audio?.currentTime ?? currentTime;
      const amplitude = readAmplitude(analyserRef.current, audioDataRef.current, playing, time);
      const frame = buildFrame(time, amplitude, timelineRef.current, playing);
      drawAvatar(ctx, frame);
      frameId = window.requestAnimationFrame(loop);
    };
    loop();
    return () => window.cancelAnimationFrame(frameId);
  }, [currentTime, playing]);

  useEffect(() => {
    return () => {
      void audioContextRef.current?.close();
    };
  }, []);

  async function ensureAudioGraph() {
    if (sourceConnectedRef.current) {
      await audioContextRef.current?.resume();
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(context.destination);
    audioContextRef.current = context;
    analyserRef.current = analyser;
    audioDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    sourceConnectedRef.current = true;
    await context.resume();
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !selectedSource) return;
    if (playing) {
      audio.pause();
      return;
    }
    await ensureAudioGraph();
    await audio.play().catch(() => setPlaying(false));
  }

  function resetPlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setCurrentTime(0);
  }

  function trigger(command: AvatarCommand) {
    const at = audioRef.current?.currentTime ?? currentTime;
    setInstantCommand({ at, command, duration: command === "blink" ? 0.35 : 1.2, source: "manual" });
    window.setTimeout(() => setInstantCommand(null), 1300);
  }

  function appendCommand(command: AvatarCommand) {
    const at = audioRef.current?.currentTime ?? currentTime;
    setManualTimeline((prev) => `${prev.trim()}\n${at.toFixed(1)} ${command}`.trim());
  }

  const safeDuration = Math.max(0.01, duration);
  const progress = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold">Вика · движок v0</span>
            <span className="badge badge-ghost badge-sm">локально</span>
            <span className="badge badge-ghost badge-sm">{Math.round(progress)}%</span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm gap-2" disabled={!selectedSource} onClick={() => void togglePlayback()}>
              <AppIcon name={playing ? "pause" : "play"} size={15} />
              {playing ? "Пауза" : "Слушать"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm border border-base-300 gap-2" onClick={resetPlayback}>
              <AppIcon name="refresh" size={15} />
              Сброс
            </button>
          </div>
        </div>

        <div className="mx-auto aspect-[9/16] max-h-[74vh] w-full max-w-[430px] overflow-hidden rounded-md bg-neutral shadow-inner">
          <canvas ref={canvasRef} width={720} height={1280} className="h-full w-full" aria-label="Превью аватара" />
        </div>

        <audio
          ref={audioRef}
          preload="metadata"
          crossOrigin="anonymous"
          src={selectedSource?.src}
          onLoadedMetadata={(event) => {
            const next = event.currentTarget.duration;
            if (Number.isFinite(next) && next > 0) {
              durationRef.current = next;
              setDuration(next);
            }
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrentTime(0);
          }}
        />
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Panel title="Источник аудио" icon="music">
          <select className="select select-bordered w-full" value={selectedSource?.id ?? ""} onChange={(event) => setSelectedSourceId(event.target.value)}>
            {sources.length ? (
              sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))
            ) : (
              <option value="">Сначала сгенерируй аудио</option>
            )}
          </select>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Info label="Длительность" value={formatDuration(duration)} />
            <Info label="Команд" value={String(cues.length)} />
          </div>
        </Panel>

        <Panel title="Живые команды" icon="skin">
          <div className="grid grid-cols-2 gap-2">
            {COMMANDS.map((item) => (
              <button key={item.command} type="button" className="btn btn-sm btn-ghost border border-base-300" onClick={() => trigger(item.command)}>
                {item.label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Таймлайн" icon="cards">
          <textarea
            className="textarea textarea-bordered min-h-40 w-full font-mono text-xs leading-relaxed"
            value={manualTimeline}
            onChange={(event) => setManualTimeline(event.target.value)}
            spellCheck={false}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {["smile", "laugh", "surprised", "look_left", "look_right", "nod"].map((command) => {
              const item = COMMANDS.find((option) => option.command === command);
              return (
                <button key={command} type="button" className="btn btn-xs btn-ghost border border-base-300" onClick={() => appendCommand(command as AvatarCommand)}>
                  + {item?.label ?? command}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Авто из TTS-тегов" icon="info">
          <div className="grid gap-2 text-xs">
            {Object.entries(TAG_TO_COMMAND).map(([tag, command]) => (
              <div key={tag} className="flex items-center justify-between gap-3 rounded-md bg-base-200 px-3 py-2">
                <code>{tag}</code>
                <span className="font-semibold text-base-content/60">{command}</span>
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </section>
  );
}

function parseManualTimeline(value: string): TimelineCue[] {
  const rows: Array<TimelineCue | null> = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [atRaw, commandRaw] = line.split(/\s+/, 2);
      const at = Number(atRaw.replace(",", "."));
      const command = normalizeCommand(commandRaw);
      if (!Number.isFinite(at) || !command) return null;
      return { at: Math.max(0, at), command, duration: command === "blink" ? 0.35 : 1.35, source: "manual" as const };
    });
  return rows.filter((cue): cue is TimelineCue => cue !== null);
}

function buildTagTimeline(text: string, duration: number): TimelineCue[] {
  const tags = Object.keys(TAG_TO_COMMAND);
  const regex = new RegExp(tags.map(escapeRegExp).join("|"), "g");
  const cleanLength = Math.max(1, text.replace(/\[[^\]]+\]/g, "").length);
  const cues: TimelineCue[] = [];
  for (const match of text.matchAll(regex)) {
    const before = text.slice(0, match.index).replace(/\[[^\]]+\]/g, "");
    const at = Math.min(duration, Math.max(0, (before.length / cleanLength) * duration));
    const command = TAG_TO_COMMAND[match[0]];
    cues.push({ at, command, duration: command === "blink" ? 0.35 : 1.25, source: "tag" });
  }
  return cues;
}

function normalizeCommand(value: string | undefined): AvatarCommand | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return COMMANDS.some((item) => item.command === normalized) || normalized === "neutral" ? (normalized as AvatarCommand) : null;
}

function estimateDuration(text: string): number {
  const clean = text.replace(/\[[^\]]+\]/g, "").trim();
  return Math.max(5, Math.min(24, clean.length / 14));
}

function readAmplitude(analyser: AnalyserNode | null, data: Uint8Array<ArrayBuffer> | null, playing: boolean, time: number): number {
  if (analyser && data && playing) {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const item of data) sum += Math.abs(item - 128) / 128;
    return Math.min(1, Math.max(0, sum / data.length) * 4.2);
  }
  return playing ? 0.18 + Math.sin(time * 14) * 0.08 : 0.02;
}

function buildFrame(time: number, amplitude: number, cues: TimelineCue[], playing: boolean): AvatarFrame {
  const frame: AvatarFrame = {
    time,
    mouth: playing ? amplitude : 0,
    blink: autoBlink(time),
    smile: 0.18,
    surprise: 0,
    anger: 0,
    sad: 0,
    laugh: 0,
    whisper: 0,
    gazeX: Math.sin(time * 0.55) * 0.08,
    gazeY: Math.sin(time * 0.4) * 0.04,
    headTilt: Math.sin(time * 0.62) * 0.03,
    headBob: Math.sin(time * 1.4) * 3,
  };

  for (const cue of cues) {
    const local = time - cue.at;
    if (local < 0 || local > cue.duration) continue;
    const strength = Math.sin((local / cue.duration) * Math.PI);
    applyCue(frame, cue.command, strength);
  }

  frame.mouth = Math.min(1, frame.mouth + frame.laugh * 0.22 + frame.surprise * 0.18);
  return frame;
}

function applyCue(frame: AvatarFrame, command: AvatarCommand, strength: number) {
  switch (command) {
    case "smile":
      frame.smile = Math.max(frame.smile, strength);
      frame.gazeY -= 0.03 * strength;
      break;
    case "laugh":
      frame.laugh = Math.max(frame.laugh, strength);
      frame.smile = Math.max(frame.smile, 0.9 * strength);
      frame.headBob += Math.sin(frame.time * 18) * 7 * strength;
      frame.headTilt += Math.sin(frame.time * 14) * 0.07 * strength;
      break;
    case "surprised":
      frame.surprise = Math.max(frame.surprise, strength);
      frame.gazeY -= 0.05 * strength;
      break;
    case "angry":
      frame.anger = Math.max(frame.anger, strength);
      frame.headTilt -= 0.05 * strength;
      break;
    case "sad":
      frame.sad = Math.max(frame.sad, strength);
      frame.gazeY += 0.06 * strength;
      break;
    case "sarcastic":
      frame.smile = Math.max(frame.smile, 0.55 * strength);
      frame.headTilt += 0.12 * strength;
      frame.gazeX += 0.18 * strength;
      break;
    case "whisper":
      frame.whisper = Math.max(frame.whisper, strength);
      frame.mouth *= 0.55;
      frame.gazeX -= 0.08 * strength;
      break;
    case "look_left":
      frame.gazeX -= 0.45 * strength;
      frame.headTilt -= 0.04 * strength;
      break;
    case "look_right":
      frame.gazeX += 0.45 * strength;
      frame.headTilt += 0.04 * strength;
      break;
    case "nod":
      frame.headBob += Math.sin(frame.time * 12) * 10 * strength;
      break;
    case "blink":
      frame.blink = Math.max(frame.blink, strength);
      break;
    case "neutral":
      break;
  }
}

function autoBlink(time: number): number {
  const phase = time % 4.6;
  if (phase < 0.12) return Math.sin((phase / 0.12) * Math.PI);
  return 0;
}

function drawAvatar(ctx: CanvasRenderingContext2D, frame: AvatarFrame) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h);

  ctx.save();
  ctx.translate(w / 2, 578 + frame.headBob);
  ctx.rotate(frame.headTilt);
  drawBody(ctx, frame);
  drawHead(ctx, frame);
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#193634");
  gradient.addColorStop(0.52, "#204844");
  gradient.addColorStop(1, "#131a22");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 10; i += 1) {
    ctx.fillRect(90 + i * 64, 0, 1, h);
  }
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}

function drawBody(ctx: CanvasRenderingContext2D, frame: AvatarFrame) {
  ctx.save();
  ctx.translate(0, 292);
  ctx.fillStyle = "#f1c7a8";
  roundedRect(ctx, -46, -86, 92, 110, 36);
  ctx.fill();
  ctx.fillStyle = "#335f78";
  roundedRect(ctx, -178, -8, 356, 330, 76);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, -82, -4, 164, 280, 42);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-72, 8);
  ctx.quadraticCurveTo(-20, 72 + frame.smile * 6, 0, 128);
  ctx.quadraticCurveTo(20, 72 + frame.smile * 6, 72, 8);
  ctx.stroke();
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, frame: AvatarFrame) {
  const gazeX = frame.gazeX * 18;
  const gazeY = frame.gazeY * 12;
  const faceY = frame.sad * 8 - frame.surprise * 8;

  ctx.save();
  ctx.translate(0, faceY);
  ctx.fillStyle = "#2b1e1d";
  ellipse(ctx, 0, -70, 178, 230);
  ctx.fill();

  ctx.fillStyle = "#f2c8aa";
  ellipse(ctx, 0, -42, 152, 196);
  ctx.fill();

  ctx.fillStyle = "#241818";
  ctx.beginPath();
  ctx.moveTo(-132, -114);
  ctx.bezierCurveTo(-76, -196, 84, -194, 130, -78);
  ctx.bezierCurveTo(90, -112, 38, -126, -20, -118);
  ctx.bezierCurveTo(-74, -110, -112, -78, -132, -114);
  ctx.fill();

  drawEar(ctx, -145, -34);
  drawEar(ctx, 145, -34);
  drawEye(ctx, -55, -50, gazeX, gazeY, frame, false);
  drawEye(ctx, 55, -50, gazeX, gazeY, frame, true);
  drawNose(ctx, frame);
  drawMouth(ctx, frame);

  ctx.fillStyle = `rgba(228, 91, 96, ${0.16 + frame.smile * 0.12 + frame.laugh * 0.18})`;
  ellipse(ctx, -82, 8, 31, 17);
  ctx.fill();
  ellipse(ctx, 82, 8, 31, 17);
  ctx.fill();
  ctx.restore();
}

function drawEar(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = "#edbb9d";
  ellipse(ctx, x, y, 24, 46);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,70,55,0.25)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y + 2, 10, -1.2, 1.2);
  ctx.stroke();
  ctx.restore();
}

function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, gazeX: number, gazeY: number, frame: AvatarFrame, right: boolean) {
  const open = Math.max(0.08, 1 - frame.blink - frame.laugh * 0.38);
  const eyeH = 26 * open + frame.surprise * 12;
  const browTilt = (right ? -1 : 1) * (frame.anger * 0.22 - frame.sad * 0.12) + frame.surprise * 0.04;

  ctx.save();
  ctx.strokeStyle = "#3a2520";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 32, y - 36 + browTilt * 80);
  ctx.lineTo(x + 30, y - 42 - browTilt * 80);
  ctx.stroke();

  ctx.fillStyle = "#fff8ef";
  ellipse(ctx, x, y, 34, eyeH);
  ctx.fill();
  ctx.fillStyle = "#263238";
  ellipse(ctx, x + gazeX, y + gazeY, 10 + frame.surprise * 3, Math.max(3, 13 * open));
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ellipse(ctx, x + gazeX + 4, y + gazeY - 4, 3.5, 3.5);
  ctx.fill();
  ctx.restore();
}

function drawNose(ctx: CanvasRenderingContext2D, frame: AvatarFrame) {
  ctx.save();
  ctx.strokeStyle = "rgba(122,72,56,0.38)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.quadraticCurveTo(12 + frame.gazeX * 5, 0, -5, 24);
  ctx.stroke();
  ctx.fillStyle = "rgba(122,72,56,0.28)";
  ellipse(ctx, 13, 25, 5, 3);
  ctx.fill();
  ellipse(ctx, -10, 25, 5, 3);
  ctx.fill();
  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, frame: AvatarFrame) {
  const mouthOpen = Math.max(0, Math.min(1, frame.mouth));
  const smile = frame.smile + frame.laugh * 0.7 - frame.sad * 0.8 - frame.anger * 0.25;
  const y = 74 + frame.sad * 8;
  const width = 56 + frame.laugh * 34 + frame.surprise * 18 - frame.whisper * 18;
  const height = 12 + mouthOpen * 58 + frame.laugh * 28 + frame.surprise * 34;

  ctx.save();
  if (mouthOpen > 0.12 || frame.surprise > 0.25 || frame.laugh > 0.2) {
    ctx.fillStyle = "#4a1720";
    ellipse(ctx, 0, y + height * 0.12, Math.max(20, width), Math.max(10, height));
    ctx.fill();
    ctx.fillStyle = "rgba(255,143,151,0.82)";
    ellipse(ctx, 0, y + height * 0.36, width * 0.42, height * 0.22);
    ctx.fill();
    if (frame.laugh > 0.2) {
      ctx.fillStyle = "#fff5ec";
      roundedRect(ctx, -width * 0.42, y - 4, width * 0.84, 13, 5);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = "#6f2730";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-width * 0.5, y);
    ctx.quadraticCurveTo(0, y + 30 * smile, width * 0.5, y);
    ctx.stroke();
  }
  ctx.restore();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Panel({ title, icon, children }: { title: string; icon: Parameters<typeof AppIcon>[0]["name"]; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <AppIcon name={icon} size={18} />
        {title}
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-base-200 p-2">
      <div className="text-xs text-base-content/50">{label}</div>
      <div className="truncate font-semibold">{value}</div>
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
