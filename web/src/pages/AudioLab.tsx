import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppIcon } from "../components/AppIcon";
import { apiClient, ApiError, type GeminiTtsOptions, type GeminiTtsPreset, type GeminiTtsPreviewResult } from "../lib/api";

type FormState = {
  language: string;
  voice: string;
  style: string;
  pace: string;
  accent: string;
  scene: string;
  energy: number;
  text: string;
  apiKey: string;
};

const EMPTY_FORM: FormState = {
  language: "",
  voice: "Puck",
  style: "",
  pace: "",
  accent: "",
  scene: "",
  energy: 3,
  text: "",
  apiKey: "",
};

const QUICK_TAGS = ["[laughs]", "[whispers]", "[sighs]", "[sarcastic]", "[excited]", "[short pause]", "[very fast]", "[very slow]"];

export default function AudioLab() {
  const [options, setOptions] = useState<GeminiTtsOptions | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeminiTtsPreviewResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    apiClient
      .geminiTtsOptions()
      .then((data) => {
        if (!alive) return;
        setOptions(data);
        setLoading(false);
        setError(null);
        const preset = data.presets[0];
        setSelectedPresetId(preset?.id ?? "");
        setForm((prev) => applyPresetToForm(prev, preset, data.languages[0]?.code ?? "ru"));
      })
      .catch((e) => {
        if (!alive) return;
        setLoading(false);
        setError(e instanceof Error ? e.message : "Не удалось загрузить настройки Gemini TTS");
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedVoice = useMemo(
    () => options?.voices.find((voice) => voice.id === form.voice) ?? null,
    [form.voice, options?.voices],
  );

  const activePreset = useMemo(
    () => options?.presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [options?.presets, selectedPresetId],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: GeminiTtsPreset) {
    setSelectedPresetId(preset.id);
    setResult(null);
    setForm((prev) => applyPresetToForm(prev, preset, prev.language || options?.languages[0]?.code || "ru"));
  }

  function insertTag(tag: string) {
    setForm((prev) => ({ ...prev, text: `${tag} ${prev.text}`.trim() }));
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiClient.geminiTtsPreview({
        text: form.text,
        language: form.language,
        voice: form.voice,
        style: form.style,
        pace: form.pace,
        accent: form.accent,
        scene: form.scene,
        energy: form.energy,
        apiKey: form.apiKey.trim() || undefined,
      });
      setResult(response);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Gemini TTS не ответил");
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompt() {
    if (!result?.prompt) return;
    await navigator.clipboard.writeText(result.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="route-page max-w-7xl space-y-5 pb-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black tracking-normal">Gemini TTS</h1>
            <span className="badge badge-primary badge-sm">super-admin</span>
          </div>
          <p className="mt-1 text-sm text-base-content/60">Озвучка для мемов, анекдотов и тестов голосовых пресетов.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="badge badge-ghost">{options?.model ?? "gemini-3.1-flash-tts-preview"}</span>
          <span className={`badge ${options?.serverKeyConfigured ? "badge-success" : "badge-warning"}`}>
            {options?.serverKeyConfigured ? "ключ на сервере" : "ключ из поля"}
          </span>
        </div>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" />
          Загрузка
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <AppIcon name="warning" size={18} />
          <span>{error}</span>
        </div>
      )}

      {options && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Языки armen" value={options.languages.length} hint={options.languages.map((item) => item.code.toUpperCase()).join(", ")} />
            <Metric label="Голоса" value={options.voices.length} hint="Gemini voice library" />
            <Metric label="Пресеты" value={options.presets.length} hint={activePreset?.label ?? "—"} />
            <Metric label="Текст" value={form.text.length} hint="символов" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 font-semibold">
                  <AppIcon name="music" size={18} />
                  Пресет
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {options.presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`btn h-auto min-h-0 justify-start rounded-md px-3 py-2 text-left ${
                        selectedPresetId === preset.id ? "btn-primary" : "btn-ghost border border-base-300"
                      }`}
                      onClick={() => applyPreset(preset)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{preset.label}</span>
                        <span className={`block truncate text-xs ${selectedPresetId === preset.id ? "text-primary-content/75" : "text-base-content/55"}`}>
                          {preset.voice} · энергия {preset.energy}/5
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Язык">
                    <select className="select select-bordered w-full" value={form.language} onChange={(e) => update("language", e.target.value)}>
                      {options.languages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label} · {item.accountCount} канал.
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Голос">
                    <select className="select select-bordered w-full" value={form.voice} onChange={(e) => update("voice", e.target.value)}>
                      {options.voices.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.id} · {voice.tone}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Энергия">
                    <div className="flex h-12 items-center gap-3 rounded-lg border border-base-300 px-3">
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        className="range range-primary range-sm"
                        value={form.energy}
                        onChange={(e) => update("energy", Number(e.target.value))}
                      />
                      <span className="w-8 text-right text-sm font-semibold">{form.energy}/5</span>
                    </div>
                  </Field>
                  <Field label="Стиль">
                    <input className="input input-bordered w-full" value={form.style} onChange={(e) => update("style", e.target.value)} />
                  </Field>
                  <Field label="Темп">
                    <input className="input input-bordered w-full" value={form.pace} onChange={(e) => update("pace", e.target.value)} />
                  </Field>
                  <Field label="Акцент">
                    <input className="input input-bordered w-full" value={form.accent} onChange={(e) => update("accent", e.target.value)} placeholder="по умолчанию" />
                  </Field>
                </div>

                <Field label="Сцена">
                  <textarea className="textarea textarea-bordered min-h-20 w-full" value={form.scene} onChange={(e) => update("scene", e.target.value)} />
                </Field>

                <Field label="Текст">
                  <textarea
                    className="textarea textarea-bordered min-h-56 w-full text-base leading-relaxed"
                    value={form.text}
                    onChange={(e) => update("text", e.target.value)}
                    placeholder="Впиши текст озвучки"
                  />
                </Field>

                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS.map((tag) => (
                    <button key={tag} type="button" className="btn btn-xs btn-ghost border border-base-300" onClick={() => insertTag(tag)}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Генерация</div>
                    <div className="text-xs text-base-content/55">
                      {selectedVoice ? `${selectedVoice.id} · ${selectedVoice.tone}` : "голос не выбран"}
                    </div>
                  </div>
                  <button className="btn btn-primary gap-2" disabled={generating || !form.text.trim()} onClick={() => void generate()}>
                    {generating ? <span className="loading loading-spinner loading-sm" /> : <AppIcon name="music" size={16} />}
                    Сгенерировать
                  </button>
                </div>

                <Field label={options.serverKeyConfigured ? "Google AI Studio API key · пусто = серверный" : "Google AI Studio API key"}>
                  <input
                    type="password"
                    autoComplete="off"
                    className="input input-bordered w-full"
                    value={form.apiKey}
                    onChange={(e) => update("apiKey", e.target.value)}
                    placeholder="вставить ключ"
                  />
                </Field>

                {result ? (
                  <div className="space-y-3">
                    <audio className="w-full" controls src={result.audioDataUrl} />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <Info label="Длительность" value={formatDuration(result.durationSec)} />
                      <Info label="Символы" value={String(result.inputChars)} />
                      <Info label="Язык" value={result.languageLabel} />
                      <Info label="Голос" value={result.voice} />
                    </div>
                    <a href={result.audioDataUrl} download={`gemini-tts-${result.language}-${result.voice}.wav`} className="btn btn-sm btn-ghost w-full border border-base-300 gap-2">
                      <AppIcon name="external" size={15} />
                      Скачать WAV
                    </a>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/50">
                    Аудио появится здесь
                  </div>
                )}
              </div>

              {result && (
                <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="font-semibold">Prompt</div>
                    <button className="btn btn-xs btn-ghost border border-base-300 gap-1" onClick={() => void copyPrompt()}>
                      <AppIcon name={copied ? "check" : "copy"} size={13} />
                      {copied ? "Скопировано" : "Копировать"}
                    </button>
                  </div>
                  <pre className="max-h-[420px] overflow-auto rounded-lg bg-base-200 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                    {result.prompt}
                  </pre>
                </div>
              )}
            </aside>
          </section>
        </>
      )}
    </div>
  );
}

function applyPresetToForm(prev: FormState, preset: GeminiTtsPreset | undefined, language: string): FormState {
  if (!preset) return { ...prev, language };
  return {
    ...prev,
    language,
    voice: preset.voice,
    style: preset.style,
    pace: preset.pace,
    accent: preset.accent,
    scene: preset.scene,
    energy: preset.energy,
    text: preset.sampleText,
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form-control w-full">
      <div className="label">
        <span className="label-text font-medium">{label}</span>
      </div>
      {children}
    </label>
  );
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="text-sm text-base-content/55">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      <div className="mt-1 truncate text-xs text-base-content/45">{hint}</div>
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
