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
  brand: "",
  headline: "",
  subline: "",
  cta: "",
  accentColor: "#ff2f78",
  backgroundColor: "#21151f",
  textColor: "#ffffff",
  activate: true,
};

function formFromAdvertiser(item: CircleAdvertiser): CircleAdvertiserInput {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    headline: item.headline,
    subline: item.subline,
    cta: item.cta,
    accentColor: item.accentColor,
    backgroundColor: item.backgroundColor,
    textColor: item.textColor,
    activate: true,
  };
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать логотип."));
    reader.readAsDataURL(file);
  });
}

export default function BannerLibrary() {
  const [state, setState] = useState<CircleAdvertiserState | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<CircleAdvertiserInput>(EMPTY_FORM);
  const [logoName, setLogoName] = useState("");
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
    setLogoName("");
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
    setLogoName("");
    setError("");
    setNotice("");
  };

  const startNew = () => {
    setSelectedId("");
    setForm(EMPTY_FORM);
    setLogoName("");
    setError("");
    setNotice("Заполните поля и сохраните новый баннер.");
  };

  const update = (key: keyof CircleAdvertiserInput, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const chooseLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      update("logoDataUrl", await fileDataUrl(file));
      update("removeLogo", false);
      setLogoName(file.name);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      event.target.value = "";
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.brand.trim() || !form.headline.trim()) {
      setError("Заполните название, бренд и заголовок.");
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
                      <div className="aspect-[1080/390] bg-neutral/10">
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
                            <div className="truncate text-xs text-base-content/55">{item.brand} · {item.headline}</div>
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
                {selected?.legacy ? "Встроенный анимированный баннер доступен только для выбора." : "После сохранения PNG создаётся без потери размера кадра."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название в библиотеке" wide value={form.name} disabled={selected?.legacy} onChange={(value) => update("name", value)} />
              <Field label="Бренд" value={form.brand} disabled={selected?.legacy} onChange={(value) => update("brand", value)} />
              <Field label="Кнопка" value={form.cta} disabled={selected?.legacy} onChange={(value) => update("cta", value)} />
              <Field label="Заголовок" wide value={form.headline} disabled={selected?.legacy} onChange={(value) => update("headline", value)} />
              <Field label="Описание" wide value={form.subline} disabled={selected?.legacy} onChange={(value) => update("subline", value)} />
              <ColorField label="Акцент" value={form.accentColor} disabled={selected?.legacy} onChange={(value) => update("accentColor", value)} />
              <ColorField label="Фон" value={form.backgroundColor} disabled={selected?.legacy} onChange={(value) => update("backgroundColor", value)} />
              <ColorField label="Текст" value={form.textColor} disabled={selected?.legacy} onChange={(value) => update("textColor", value)} />
            </div>

            {!selected?.legacy && (
              <div className="rounded-xl border border-dashed border-base-300 p-3">
                <label className="btn btn-ghost btn-sm w-full gap-2">
                  <ImagePlus size={16} /> {logoName || (selected?.hasLogo ? "Заменить логотип" : "Добавить логотип")}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={chooseLogo} />
                </label>
                {selected?.hasLogo && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-base-content/60">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={form.removeLogo === true}
                      onChange={(event) => update("removeLogo", event.target.checked)}
                    />
                    Удалить текущий логотип
                  </label>
                )}
                <div className="mt-2 text-center text-[11px] text-base-content/45">PNG, JPEG или WebP до 2,5 МБ</div>
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
