import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "../components/AppIcon";
import { AvatarDirector } from "./AudioLab/AvatarDirector";
import {
  apiClient,
  ApiError,
  type GeminiTtsCharacter,
  type GeminiTtsOptions,
  type GeminiTtsPreset,
  type GeminiTtsPreviewResult,
} from "../lib/api";

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

type Segment = {
  id: string;
  tag: string;
  text: string;
};

type TextTemplate = {
  id: string;
  group: "Реакции" | "Интро" | "Финалы" | "Сегменты" | "Спокойные";
  title: string;
  presetId: string;
  text: string;
  segments: Omit<Segment, "id">[];
};

type AudioLabTab = "studio" | "characters" | "avatar";

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

const TAG_OPTIONS = [
  { value: "", label: "обычно", title: "Без явного тега" },
  { value: "[laughs]", label: "смех", title: "Смеющаяся или улыбающаяся подача" },
  { value: "[whispers]", label: "шепот", title: "Тихая close-mic подача" },
  { value: "[sighs]", label: "вздох", title: "Усталость, ирония или разочарование" },
  { value: "[sarcastic]", label: "сарказм", title: "Сухая ироничная подача" },
  { value: "[excited]", label: "энергия", title: "Возбужденный, бодрый тон" },
  { value: "[short pause]", label: "пауза", title: "Короткая пауза перед следующей фразой" },
  { value: "[very fast]", label: "быстро", title: "Более быстрый темп для участка" },
  { value: "[very slow]", label: "медленно", title: "Более медленный темп для участка" },
] as const;

const TEXT_TEMPLATES: TextTemplate[] = [
  template("r1", "Реакции", "Неожиданный финал", "meme-punchline", [
    ["[laughs]", "Я думал, что видел всё."],
    ["[short pause]", "Но это было до этого момента."],
  ]),
  template("r2", "Реакции", "Саркастично", "sarcastic-reaction", [
    ["[sarcastic]", "Конечно, отличный план."],
    ["[sighs]", "Что вообще могло пойти не так?"],
  ]),
  template("r3", "Реакции", "Растерянно", "confused-commentator", [
    ["", "Я сначала вообще не понял, что происходит."],
    ["[short pause]", "Потом понял. И это не помогло."],
  ]),
  template("r4", "Реакции", "Чат обсуждает", "meme-gossip", [
    ["[laughs]", "Я не хотел это обсуждать."],
    ["[short pause]", "Но раз уж мы все здесь."],
  ]),
  template("r5", "Реакции", "Офисный deadpan", "dry-office", [
    ["", "Да, это точно заслуживает отдельного совещания."],
    ["[sarcastic]", "Желательно на три часа."],
  ]),
  template("i1", "Интро", "Не листай", "high-energy-hook", [
    ["[excited]", "Стой, не листай."],
    ["[very fast]", "Тут финал страннее, чем начало."],
  ]),
  template("i2", "Интро", "Тихое начало", "whisper-suspense", [
    ["[whispers]", "Смотри внимательно."],
    ["[short pause]", "Одна деталь меняет всё."],
  ]),
  template("i3", "Интро", "Короткая история", "joke-storyteller", [
    ["", "Сейчас будет короткая история."],
    ["[short pause]", "Сначала спокойно, а потом резко."],
  ]),
  template("i4", "Интро", "Факт с крючком", "friendly-explainer", [
    ["", "Сначала это выглядит случайностью."],
    ["[short pause]", "Но здесь есть маленькая логика."],
  ]),
  template("i5", "Интро", "Киношно", "cinematic-reveal", [
    ["[very slow]", "Все выглядело нормально."],
    ["[short pause]", "До последней секунды."],
  ]),
  template("f1", "Финалы", "Точка в конце", "strict-narrator", [
    ["", "Правило простое."],
    ["[short pause]", "Если звучит слишком идеально, проверь детали."],
  ]),
  template("f2", "Финалы", "Мягкий вывод", "soft-irony", [
    ["", "Именно так обычно начинается проблема."],
    ["[sighs]", "С маленькой уверенной ошибки."],
  ]),
  template("f3", "Финалы", "Ночной финал", "calm-night", [
    ["[very slow]", "Иногда весь смысл появляется только в конце."],
  ]),
  template("f4", "Финалы", "Подписочный CTA", "fast-shorts", [
    ["[excited]", "Если хочешь еще такие разборы, оставайся."],
    ["[very fast]", "Следующий будет еще страннее."],
  ]),
  template("s1", "Сегменты", "Шепот → смех", "breathy-secret", [
    ["[whispers]", "Есть одна деталь."],
    ["[short pause]", "И после нее все становится хуже."],
    ["[laughs]", "Но смешнее."],
  ]),
  template("s2", "Сегменты", "Медленно → быстро", "high-energy-hook", [
    ["[very slow]", "Сначала все спокойно."],
    ["[short pause]", "Почти слишком спокойно."],
    ["[very fast]", "А потом начинается хаос."],
  ]),
  template("s3", "Сегменты", "Вздох → сарказм", "dry-office", [
    ["[sighs]", "Я пытался найти нормальное объяснение."],
    ["[sarcastic]", "Но реальность решила иначе."],
  ]),
  template("s4", "Сегменты", "Энергия → пауза", "meme-punchline", [
    ["[excited]", "Вот этот момент надо пересмотреть."],
    ["[short pause]", "Теперь понятно, почему все смеются."],
  ]),
  template("c1", "Спокойные", "Теплый факт", "warm-explainer", [
    ["", "Иногда самая простая деталь меняет смысл всей истории."],
  ]),
  template("c2", "Спокойные", "Мягкое объяснение", "friendly-explainer", [
    ["", "Это выглядит случайно, но в этом есть понятный порядок."],
  ]),
  template("c3", "Спокойные", "Нейтральный диктор", "strict-narrator", [
    ["", "Суть в одном: сначала контекст, потом вывод."],
  ]),
  template("c4", "Спокойные", "Тихий тизер", "calm-night", [
    ["[whispers]", "Не все смешное должно звучать громко."],
    ["[short pause]", "Иногда пауза работает сильнее."],
  ]),
];

const GROUPS = ["Реакции", "Интро", "Финалы", "Сегменты", "Спокойные"] as const;

export default function AudioLab() {
  const [activeTab, setActiveTab] = useState<AudioLabTab>("studio");
  const [options, setOptions] = useState<GeminiTtsOptions | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [segments, setSegments] = useState<Segment[]>(() => segmentsFromText(""));
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [templateGroup, setTemplateGroup] = useState<(typeof GROUPS)[number]>("Реакции");
  const [characters, setCharacters] = useState<GeminiTtsCharacter[]>([]);
  const [characterNames, setCharacterNames] = useState<Record<string, string>>({});
  const [charactersLoading, setCharactersLoading] = useState(true);
  const [characterSavingId, setCharacterSavingId] = useState<string | null>(null);
  const [characterNotice, setCharacterNotice] = useState<string | null>(null);
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
        setSegments(segmentsFromText(preset?.sampleText ?? ""));
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

  useEffect(() => {
    let alive = true;
    apiClient
      .geminiTtsCharacters()
      .then((data) => {
        if (!alive) return;
        setCharacters(data.characters);
        setCharacterNames(Object.fromEntries(data.characters.map((character) => [character.id, character.name])));
        setCharactersLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setCharactersLoading(false);
        setError(e instanceof Error ? e.message : "Не удалось загрузить библиотеку персонажей");
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

  const visibleTemplates = useMemo(
    () => TEXT_TEMPLATES.filter((item) => item.group === templateGroup),
    [templateGroup],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: GeminiTtsPreset) {
    setSelectedPresetId(preset.id);
    setResult(null);
    setForm((prev) => applyPresetToForm(prev, preset, prev.language || options?.languages[0]?.code || "ru"));
    setSegments(segmentsFromText(preset.sampleText));
  }

  function applyTextTemplate(item: TextTemplate) {
    const preset = options?.presets.find((preset) => preset.id === item.presetId);
    if (preset) {
      setSelectedPresetId(preset.id);
      setForm((prev) => ({
        ...applyPresetToForm(prev, preset, prev.language || options?.languages[0]?.code || "ru"),
        text: item.text,
      }));
    } else {
      setForm((prev) => ({ ...prev, text: item.text }));
    }
    setSegments(withIds(item.segments));
    setResult(null);
  }

  function applyCharacter(character: GeminiTtsCharacter) {
    setSelectedPresetId("");
    setResult(null);
    setForm((prev) => ({
      ...prev,
      language: character.language,
      voice: character.voice,
      style: character.style,
      pace: character.pace,
      accent: character.accent,
      scene: character.scene,
      energy: character.energy,
      text: character.sampleText,
    }));
    setSegments(segmentsFromText(character.sampleText));
    setActiveTab("studio");
    setCharacterNotice(`Настройки «${character.name}» перенесены в студию`);
    window.setTimeout(() => setCharacterNotice(null), 1800);
  }

  async function saveCharacterName(character: GeminiTtsCharacter) {
    setCharacterSavingId(character.id);
    setError(null);
    try {
      const updated = await apiClient.renameGeminiTtsCharacter(character.id, characterNames[character.id] ?? character.name);
      setCharacters((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setCharacterNames((prev) => ({ ...prev, [updated.id]: updated.name }));
      setCharacterNotice(`Имя сохранено: ${updated.name}`);
      window.setTimeout(() => setCharacterNotice(null), 1800);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Не удалось сохранить имя персонажа");
    } finally {
      setCharacterSavingId(null);
    }
  }

  function insertTag(tag: string) {
    setForm((prev) => ({ ...prev, text: `${prev.text}${prev.text.trim() ? "\n" : ""}${tag} `.trimEnd() }));
  }

  function updateSegment(id: string, patch: Partial<Segment>) {
    setSegments((prev) => prev.map((segment) => (segment.id === id ? { ...segment, ...patch } : segment)));
  }

  function addSegment(tag = "", text = "") {
    setSegments((prev) => [...prev, { id: newId(), tag, text }]);
  }

  function removeSegment(id: string) {
    setSegments((prev) => (prev.length > 1 ? prev.filter((segment) => segment.id !== id) : prev));
  }

  function buildFromSegments() {
    const text = segmentsToText(segments);
    setForm((prev) => ({ ...prev, text }));
    setResult(null);
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="tabs tabs-boxed rounded-md bg-base-200 p-1">
              <button type="button" className={`tab gap-2 ${activeTab === "studio" ? "tab-active" : ""}`} onClick={() => setActiveTab("studio")}>
                <AppIcon name="studio" size={15} />
                Студия
              </button>
              <button type="button" className={`tab gap-2 ${activeTab === "characters" ? "tab-active" : ""}`} onClick={() => setActiveTab("characters")}>
                <AppIcon name="users" size={15} />
                Библиотека персонажей
              </button>
              <button type="button" className={`tab gap-2 ${activeTab === "avatar" ? "tab-active" : ""}`} onClick={() => setActiveTab("avatar")}>
                <AppIcon name="video" size={15} />
                Аватар
              </button>
            </div>
            {characterNotice && (
              <div className="badge badge-success badge-outline h-auto max-w-full justify-start whitespace-normal px-3 py-2 text-left">
                {characterNotice}
              </div>
            )}
          </div>

          {activeTab === "studio" ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Языки armen" value={options.languages.length} hint={options.languages.map((item) => item.code.toUpperCase()).join(", ")} />
                <Metric label="Голоса" value={options.voices.length} hint="Gemini voice library" />
                <Metric label="Пресеты" value={options.presets.length} hint={activePreset?.label ?? "—"} />
                <Metric label="Текст" value={form.text.length} hint="символов" />
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="space-y-4">
              <Panel title="Пресет" icon="music">
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
                          {preset.voice} · {preset.energy}/5
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Готовые тексты" icon="library">
                <div className="mb-3 flex flex-wrap gap-2">
                  {GROUPS.map((group) => (
                    <button
                      key={group}
                      type="button"
                      className={`btn btn-xs ${templateGroup === group ? "btn-primary" : "btn-ghost border border-base-300"}`}
                      onClick={() => setTemplateGroup(group)}
                    >
                      {group}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleTemplates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="rounded-md border border-base-300 bg-base-100 p-3 text-left transition-colors hover:bg-base-200"
                      onClick={() => applyTextTemplate(item)}
                    >
                      <span className="block text-sm font-semibold">{item.title}</span>
                      <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-base-content/55">{item.text}</span>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Настройки голоса" icon="settings">
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
              </Panel>

              <Panel title="Сегменты" icon="cards">
                <div className="space-y-2">
                  {segments.map((segment, index) => (
                    <div key={segment.id} className="grid gap-2 rounded-lg border border-base-300 bg-base-200/45 p-2 md:grid-cols-[150px_minmax(0,1fr)_34px]">
                      <select
                        className="select select-bordered select-sm w-full"
                        value={segment.tag}
                        onChange={(e) => updateSegment(segment.id, { tag: e.target.value })}
                        title={TAG_OPTIONS.find((tag) => tag.value === segment.tag)?.title}
                      >
                        {TAG_OPTIONS.map((tag) => (
                          <option key={tag.value || "none"} value={tag.value}>
                            {tag.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input input-bordered input-sm w-full"
                        value={segment.text}
                        onChange={(e) => updateSegment(segment.id, { text: e.target.value })}
                        placeholder={`Фраза ${index + 1}`}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-square"
                        onClick={() => removeSegment(segment.id)}
                        disabled={segments.length === 1}
                        title="Удалить сегмент"
                      >
                        <AppIcon name="trash" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TAG_OPTIONS.filter((tag) => tag.value).map((tag) => (
                    <button key={tag.value} type="button" className="btn btn-xs btn-ghost border border-base-300" title={tag.title} onClick={() => addSegment(tag.value)}>
                      {tag.value}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-sm btn-ghost border border-base-300 gap-2" onClick={() => addSegment()}>
                    <AppIcon name="plus" size={15} />
                    Сегмент
                  </button>
                  <button type="button" className="btn btn-sm btn-primary gap-2" onClick={buildFromSegments}>
                    <AppIcon name="check" size={15} />
                    Собрать текст
                  </button>
                </div>
              </Panel>

              <Panel title="Текст" icon="cards">
                <textarea
                  className="textarea textarea-bordered min-h-52 w-full text-base leading-relaxed"
                  value={form.text}
                  onChange={(e) => update("text", e.target.value)}
                  placeholder="Впиши или собери текст озвучки"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {TAG_OPTIONS.filter((tag) => tag.value).map((tag) => (
                    <button key={tag.value} type="button" className="btn btn-xs btn-ghost border border-base-300" title={tag.title} onClick={() => insertTag(tag.value)}>
                      {tag.value}
                    </button>
                  ))}
                </div>
              </Panel>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <Panel title="Генерация" icon="music">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 text-xs text-base-content/55">
                    {selectedVoice ? `${selectedVoice.id} · ${selectedVoice.tone}` : "голос не выбран"}
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
                    <AudioPreviewPlayer src={result.audioDataUrl} label={`${result.voice} · ${result.languageLabel}`} durationHint={result.durationSec} />
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
              </Panel>

              <Panel title="Теги" icon="info">
                <div className="grid gap-2">
                  {TAG_OPTIONS.filter((tag) => tag.value).map((tag) => (
                    <div key={tag.value} className="flex items-center justify-between gap-2 rounded-md bg-base-200 px-3 py-2">
                      <code className="text-xs font-semibold">{tag.value}</code>
                      <span className="text-right text-xs text-base-content/55">{tag.title}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              {result && (
                <Panel title="Prompt" icon="copy">
                  <div className="mb-2 flex justify-end">
                    <button className="btn btn-xs btn-ghost border border-base-300 gap-1" onClick={() => void copyPrompt()}>
                      <AppIcon name={copied ? "check" : "copy"} size={13} />
                      {copied ? "Скопировано" : "Копировать"}
                    </button>
                  </div>
                  <pre className="max-h-[420px] overflow-auto rounded-lg bg-base-200 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                    {result.prompt}
                  </pre>
                </Panel>
              )}
            </aside>
              </section>
            </>
          ) : activeTab === "characters" ? (
            <CharactersLibrary
              characters={characters}
              characterNames={characterNames}
              loading={charactersLoading}
              savingId={characterSavingId}
              onNameChange={(id, name) => setCharacterNames((prev) => ({ ...prev, [id]: name }))}
              onSaveName={(character) => void saveCharacterName(character)}
              onApply={applyCharacter}
            />
          ) : (
            <AvatarDirector transcript={form.text} generatedAudio={result} characters={characters} />
          )}
        </>
      )}
    </div>
  );
}

function CharactersLibrary({
  characters,
  characterNames,
  loading,
  savingId,
  onNameChange,
  onSaveName,
  onApply,
}: {
  characters: GeminiTtsCharacter[];
  characterNames: Record<string, string>;
  loading: boolean;
  savingId: string | null;
  onNameChange: (id: string, name: string) => void;
  onSaveName: (character: GeminiTtsCharacter) => void;
  onApply: (character: GeminiTtsCharacter) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-base-content/60">
        <span className="loading loading-spinner loading-sm" />
        Загрузка персонажей
      </div>
    );
  }

  if (!characters.length) {
    return (
      <div className="rounded-lg border border-dashed border-base-300 p-8 text-center text-sm text-base-content/55">
        Персонажей пока нет
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-base-300 bg-base-100 px-3 py-2 text-sm text-base-content/65">
        <span className="font-semibold text-base-content">Персонажи: {characters.length}</span>
        <span className="badge badge-ghost badge-sm">{characters[0]?.voice ?? "—"}</span>
        <span className="badge badge-ghost badge-sm">{characters[0]?.language.toUpperCase() ?? "—"}</span>
        <span className="badge badge-ghost badge-sm">{formatDuration(characters[0]?.sampleDurationSec ?? 0)}</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {characters.map((character) => {
          const draftName = characterNames[character.id] ?? character.name;
          const saving = savingId === character.id;
          const canSave = draftName.trim() && draftName.trim() !== character.name && !saving;
          return (
            <article key={character.id} className="rounded-md border border-base-300 bg-base-100 p-3 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px_120px] lg:items-end">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black tracking-normal">{character.name}</h2>
                    <span className="badge badge-primary badge-sm">{character.voice}</span>
                    <span className="badge badge-ghost badge-sm">{character.language.toUpperCase()}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="input input-bordered input-sm w-full"
                      value={draftName}
                      onChange={(e) => onNameChange(character.id, e.target.value)}
                      maxLength={60}
                      aria-label="Имя персонажа"
                    />
                    <button type="button" className="btn btn-ghost btn-sm border border-base-300 gap-1" disabled={!canSave} onClick={() => onSaveName(character)}>
                      {saving ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="check" size={14} />}
                      Сохранить
                    </button>
                  </div>
                </div>

                <AudioPreviewPlayer src={character.sampleUrl} label={`${character.voice} · ${formatDuration(character.sampleDurationSec)}`} durationHint={character.sampleDurationSec} compact />

                <button type="button" className="btn btn-primary btn-sm gap-2" onClick={() => onApply(character)}>
                  <AppIcon name="check" size={15} />
                  Применить
                </button>
              </div>

              <details className="mt-3 rounded-md bg-base-200/55 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-semibold">Настройки и источник</summary>
                <p className="mt-2 text-sm leading-relaxed text-base-content/60">{character.description}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <Info label="Модель" value={character.model} />
                  <Info label="Энергия" value={`${character.energy}/5`} />
                  <Info label="Deck" value={character.source.deck || "—"} />
                  <Info label="Card" value={character.source.cardId || "—"} />
                  <SettingBlock label="Текст" value={character.sampleText} />
                  <SettingBlock label="Стиль" value={character.style} />
                  <SettingBlock label="Темп" value={character.pace} />
                  <SettingBlock label="Акцент" value={character.accent || "natural"} />
                  <SettingBlock label="Сцена" value={character.scene} />
                  <SettingBlock label={character.postProcessing.label || "Постобработка"} value={character.postProcessing.ffmpegFilter} />
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AudioPreviewPlayer({
  src,
  label,
  durationHint,
  compact = false,
}: {
  src: string;
  label: string;
  durationHint?: number;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationHint && durationHint > 0 ? durationHint : 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setCurrentTime(0);
    setDuration(durationHint && durationHint > 0 ? durationHint : 0);
  }, [durationHint, src]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => setPlaying(false));
  }

  function seek(value: string) {
    const nextTime = Number(value);
    if (!Number.isFinite(nextTime)) return;
    const audio = audioRef.current;
    if (audio) audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function updateDuration() {
    const nextDuration = audioRef.current?.duration;
    if (nextDuration && Number.isFinite(nextDuration)) setDuration(nextDuration);
  }

  const safeDuration = duration > 0 ? duration : 0.01;
  const progress = safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  return (
    <div className={`rounded-md border border-base-300 bg-base-200/70 ${compact ? "px-2 py-1.5" : "p-3"}`}>
      <audio
        ref={audioRef}
        preload="metadata"
        src={src}
        onLoadedMetadata={updateDuration}
        onDurationChange={updateDuration}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
      <div className={`grid items-center gap-2 ${compact ? "grid-cols-[34px_minmax(0,1fr)_70px]" : "grid-cols-[42px_minmax(0,1fr)_82px]"}`}>
        <button
          type="button"
          className={`btn btn-primary btn-circle ${compact ? "btn-xs" : "btn-sm"}`}
          onClick={togglePlayback}
          title={playing ? "Пауза" : "Слушать"}
          aria-label={playing ? "Пауза" : "Слушать"}
        >
          <AppIcon name={playing ? "pause" : "play"} size={compact ? 14 : 16} />
        </button>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold text-base-content/70">{label}</span>
            {!compact && <span className="shrink-0 text-base-content/45">{Math.round(progress)}%</span>}
          </div>
          <input
            type="range"
            min={0}
            max={safeDuration}
            step={0.01}
            value={Math.min(currentTime, safeDuration)}
            onChange={(event) => seek(event.target.value)}
            className="range range-primary range-xs w-full"
            aria-label="Позиция аудио"
          />
        </div>
        <div className="text-right text-xs font-semibold tabular-nums text-base-content/60">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </div>
      </div>
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

function template(
  id: TextTemplate["id"],
  group: TextTemplate["group"],
  title: TextTemplate["title"],
  presetId: TextTemplate["presetId"],
  rows: [string, string][],
): TextTemplate {
  const segments = rows.map(([tag, text]) => ({ tag, text }));
  return { id, group, title, presetId, segments, text: segmentsToText(withIds(segments)) };
}

function withIds(rows: Omit<Segment, "id">[]): Segment[] {
  return rows.map((row) => ({ ...row, id: newId() }));
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function segmentsFromText(text: string): Segment[] {
  const trimmed = text.trim();
  if (!trimmed) return [{ id: newId(), tag: "", text: "" }];
  const tagValues = TAG_OPTIONS.map((tag) => tag.value).filter(Boolean);
  const matched = tagValues.find((tag) => trimmed.startsWith(tag));
  return [{ id: newId(), tag: matched ?? "", text: matched ? trimmed.slice(matched.length).trim() : trimmed }];
}

function segmentsToText(rows: Segment[]): string {
  return rows
    .map((row) => {
      const text = row.text.trim();
      if (!text) return "";
      return row.tag ? `${row.tag} ${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}

function Panel({ title, icon, children }: { title: string; icon: Parameters<typeof AppIcon>[0]["name"]; children: ReactNode }) {
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

function SettingBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-base-200 p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-normal text-base-content/45">{label}</div>
      <div className="break-words text-xs leading-relaxed text-base-content/75">{value}</div>
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
