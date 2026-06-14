import { Shapes, ExternalLink, Info } from "lucide-react";

// Экспериментальный конструктор карточек живёт статикой в web/public/template-editor/
// (vanilla JS, без зависимостей) и показывается здесь через <iframe>. Так фича полностью
// изолирована от основного пайплайна и React-приложения. Серверу правки не нужны:
// статику отдаёт Vite (dev) и @fastify/static с prefix "/" (prod).
const EDITOR_URL = "/template-editor/index.html";

export default function TemplateEditor() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shapes className="text-primary" size={22} />
          <h1 className="text-xl font-bold tracking-tight">Редактор шаблонов</h1>
          <span className="badge badge-warning badge-sm" title="экспериментальная функция">
            тест
          </span>
        </div>
        <a
          href={EDITOR_URL}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm gap-2"
        >
          <ExternalLink size={16} />
          Открыть на весь экран
        </a>
      </div>

      <div className="alert alert-info text-sm">
        <Info size={18} className="shrink-0" />
        <span>
          Экспериментальный Figma-подобный конструктор карточек. На основной пайплайн{" "}
          <b>не влияет</b> — это отдельный инструмент. Шаблон хранится в браузере (localStorage) и
          экспортируется в JSON. Текст в килбоксах авто-подгоняется в диапазоне{" "}
          <b>fitMin…fitMax</b>, а «Лимит, симв.» не даёт тексту переполнить блок и стать нечитаемо
          мелким: сверх лимита текст обрезается «…», а шрифт не опускается ниже fitMin.
        </span>
      </div>

      <div
        className="overflow-hidden rounded-box border border-base-300 bg-base-100"
        style={{ height: "calc(100vh - 12rem)", minHeight: 560 }}
      >
        <iframe src={EDITOR_URL} title="Редактор шаблонов" className="block h-full w-full" />
      </div>
    </div>
  );
}
