import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "../../components/AppIcon";
import { apiClient, type GeminiTtsCharacter, type GeminiTtsLipSyncTimeline, type GeminiTtsPreviewResult } from "../../lib/api";
import {
  COMMANDS,
  STAGE_PRESETS,
  TAG_TO_COMMAND,
  type AvatarCommand,
  type AvatarFrame,
  type SpeechViseme,
  type StagePresetId,
  type TimelineCue,
} from "./avatarEngine";
import { ThreeAvatarCanvas } from "./ThreeAvatarCanvas";

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
  language: string;
  transcript: string;
  lipSync?: GeminiTtsLipSyncTimeline | null;
  characterId?: string;
};

type AvatarModelSource = "server" | "file";
type AvatarModelFile = {
  id: string;
  name: string;
  size: number;
  url: string;
  source: AvatarModelSource;
  description: string;
  framing?: "full" | "head";
  presenter?: boolean;
};

const BUILT_IN_AVATAR_MODELS: AvatarModelFile[] = [
  {
    id: "shino",
    name: "Шино",
    size: 14_870_776,
    url: "/api/audio/avatar/model/shino.vrm?v=official-cc0-20260710",
    source: "server",
    description: "Официальная CC0-модель VRoid с длинными прямыми волосами, прядями у лица и 15 готовыми выражениями для речи и мимики.",
    framing: "head",
    presenter: true,
  },
  {
    id: "fumiriya",
    name: "Фумирия",
    size: 19_589_760,
    url: "/api/audio/avatar/model/fumiriya.vrm?v=official-cc0-20260710",
    source: "server",
    description: "Официальная мужская CC0-модель VRoid с полудлинными светлыми волосами, мягкой улыбкой и 14 готовыми выражениями для речи и мимики.",
    framing: "head",
    presenter: true,
  },
];

const DEFAULT_AVATAR_MODEL = BUILT_IN_AVATAR_MODELS[0];

const MANUAL_TIMELINE = "";

export function AvatarDirector({ transcript, generatedAudio, characters }: AvatarDirectorProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const sourceConnectedRef = useRef(false);
  const timelineRef = useRef<TimelineCue[]>([]);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(8);
  const [currentTime, setCurrentTime] = useState(0);
  const [manualTimeline, setManualTimeline] = useState(MANUAL_TIMELINE);
  const [instantCommand, setInstantCommand] = useState<TimelineCue | null>(null);
  const [stageId, setStageId] = useState<StagePresetId>("studio");
  const [modelFile, setModelFile] = useState<AvatarModelFile | null>(DEFAULT_AVATAR_MODEL);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [sourceLipSync, setSourceLipSync] = useState<Record<string, GeminiTtsLipSyncTimeline | null>>({});
  const [lipSyncLoadingSourceId, setLipSyncLoadingSourceId] = useState<string | null>(null);
  const [lipSyncErrorSourceId, setLipSyncErrorSourceId] = useState<string | null>(null);

  const stage = useMemo(() => STAGE_PRESETS.find((item) => item.id === stageId) ?? STAGE_PRESETS[0], [stageId]);

  const sources = useMemo<AudioSource[]>(() => {
    const result: AudioSource[] = [];
    if (generatedAudio) {
      result.push({
        id: "generated",
        label: `Последняя генерация · ${generatedAudio.voice}`,
        src: generatedAudio.audioDataUrl,
        durationSec: generatedAudio.durationSec,
        language: generatedAudio.language,
        transcript: generatedAudio.transcript,
        lipSync: generatedAudio.lipSync ?? null,
      });
    }
    for (const character of characters) {
      const id = `character:${character.id}`;
      result.push({
        id,
        label: `${character.name} · ${character.voice}`,
        src: character.sampleUrl,
        durationSec: character.sampleDurationSec,
        language: character.language,
        transcript: character.source.phrase || character.sampleText,
        lipSync: sourceLipSync[id],
        characterId: character.id,
      });
    }
    return result;
  }, [characters, generatedAudio, sourceLipSync]);

  const selectedSource = useMemo(() => {
    if (!sources.length) return null;
    return sources.find((source) => source.id === selectedSourceId) ?? sources[0];
  }, [selectedSourceId, sources]);

  const activeTranscript = selectedSource?.transcript || transcript;
  const activeLipSync = selectedSource?.lipSync ?? null;
  const speechSequence = useMemo(() => buildSpeechSequence(activeTranscript), [activeTranscript]);

  const cues = useMemo(() => {
    const timelineDuration = selectedSource?.durationSec || duration || estimateDuration(activeTranscript);
    return [...buildTagTimeline(activeTranscript, timelineDuration), ...parseManualTimeline(manualTimeline)].sort((a, b) => a.at - b.at);
  }, [activeTranscript, duration, manualTimeline, selectedSource?.durationSec]);

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
    const source = selectedSource;
    if (!source?.characterId || source.language !== "ru" || Object.hasOwn(sourceLipSync, source.id)) return;
    let alive = true;
    setLipSyncLoadingSourceId(source.id);
    setLipSyncErrorSourceId(null);
    apiClient
      .geminiTtsCharacterLipSync(source.characterId)
      .then((timeline) => {
        if (!alive) return;
        setSourceLipSync((current) => ({ ...current, [source.id]: timeline }));
      })
      .catch(() => {
        if (!alive) return;
        setSourceLipSync((current) => ({ ...current, [source.id]: null }));
        setLipSyncErrorSourceId(source.id);
      })
      .finally(() => {
        if (alive) setLipSyncLoadingSourceId((current) => (current === source.id ? null : current));
      });
    return () => {
      alive = false;
    };
  }, [selectedSource, sourceLipSync]);

  useEffect(() => {
    timelineRef.current = instantCommand ? [...cues, instantCommand].sort((a, b) => a.at - b.at) : cues;
  }, [cues, instantCommand]);

  useEffect(() => {
    const nextDuration = selectedSource?.durationSec || estimateDuration(activeTranscript);
    setDuration(nextDuration);
    setCurrentTime(0);
    setPlaying(false);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [activeTranscript, selectedSource]);

  useEffect(() => {
    return () => {
      void audioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (modelFile?.source === "file") URL.revokeObjectURL(modelFile.url);
    };
  }, [modelFile]);

  useEffect(() => {
    return () => {
      if (recordUrl) URL.revokeObjectURL(recordUrl);
    };
  }, [recordUrl]);

  const getCurrentFrame = useCallback((): AvatarFrame => {
    const time = audioRef.current?.currentTime ?? currentTime;
    const amplitude = readAmplitude(analyserRef.current, audioDataRef.current, playing, time);
    return buildFrame(time, amplitude, timelineRef.current, playing, speechSequence, duration, activeLipSync);
  }, [activeLipSync, currentTime, duration, playing, speechSequence]);

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

  function autoDirect() {
    const timelineDuration = selectedSource?.durationSec || duration || estimateDuration(activeTranscript);
    setManualTimeline(buildAutoDirection(activeTranscript, timelineDuration));
    setNotice("Таймлайн собран по тексту и длительности аудио");
    window.setTimeout(() => setNotice(null), 1800);
  }

  function loadModel(file: File | null) {
    if (!file) return;
    if (!/\.(vrm|glb)$/i.test(file.name)) {
      setNotice("Нужен файл .vrm или .glb");
      return;
    }
    setModelFile({ id: `file:${file.name}`, name: file.name, size: file.size, url: URL.createObjectURL(file), source: "file", description: "Локально загруженная модель для проверки." });
    setNotice(`Модель загружена: ${file.name}`);
    window.setTimeout(() => setNotice(null), 1800);
  }

  function selectBuiltInModel(model: AvatarModelFile) {
    setModelFile(model);
    setNotice(`${model.name} подключён`);
    window.setTimeout(() => setNotice(null), 1800);
  }

  const setActiveCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    activeCanvasRef.current = canvas;
  }, []);

  function downloadFrame() {
    const canvas = activeCanvasRef.current;
    if (!canvas) {
      setNotice("Нет активного canvas для кадра");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        setNotice("Не удалось собрать кадр");
        return;
      }
      downloadBlob(blob, `avatar-frame-${Date.now()}.png`);
    }, "image/png");
  }

  function exportProject() {
    const payload = {
      version: 1,
      stageId,
      modelFileName: modelFile?.name ?? null,
      modelSource: modelFile?.source ?? null,
      selectedSourceId,
      duration,
      transcript: activeTranscript,
      manualTimeline,
      cues,
      createdAt: new Date().toISOString(),
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `avatar-project-${Date.now()}.json`);
  }

  function importProject(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "{}")) as Partial<{
          stageId: StagePresetId;
          selectedSourceId: string;
          manualTimeline: string;
        }>;
        if (parsed.stageId && STAGE_PRESETS.some((item) => item.id === parsed.stageId)) setStageId(parsed.stageId);
        if (parsed.selectedSourceId) setSelectedSourceId(parsed.selectedSourceId);
        if (typeof parsed.manualTimeline === "string") setManualTimeline(parsed.manualTimeline);
        setNotice("Проект импортирован");
        window.setTimeout(() => setNotice(null), 1800);
      } catch {
        setNotice("Не удалось прочитать JSON проекта");
      }
    };
    reader.readAsText(file);
  }

  async function recordPreview() {
    const canvas = activeCanvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !selectedSource) {
      setNotice("Нужен canvas и аудио");
      return;
    }
    const CanvasCtor = canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
    const AudioCtor = audio as HTMLAudioElement & { captureStream?: () => MediaStream };
    if (!CanvasCtor.captureStream || typeof MediaRecorder === "undefined") {
      setNotice("Браузер не поддерживает запись canvas");
      return;
    }
    setRecording(true);
    setNotice(null);
    if (recordUrl) {
      URL.revokeObjectURL(recordUrl);
      setRecordUrl(null);
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      setCurrentTime(0);
      await ensureAudioGraph();
      const stream = CanvasCtor.captureStream(30);
      const audioStream = AudioCtor.captureStream?.();
      for (const track of audioStream?.getAudioTracks() ?? []) stream.addTrack(track);
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
      });
      recorder.start(250);
      await audio.play();
      await waitForAudioEnd(audio, Math.max(1, duration) + 1);
      if (recorder.state !== "inactive") recorder.stop();
      const blob = await done;
      setRecordUrl(URL.createObjectURL(blob));
      setNotice("Черновое видео записано");
      window.setTimeout(() => setNotice(null), 1800);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось записать видео");
    } finally {
      setRecording(false);
      setPlaying(false);
    }
  }

  const safeDuration = Math.max(0.01, duration);
  const progress = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));
  const lipSyncLoading = !!selectedSource && lipSyncLoadingSourceId === selectedSource.id;
  const lipSyncFailed = !!selectedSource && lipSyncErrorSourceId === selectedSource.id;
  const lipSyncLabel = activeLipSync
    ? `MFA · ${activeLipSync.cues.length} фонем`
    : lipSyncLoading
      ? "MFA · расчёт"
      : "приблизительно";

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold">{modelFile?.name ?? "Avatar"} · движок v1</span>
            <span className="badge badge-ghost badge-sm">локально</span>
            <span className="badge badge-ghost badge-sm">VRM/GLB</span>
            {modelFile?.source === "server" && <span className="badge badge-success badge-sm">встроенная</span>}
            <span className={`badge badge-sm ${activeLipSync ? "badge-success" : lipSyncLoading ? "badge-warning" : "badge-ghost"}`}>{lipSyncLabel}</span>
            <span className="badge badge-ghost badge-sm">{Math.round(progress)}%</span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm gap-2" disabled={!selectedSource || lipSyncLoading} onClick={() => void togglePlayback()}>
              {lipSyncLoading ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name={playing ? "pause" : "play"} size={15} />}
              {lipSyncLoading ? "Мимика" : playing ? "Пауза" : "Слушать"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm border border-base-300 gap-2" onClick={resetPlayback}>
              <AppIcon name="refresh" size={15} />
              Сброс
            </button>
          </div>
        </div>

        {notice && <div className="mb-3 rounded-md border border-success/35 bg-success/10 px-3 py-2 text-sm font-semibold text-success">{notice}</div>}
        {lipSyncFailed && <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">MFA недоступна, используется приблизительная мимика</div>}

        <div className="mx-auto aspect-[9/16] max-h-[74vh] w-full max-w-[430px] overflow-hidden rounded-md bg-neutral shadow-inner">
          {modelFile ? (
            <ThreeAvatarCanvas
              modelUrl={modelFile.url}
              modelName={modelFile.name}
              stage={stage}
              framing={modelFile.framing ?? "full"}
              presenterMode={modelFile.presenter ?? false}
              getFrame={getCurrentFrame}
              onCanvasReady={setActiveCanvas}
            />
          ) : null}
        </div>

        <audio
          ref={audioRef}
          preload="metadata"
          crossOrigin="anonymous"
          src={selectedSource?.src}
          onLoadedMetadata={(event) => {
            const next = event.currentTarget.duration;
            if (Number.isFinite(next) && next > 0) {
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
        <Panel title="Модель" icon="video">
          <div className="grid gap-2">
            <div className="grid gap-2">
              {BUILT_IN_AVATAR_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={`btn btn-sm justify-start gap-2 ${modelFile?.id === model.id ? "btn-primary" : "btn-ghost border border-base-300"}`}
                  onClick={() => selectBuiltInModel(model)}
                  title={model.description}
                >
                  <AppIcon name="skin" size={15} />
                  {model.name}
                </button>
              ))}
            </div>
            <label className="form-control">
              <span className="label-text mb-1 font-medium">Проверить другую модель</span>
              <input type="file" accept=".vrm,.glb,model/gltf-binary" className="file-input file-input-bordered file-input-sm w-full" onChange={(event) => loadModel(event.target.files?.[0] ?? null)} />
            </label>
            <div className="rounded-md bg-base-200 px-3 py-2 text-xs leading-relaxed text-base-content/60">
              Встроенная модель грузится через защищённый админский API. Загрузка файла нужна только для проверки другой модели.
            </div>
            {modelFile && (
              <div className="grid gap-2">
                <Info label="Модель" value={`${modelFile.name} · ${formatBytes(modelFile.size)}`} />
                <Info label="Источник" value={modelFile.source === "server" ? "админский API" : "локальный файл"} />
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Сцена" icon="skin">
          <div className="grid grid-cols-2 gap-2">
            {STAGE_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`btn btn-sm justify-start gap-2 ${stageId === item.id ? "btn-primary" : "btn-ghost border border-base-300"}`}
                onClick={() => setStageId(item.id)}
              >
                <span className="inline-block h-3 w-3 rounded-full border border-base-300" style={{ background: item.middle }} />
                {item.label}
              </button>
            ))}
          </div>
        </Panel>

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
            <Info label="Губы" value={lipSyncLabel} />
            <Info label="Фонемы" value={activeLipSync ? String(activeLipSync.cues.length) : "—"} />
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
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-xs btn-primary gap-1" onClick={autoDirect}>
              <AppIcon name="refresh" size={13} />
              Авто-режиссура
            </button>
            <button type="button" className="btn btn-xs btn-ghost border border-base-300" onClick={() => setManualTimeline(MANUAL_TIMELINE)}>
              Сбросить
            </button>
          </div>
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

        <Panel title="Экспорт" icon="external">
          <div className="grid gap-2">
            <button type="button" className="btn btn-sm btn-ghost border border-base-300 gap-2" onClick={downloadFrame}>
              <AppIcon name="external" size={15} />
              Скачать кадр PNG
            </button>
            <button type="button" className="btn btn-sm btn-primary gap-2" disabled={recording || !selectedSource} onClick={() => void recordPreview()}>
              {recording ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="video" size={15} />}
              Записать preview WebM
            </button>
            {recordUrl && (
              <a href={recordUrl} download={`avatar-preview-${Date.now()}.webm`} className="btn btn-sm btn-ghost border border-base-300 gap-2">
                <AppIcon name="external" size={15} />
                Скачать WebM
              </a>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-xs btn-ghost border border-base-300" onClick={exportProject}>
                JSON проекта
              </button>
              <label className="btn btn-xs btn-ghost border border-base-300">
                Импорт JSON
                <input type="file" accept="application/json,.json" className="hidden" onChange={(event) => importProject(event.target.files?.[0] ?? null)} />
              </label>
            </div>
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

function buildAutoDirection(text: string, duration: number): string {
  const clean = text.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
  const base: Array<[number, AvatarCommand]> = [
    [0, "look_left"],
    [Math.min(duration * 0.12, 0.8), "smile"],
    [duration * 0.26, "nod"],
    [duration * 0.42, "look_right"],
    [duration * 0.58, "sarcastic"],
    [duration * 0.74, "look_left"],
    [Math.max(0, duration - 1.1), "blink"],
  ];
  if (/[!?]/.test(clean)) base.push([duration * 0.5, "surprised"]);
  if (/ха|смеш|лол|угар|ржу|сме/i.test(clean) || /\[laughs\]/.test(text)) base.push([Math.max(0, duration - 1.6), "laugh"]);
  if (/\.\.\.|—/.test(clean)) base.push([duration * 0.34, "whisper"]);
  return base
    .sort((a, b) => a[0] - b[0])
    .map(([at, command]) => `${Math.max(0, Math.min(duration, at)).toFixed(1)} ${command}`)
    .join("\n");
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

export function buildFrame(
  time: number,
  amplitude: number,
  cues: TimelineCue[],
  playing: boolean,
  speechSequence: SpeechViseme[],
  duration: number,
  lipSync: GeminiTtsLipSyncTimeline | null,
): AvatarFrame {
  const aligned = !!lipSync?.cues.length;
  const speechViseme = aligned
    ? buildAlignedSpeechViseme(time, amplitude, playing, lipSync)
    : buildSpeechViseme(time, amplitude, playing, speechSequence, duration);
  const viseme: AvatarFrame["viseme"] = {
    aa: speechViseme.aa,
    ih: speechViseme.I,
    ou: speechViseme.U,
    ee: speechViseme.E,
    oh: speechViseme.O,
  };
  const speechStrength = Math.max(...SPEECH_VISEMES.filter((name) => name !== "sil").map((name) => speechViseme[name]));
  const vowelStrength = Math.max(speechViseme.aa, speechViseme.E, speechViseme.I, speechViseme.O, speechViseme.U);
  const frame: AvatarFrame = {
    time,
    mouth: playing ? (aligned ? vowelStrength * 0.12 : Math.max(amplitude * 0.72, speechStrength * 0.82)) : 0,
    viseme,
    speechViseme,
    blink: autoBlink(time),
    smile: subtleSmile(time, playing),
    surprise: 0,
    anger: 0,
    sad: 0,
    laugh: 0,
    whisper: 0,
    gazeX: Math.sin(time * 0.42) * 0.018,
    gazeY: Math.sin(time * 0.34) * 0.008,
    headTilt: Math.sin(time * 0.38) * 0.008,
    headBob: 0,
  };

  for (const cue of cues) {
    const local = time - cue.at;
    if (local < 0 || local > cue.duration) continue;
    const strength = Math.sin((local / cue.duration) * Math.PI);
    applyCue(frame, cue.command, strength);
  }

  frame.mouth = Math.min(1, frame.mouth + frame.laugh * 0.22 + frame.surprise * 0.18);
  if (frame.laugh > 0.1) frame.viseme.aa = Math.max(frame.viseme.aa, frame.laugh * 0.55);
  if (frame.surprise > 0.1) frame.viseme.oh = Math.max(frame.viseme.oh, frame.surprise * 0.7);
  return frame;
}

const SPEECH_VISEMES: SpeechViseme[] = ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U"];

function buildSpeechSequence(transcript: string): SpeechViseme[] {
  const sequence: SpeechViseme[] = ["sil"];
  const add = (viseme: SpeechViseme) => {
    if (viseme === "sil" && sequence.at(-1) === "sil") return;
    sequence.push(viseme);
  };

  for (const character of transcript.toLocaleLowerCase("ru-RU")) {
    const viseme = speechVisemeForCharacter(character);
    if (viseme) add(viseme);
    else if (/\s|[.,!?;:()[\]{}\-—]/.test(character)) add("sil");
  }
  add("sil");
  return sequence.length > 2 ? sequence : ["sil", "aa", "I", "U", "E", "O", "sil"];
}

function speechVisemeForCharacter(character: string): SpeechViseme | null {
  if (/[аяa]/.test(character)) return "aa";
  if (/[еэe]/.test(character)) return "E";
  if (/[иыйiy]/.test(character)) return "I";
  if (/[оёo]/.test(character)) return "O";
  if (/[уюuw]/.test(character)) return "U";
  if (/[пбмpbm]/.test(character)) return "PP";
  if (/[фвfv]/.test(character)) return "FF";
  if (/[тдtd]/.test(character)) return "DD";
  if (/[кгхkgq]/.test(character)) return "kk";
  if (/[чжшщj]/.test(character)) return "CH";
  if (/[сзцsczx]/.test(character)) return "SS";
  if (/[нлnl]/.test(character)) return "nn";
  if (/[рr]/.test(character)) return "RR";
  if (/[h]/.test(character)) return "TH";
  return null;
}

function buildSpeechViseme(
  time: number,
  amplitude: number,
  playing: boolean,
  sequence: SpeechViseme[],
  duration: number,
): Record<SpeechViseme, number> {
  const values = emptySpeechVisemes(playing ? 0 : 0.5);
  if (!playing || !sequence.length) return values;

  const progress = Math.max(0, Math.min(0.999_999, time / Math.max(0.01, duration)));
  const position = progress * sequence.length;
  const index = Math.min(sequence.length - 1, Math.floor(position));
  const nextIndex = Math.min(sequence.length - 1, index + 1);
  const local = position - index;
  const transition = smoothstep(0.68, 1, local);
  if (amplitude < 0.018) {
    values.sil = 0.5;
    return values;
  }
  const strength = Math.max(0.08, Math.min(0.82, amplitude * 2));
  const current = sequence[index];
  const next = sequence[nextIndex];

  if (current === "sil") values.sil = 0.5 * (1 - transition);
  else values[current] = strength * (1 - transition);
  if (next === "sil") values.sil = Math.max(values.sil, 0.5 * transition);
  else values[next] = Math.max(values[next], strength * transition);
  return values;
}

export function buildAlignedSpeechViseme(
  time: number,
  amplitude: number,
  playing: boolean,
  timeline: GeminiTtsLipSyncTimeline,
): Record<SpeechViseme, number> {
  const values = emptySpeechVisemes(playing ? 0 : 0.5);
  if (!playing || !timeline.cues.length) return values;

  const index = cueIndexAtTime(timeline, time);
  const candidates = [timeline.cues[index - 1], timeline.cues[index], timeline.cues[index + 1]].filter(Boolean);
  const weighted: Array<{ viseme: SpeechViseme; weight: number }> = [];
  let weightTotal = 0;
  for (const cue of candidates) {
    const fade = Math.min(0.045, Math.max(0.012, (cue.end - cue.start) * 0.32));
    const weight = intervalEnvelope(time, cue.start, cue.end, fade);
    if (weight <= 0) continue;
    weighted.push({ viseme: cue.viseme as SpeechViseme, weight });
    weightTotal += weight;
  }
  if (weightTotal <= 0) {
    values.sil = 0.5;
    return values;
  }

  const baseStrength = Math.max(0.26, Math.min(0.78, 0.3 + amplitude * 1.15));
  for (const item of weighted) {
    if (item.viseme === "sil") {
      values.sil += 0.5 * (item.weight / weightTotal);
      continue;
    }
    const strength = Math.max(baseStrength, ALIGNED_VISEME_FLOORS[item.viseme] ?? 0);
    values[item.viseme] += strength * (item.weight / weightTotal);
  }
  return values;
}

const ALIGNED_VISEME_FLOORS: Partial<Record<SpeechViseme, number>> = {
  PP: 0.6,
  FF: 0.52,
  DD: 0.46,
  kk: 0.44,
  CH: 0.5,
  SS: 0.48,
  nn: 0.44,
  RR: 0.42,
};

function cueIndexAtTime(timeline: GeminiTtsLipSyncTimeline, time: number): number {
  let low = 0;
  let high = timeline.cues.length - 1;
  let result = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (timeline.cues[middle].start <= time) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

function intervalEnvelope(time: number, start: number, end: number, fade: number): number {
  if (time < start - fade || time > end + fade) return 0;
  if (time < start) return smoothstep(start - fade, start, time);
  if (time > end) return 1 - smoothstep(end, end + fade, time);
  return 1;
}

function emptySpeechVisemes(silence = 0): Record<SpeechViseme, number> {
  return Object.fromEntries(SPEECH_VISEMES.map((name) => [name, name === "sil" ? silence : 0])) as Record<SpeechViseme, number>;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
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

const BLINK_CYCLE_SECONDS = 23.4;
const BLINK_STARTS = [1.28, 4.86, 8.72, 13.54, 17.16, 21.05];

function autoBlink(time: number): number {
  const cycleTime = ((time % BLINK_CYCLE_SECONDS) + BLINK_CYCLE_SECONDS) % BLINK_CYCLE_SECONDS;
  for (const start of BLINK_STARTS) {
    const elapsed = cycleTime - start;
    if (elapsed < 0 || elapsed > 0.17) continue;
    if (elapsed < 0.055) return smoothstep(0, 0.055, elapsed);
    return 1 - smoothstep(0.055, 0.17, elapsed);
  }
  return 0;
}

function subtleSmile(time: number, playing: boolean): number {
  if (!playing) return 0.16;
  const warmth = (Math.sin(time * 0.72 - 0.45) + 1) * 0.5;
  return 0.28 + warmth * 0.18;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function waitForAudioEnd(audio: HTMLAudioElement, timeoutSec: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener("ended", finish);
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, Math.max(1, timeoutSec) * 1000);
    audio.addEventListener("ended", finish, { once: true });
  });
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
