import { ExternalLink, Megaphone, Video } from "lucide-react";
import { Link } from "react-router-dom";

const CIRCLE_EDITOR_URL = "/circle-editor/index.html";
const CIRCLE_EDITOR_VERSION = "20260724-2";

export default function CircleEditor() {
  const editorSrc = `${CIRCLE_EDITOR_URL}?v=${CIRCLE_EDITOR_VERSION}`;

  return (
    <div className="editor-page space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Video size={23} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Telegram-кружочки</h1>
            <p className="text-sm text-base-content/60">
              Шаблоны, собственные кружки, фон, баннеры и генерация готового видео.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/banners" className="btn btn-outline btn-sm gap-2">
            <Megaphone size={16} />
            Баннеры
          </Link>
          <a href={editorSrc} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm gap-2">
            <ExternalLink size={16} />
            На весь экран
          </a>
        </div>
      </header>

      <div className="editor-frame-shell" style={{ height: "calc(100vh - 11rem)", minHeight: 680 }}>
        <iframe
          src={editorSrc}
          title="Редактор Telegram-кружочков"
          className="block h-full w-full"
        />
      </div>
    </div>
  );
}
