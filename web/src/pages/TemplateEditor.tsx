import { ExternalLink, Info } from "lucide-react";
import { useT } from "../lib/i18n";

// Экспериментальный конструктор карточек живёт статикой в web/public/template-editor/
// (vanilla JS, без зависимостей) и показывается здесь через <iframe>. Так фича полностью
// изолирована от основного пайплайна и React-приложения. Серверу правки не нужны:
// статику отдаёт Vite (dev) и @fastify/static с prefix "/" (prod).
const EDITOR_URL = "/template-editor/index.html";

export default function TemplateEditor() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <a
          href={EDITOR_URL}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm gap-2"
        >
          <ExternalLink size={16} />
          {t("editor.openFullscreen")}
        </a>
      </div>

      <div className="alert alert-info text-sm">
        <Info size={18} className="shrink-0" />
        <span>
          {t("editor.infoIntro")} <b>{t("editor.infoNoEffect")}</b> {t("editor.infoStorage")}{" "}
          <b>fitMin…fitMax</b>
          {t("editor.infoLimit")}
        </span>
      </div>

      <div
        className="overflow-hidden rounded-box border border-base-300 bg-base-100"
        style={{ height: "calc(100vh - 12rem)", minHeight: 560 }}
      >
        <iframe src={EDITOR_URL} title={t("editor.title")} className="block h-full w-full" />
      </div>
    </div>
  );
}
