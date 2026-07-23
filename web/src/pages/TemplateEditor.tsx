import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useT } from "../lib/i18n";

// Экспериментальный конструктор карточек живёт статикой в web/public/template-editor/
// (vanilla JS, без зависимостей) и показывается здесь через <iframe>. Так фича полностью
// изолирована от основного пайплайна и React-приложения. Серверу правки не нужны:
// статику отдаёт Vite (dev) и @fastify/static с prefix "/" (prod).
const EDITOR_URL = "/template-editor/index.html";
const EDITOR_VERSION = "20260630-minimal";
const CIRCLE_EDITOR_URL = "/circle-editor/index.html";
const CIRCLE_EDITOR_VERSION = "20260723-4";

export default function TemplateEditor() {
  const { t, lang } = useT();
  const [tab, setTab] = useState<"templates" | "circles">("templates");
  const editorSrc = `${EDITOR_URL}?lang=${lang}&v=${EDITOR_VERSION}`;
  const circleSrc = `${CIRCLE_EDITOR_URL}?lang=${lang}&v=${CIRCLE_EDITOR_VERSION}`;
  const activeSrc = tab === "templates" ? editorSrc : circleSrc;

  return (
    <div className="editor-page space-y-4">
      <div className="editor-simple-header">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("editor.title")}</h1>
          <div className="mt-3 flex gap-2" role="tablist" aria-label="Режим редактора">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "templates"}
              className={`btn btn-sm ${tab === "templates" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab("templates")}
            >
              Шаблоны
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "circles"}
              className={`btn btn-sm ${tab === "circles" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab("circles")}
            >
              Кружочки
            </button>
          </div>
        </div>
        <a
          href={activeSrc}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline btn-sm gap-2 lg:self-start"
        >
          <ExternalLink size={16} />
          {t("editor.openFullscreen")}
        </a>
      </div>

      <div
        className="editor-frame-shell"
        style={{ height: "calc(100vh - 10rem)", minHeight: 640 }}
      >
        <iframe
          key={tab}
          src={activeSrc}
          title={tab === "templates" ? t("editor.title") : "Редактор кружочков"}
          className="block h-full w-full"
        />
      </div>
    </div>
  );
}
