import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ImagePlus, Megaphone, Plus, Save, Trash2 } from "lucide-react";
import {
  apiClient,
  type CircleAdvertiser,
  type CircleAdvertiserInput,
  type CircleAdvertiserState,
} from "../lib/api";

const EMPTY_FORM: CircleAdvertiserInput = {
  name: "",
  transparent: true,
  chromaColor: "#00ff00",
  similarity: 0.18,
  blend: 0.08,
  fullFrameMode: "auto",
  startSeconds: 0,
  repeatEverySeconds: 0,
  activate: true,
};

function formFromAdvertiser(item: CircleAdvertiser): CircleAdvertiserInput {
  return {
    id: item.id,
    name: item.name,
    transparent: item.transparent !== false,
    chromaColor: item.chromaColor || "#00ff00",
    similarity: item.similarity ?? 0.18,
    blend: item.blend ?? 0.08,
    fullFrameMode: item.fullFrame === false ? "banner" : "canvas",
    startSeconds: item.startSeconds ?? 0,
    repeatEverySeconds: item.repeatEverySeconds ?? 0,
    activate: true,
  };
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать видео."));
    reader.readAsDataURL(file);
  });
}

export default function BannerLibrary() {
  const [state, setState] = useState<CircleAdvertiserState | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<CircleAdvertiserInput>(EMPTY_FORM);
  const [videoName, setVideoName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewVersion, setPreviewVersion] = useState(Date.now());

  const selected = useMemo(
    () => state?.advertisers.find((item) => item.id === selectedId) || null,
    [selectedId, state],
  );

  const applyState = (next: CircleAdvertiserState, preferredId?: string) => {
    setState(next);
    const id = preferredId && next.advertisers.some((item) => item.id === preferredId)
      ? preferredId
      : next.activeAdvertiserId;
    const item = next.advertisers.find((advertiser) => advertiser.id === id) || next.advertisers[0];
    setSelectedId(item?.id || "");
    if (item) setForm(formFromAdvertiser(item));
    setVideoName("");
    setPreviewVersion(Date.now());
  };

  useEffect(() => {
    apiClient
      .circleAdvertisers()
      .then((next) => applyState(next))
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, []);

  const selectAdvertiser = (item: CircleAdvertiser) => {
    setSelectedId(item.id);
    setForm(formFromAdvertiser(item));
    setVideoName("");
    setError("");
    setNotice("");
  };

  const startNew = () => {
    setSelectedId("");
    setForm(EMPTY_FORM);
    setVideoName("");
    setError("");
    setNotice("Заполните поля и сохраните новый баннер.");
  };

  const update = <K extends keyof CircleAdvertiserInput>(key: K, value: CircleAdvertiserInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const chooseVideo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 80 * 1024 * 1024) throw new Error("Видео-баннер должен быть меньше 80 МБ.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["mov", "mp4", "webm", "mkv"].includes(extension)) {
        throw new Error("Поддерживаются MOV, MP4, WebM и MKV.");
      }
      const dataUrl = await fileDataUrl(file);
      setForm((current) => ({
        ...current,
        videoDataUrl: dataUrl,
        videoName: file.name,
        transparent: extension !== "mp4",
        fullFrameMode: "auto",
      }));
      setVideoName(file.name);
      setError("");
      setNotice(extension === "mp4"
        ? "MP4 выбран. Включено удаление цветного фона."
        : "Видео выбрано. Проверьте режим прозрачности перед сохранением.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      event.target.value = "";
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError("Укажите название баннера.");
      return;
    }
    if (!selected?.hasVideo && !form.videoDataUrl) {
      setError("Загрузите MOV, MP4, WebM или MKV.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await apiClient.saveCircleAdvertiser({
        ...form,
        id: selected?.legacy ? undefined : form.id,
      });
      applyState(result, result.advertiser.id);
      setNotice(`Баннер «${result.advertiser.name}» сохранён и выбран активным.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      const next = await apiClient.activateCircleAdvertiser(id, state?.bannerEnabled !== false);
      applyState(next, id);
      setNotice("Активный рекламный баннер изменён.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    if (!state?.activeAdvertiserId) return;
    setSaving(true);
    setError("");
    try {
      const next = await apiClient.activateCircleAdvertiser(state.activeAdvertiserId, !state.bannerEnabled);
      applyState(next, selectedId);
      setNotice(next.bannerEnabled ? "Баннеры включены." : "Баннеры отключены для генерации.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected || selected.legacy || !window.confirm(`Удалить баннер «${selected.name}»?`)) return;
    setSaving(true);
    setError("");
    try {
      const next = await apiClient.deleteCircleAdvertiser(selected.id);
      applyState(next);
      setNotice("Баннер удалён.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="grid min-h-72 place-items-center"><span className="loading loading-spinner loading-lg text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Megaphone size={23} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Рекламные баннеры</h1>
            <p className="text-sm text-base-content/60">Библиотека рекламодателей для роликов с Telegram-кружочками.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/editor" className="btn btn-outline btn-sm">Открыть редактор</Link>
          <button className="btn btn-primary btn-sm gap-2" onClick={startNew}>
            <Plus size={16} /> Новый баннер
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error text-sm"><AlertTriangle size={18} /><span>{error}</span></div>
      )}
      {notice && !error && (
        <div className="alert alert-success text-sm"><Check size={18} /><span>{notice}</span></div>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 bg-base-100 p-4">
        <div>
          <div className="font-bold">Показывать баннер при генерации</div>
          <div className="text-xs text-base-content/55">Настройка применяется к активному рекламодателю.</div>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={state?.bannerEnabled !== false}
          disabled={saving}
          onChange={toggleEnabled}
          aria-label="Показывать рекламный баннер"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Сохранённые баннеры</h2>
              <span className="badge badge-ghost">{state?.advertisers.length || 0}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {state?.advertisers.map((item) => {
                const active = item.id === state.activeAdvertiserId;
                const chosen = item.id === selectedId;
                return (
                  <article
                    key={item.id}
                    className={`overflow-hidden rounded-2xl border bg-base-100 transition ${
                      chosen ? "border-primary ring-2 ring-primary/15" : "border-base-300"
                    }`}
                  >
                    <button className="block w-full text-left" onClick={() => selectAdvertiser(item)}>
                      <div className="aspect-[45/13] bg-[linear-gradient(45deg,#ddd_25%,transparent_25%),linear-gradient(-45deg,#ddd_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ddd_75%),linear-gradient(-45deg,transparent_75%,#ddd_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px]">
                        <img
                          src={`/api/circle-editor/banner-preview.png?id=${encodeURIComponent(item.id)}&v=${previewVersion}`}
                          alt={`Баннер ${item.name}`}
                          className="h-full w-full object-cover object-center"
                        />
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-bold">{item.name}</div>
                            <div className="truncate text-xs text-base-content/55">{item.sourceName || "Встроенный баннер"}</div>
                            <div className="mt-1 text-[11px] text-base-content/45">
                              С {item.startSeconds ?? 0} сек.
                              {(item.repeatEverySeconds ?? 0) > 0 ? ` · повтор каждые ${item.repeatEverySeconds} сек.` : " · непрерывно"}
                            </div>
                          </div>
                          {active && <span className="badge badge-primary badge-sm">Активный</span>}
                        </div>
                      </div>
                    </button>
                    {!active && (
                      <div className="border-t border-base-300 p-2">
                        <button className="btn btn-ghost btn-sm w-full" disabled={saving} onClick={() => activate(item.id)}>
                          Сделать активным
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="card h-fit border border-base-300 bg-base-100 xl:sticky xl:top-4">
          <div className="card-body gap-4">
            <div>
              <h2 className="card-title">{selected ? "Настройки баннера" : "Новый баннер"}</h2>
              <p className="text-xs text-base-content/55">
                {selected?.legacy ? "Встроенный баннер доступен только для выбора." : "Только нужные настройки готового видео — без конструктора текста и логотипов."}
              </p>
            </div>

            <Field label="Название в библиотеке" value={form.name} disabled={selected?.legacy} onChange={(value) => update("name", value)} />

            {!selected?.legacy && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                <label className="btn btn-primary btn-outline btn-sm w-full gap-2">
                  <ImagePlus size={16} /> {videoName || (selected?.hasVideo ? "Заменить видео-баннер" : "Загрузить MOV / MP4 / WebM")}
                  <input type="file" accept=".mov,.mp4,.webm,.mkv,video/quicktime,video/mp4,video/webm" className="hidden" onChange={chooseVideo} />
                </label>
                <div className="mt-2 text-center text-[11px] text-base-content/55">
                  До 80 МБ. MOV/WebM — с альфа-каналом; для MP4 можно удалить цветной фон.
                </div>
              </div>
            )}

            {!selected?.legacy && (selected?.hasVideo || !!form.videoDataUrl) && (
              <div className="space-y-3 rounded-xl border border-base-300 p-3">
                <div className="font-semibold">Как убрать фон</div>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    className="radio radio-primary radio-sm mt-0.5"
                    checked={form.transparent !== false}
                    onChange={() => update("transparent", true)}
                  />
                  <span><b className="block text-sm">Фон уже прозрачный</b><span className="text-xs text-base-content/55">Для MOV ProRes 4444 или WebM VP9 с альфа-каналом.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    className="radio radio-primary radio-sm mt-0.5"
                    checked={form.transparent === false}
                    onChange={() => update("transparent", false)}
                  />
                  <span><b className="block text-sm">Удалить зелёный/цветной фон</b><span className="text-xs text-base-content/55">Выбери этот пункт для MP4 с зелёным экраном.</span></span>
                </label>
                {form.transparent === false && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ColorField label="Удаляемый цвет" value={form.chromaColor || "#00ff00"} onChange={(value) => update("chromaColor", value)} />
                    <label className="form-control gap-1">
                      <span className="text-xs font-semibold text-base-content/60">Формат файла</span>
                      <select
                        className="select select-bordered select-sm"
                        value={form.fullFrameMode || "auto"}
                        onChange={(event) => update("fullFrameMode", event.target.value as CircleAdvertiserInput["fullFrameMode"])}
                      >
                        <option value="auto">Определить автоматически</option>
                        <option value="canvas">Полный кадр 1080×1920</option>
                        <option value="banner">Только область баннера</option>
                      </select>
                    </label>
                    <RangeField label="Допуск цвета" value={form.similarity ?? 0.18} min={0.01} max={0.6} step={0.01} onChange={(value) => update("similarity", value)} />
                    <RangeField label="Смягчение края" value={form.blend ?? 0.08} min={0} max={0.5} step={0.01} onChange={(value) => update("blend", value)} />
                  </div>
                )}
              </div>
            )}

            {!selected?.legacy && (selected?.hasVideo || !!form.videoDataUrl) && (
              <div className="space-y-3 rounded-xl border border-base-300 p-3">
                <div>
                  <div className="font-semibold">Когда показывать</div>
                  <div className="text-xs text-base-content/50">Отсчёт идёт от начала итогового ролика.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Первый показ с, сек."
                    value={form.startSeconds ?? 0}
                    min={0}
                    max={180}
                    onChange={(value) => update("startSeconds", value)}
                  />
                  <NumberField
                    label="Повторять каждые, сек."
                    value={form.repeatEverySeconds ?? 0}
                    min={0}
                    max={180}
                    onChange={(value) => update("repeatEverySeconds", value)}
                    hint="0 — крутить непрерывно"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!selected?.legacy && (
                <button className="btn btn-primary flex-1 gap-2" disabled={saving} onClick={save}>
                  {saving ? <span className="loading loading-spinner loading-sm" /> : <Save size={17} />}
                  Сохранить
                </button>
              )}
              {selected && !selected.legacy && (
                <button className="btn btn-error btn-outline gap-2" disabled={saving} onClick={remove}>
                  <Trash2 size={17} /> Удалить
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  wide,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={`form-control gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-base-content/60">{label}</span>
      <input
        className="input input-bordered w-full"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="form-control gap-1">
      <span className="text-xs font-semibold text-base-content/60">{label}</span>
      <input
        type="number"
        className="input input-bordered w-full"
        value={value}
        min={min}
        max={max}
        step={0.5}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || 0)))}
      />
      {hint && <span className="text-[11px] text-base-content/45">{hint}</span>}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="form-control gap-1">
      <span className="text-xs font-semibold text-base-content/60">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-base-300 px-2">
        <input
          type="color"
          className="h-10 w-10 cursor-pointer border-0 bg-transparent"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="font-mono text-xs uppercase">{value}</span>
      </div>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="form-control gap-1">
      <span className="flex justify-between text-xs font-semibold text-base-content/60"><span>{label}</span><span>{value.toFixed(2)}</span></span>
      <input
        type="range"
        className="range range-primary range-xs"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
