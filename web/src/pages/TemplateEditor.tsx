import { ExternalLink } from "lucide-react";
import { useT } from "../lib/i18n";

// Экспериментальный конструктор карточек живёт статикой в web/public/template-editor/
// (vanilla JS, без зависимостей) и показывается здесь через <iframe>. Так фича полностью
// изолирована от основного пайплайна и React-приложения. Серверу правки не нужны:
// статику отдаёт Vite (dev) и @fastify/static с prefix "/" (prod).
const EDITOR_URL = "/template-editor/index.html";
const EDITOR_VERSION = "20260630-minimal";

export default function TemplateEditor() {
  const { t, lang } = useT();
  const editorSrc = `${EDITOR_URL}?lang=${lang}&v=${EDITOR_VERSION}`;

  return (
    <div className="editor-page space-y-4">
      <div className="editor-simple-header">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("editor.title")}</h1>
        </div>
        <a
          href={editorSrc}
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
        <iframe src={editorSrc} title={t("editor.title")} className="block h-full w-full" />
      </div>
    </div>
  );
}
