import type { useT } from "../../lib/i18n";

type TFn = ReturnType<typeof useT>["t"];
type SlotDeckSaveStatus = "idle" | "saving" | "saved" | "error";

type SlotDeckAssignmentsProps = {
  times: string[];
  slotDecks: Record<string, string>;
  slotDeckOptions: string[];
  libraryDeckCounts: Map<string, number>;
  librarySourceName: (deckId: string) => string;
  saveStatus: SlotDeckSaveStatus;
  onSlotDeckChange: (time: string, deckId: string) => void;
  t: TFn;
};

export default function SlotDeckAssignments({
  times,
  slotDecks,
  slotDeckOptions,
  libraryDeckCounts,
  librarySourceName,
  saveStatus,
  onSlotDeckChange,
  t,
}: SlotDeckAssignmentsProps) {
  if (times.length === 0) return null;
  const saveHint = saveStatus === "saving"
    ? t("account.slotAutosaveSaving")
    : saveStatus === "saved"
      ? t("account.slotAutosaveSaved")
      : saveStatus === "error"
        ? t("account.slotAutosaveError")
        : t("account.slotAutosaveHint");

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body">
        <h2 className="card-title text-base">{t("account.slotVideoTitle")}</h2>
        <p className="text-sm text-base-content/60">{t("account.slotVideoHint")}</p>
        <div className="space-y-2 mt-2">
          {[...times].sort().map((time) => (
            <div key={time} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
              <span className="badge badge-primary badge-lg w-20 justify-center">{time}</span>
              <select
                className="select select-bordered select-sm flex-1"
                value={slotDecks[time] ?? ""}
                onChange={(e) => onSlotDeckChange(time, e.target.value)}
              >
                <option value="">{t("account.slotAuto")}</option>
                {slotDeckOptions.map((deckId) => (
                  <option key={deckId} value={deckId}>
                    {librarySourceName(deckId)} · {t("account.libraryVideosCount", { n: libraryDeckCounts.get(deckId) || 0 })}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="text-xs text-base-content/50 mt-1">
          {slotDeckOptions.length === 0 ? t("account.slotNeedsLibrary") : saveHint}
        </p>
      </div>
    </section>
  );
}
