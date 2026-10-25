import { Film, Map, Video, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
const templates = [
  {
    id: "montage",
    name: "Нарезка видео",
    to: "/cutting",
    Icon: Film,
  },
  { id: "maps", name: "Карты", to: "/templates/maps", Icon: Map },
  { id: "circles", name: "Кружочки Telegram", to: "/circles", Icon: Video },
];
export default function VideoTemplateTiles() {
  return (
    <section
      aria-label="Шаблоны видео"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {templates.map(({ id, name, to, Icon }) => (
        <Link
          key={id}
          to={to}
          className="group overflow-hidden border border-base-300 bg-base-100 transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div
            className={`relative h-44 grid place-items-center ${id === "maps" ? "bg-emerald-100 text-emerald-900" : id === "circles" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"}`}
          >
            <Icon size={56} strokeWidth={1.5} />
            {id === "montage" && (
              <div
                className="absolute bottom-5 left-6 right-6 flex gap-1.5"
                aria-hidden="true"
              >
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className="h-2 flex-1 bg-current opacity-25" />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <h2 className="font-semibold">{name}</h2>
            <ArrowUpRight size={18} />
          </div>
        </Link>
      ))}
    </section>
  );
}
