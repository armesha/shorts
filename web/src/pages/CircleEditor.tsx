import { useEffect, useState } from "react";
import { ExternalLink, Megaphone, Video } from "lucide-react";

const CIRCLE_EDITOR_URL = "/circle-editor/index.html";
const CIRCLE_EDITOR_VERSION = "20260727-1";

export default function CircleEditor() {
  const editorSrc = `${CIRCLE_EDITOR_URL}?v=${CIRCLE_EDITOR_VERSION}`;
  const [mobileFrameHeight, setMobileFrameHeight] = useState(1200);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const updateMobile = () => setMobile(media.matches);
    const updateHeight = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "circle-editor-height") return;
      const height = Number(event.data.height);
      if (Number.isFinite(height)) setMobileFrameHeight(Math.max(900, Math.min(2400, Math.ceil(height))));
    };
    updateMobile();
    media.addEventListener("change", updateMobile);
    window.addEventListener("message", updateHeight);
    return () => {
      media.removeEventListener("change", updateMobile);
      window.removeEventListener("message", updateHeight);
    };
  }, []);

  return (
    <div className="editor-page space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Video size={23} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Telegram-кружочки</h1>
            <p className="text-sm text-base-content/60">
              Шаблоны, собственные кружки, фон, баннеры и генерация готового видео.
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <a href="/admin/banners" target="_blank" rel="noreferrer" className="btn btn-outline min-h-11 gap-2 sm:btn-sm sm:min-h-0">
            <Megaphone size={16} />
            Управлять баннерами
          </a>
          <a href={editorSrc} target="_blank" rel="noreferrer" className="btn btn-outline min-h-11 gap-2 sm:btn-sm sm:min-h-0">
            <ExternalLink size={16} />
            На весь экран
          </a>
        </div>
      </header>

      <div
        className="editor-frame-shell h-[calc(100dvh-11rem)] min-h-[680px] max-sm:min-h-0"
        style={mobile ? { height: mobileFrameHeight } : undefined}
      >
        <iframe
          src={editorSrc}
          title="Редактор Telegram-кружочков"
          className="block h-full w-full"
        />
      </div>
    </div>
  );
}
