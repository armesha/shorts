export const DAY_MS = 86_400_000;
export const CAMPAIGN_DAYS = 30;

export type MapRun = {
  day: number;
  startedAt: string;
  finishedAt?: string;
  state: "running" | "ready" | "failed" | "interrupted";
  video?: string;
};
export type MapCampaign = {
  ownerId: number;
  startedAt: string;
  endsAt: string;
  stoppedAt?: string;
  runs: MapRun[];
};

export function createCampaign(ownerId: number, now: number): MapCampaign {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || !Number.isFinite(now))
    throw new Error("Invalid campaign parameters");
  return {
    ownerId,
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + CAMPAIGN_DAYS * DAY_MS).toISOString(),
    runs: [],
  };
}

export function validateCampaign(value: MapCampaign): void {
  const start = Date.parse(value.startedAt);
  const end = Date.parse(value.endsAt);
  if (!Number.isSafeInteger(value.ownerId) || value.ownerId <= 0 ||
      !Number.isFinite(start) || end !== start + CAMPAIGN_DAYS * DAY_MS ||
      !Array.isArray(value.runs) || value.runs.length > CAMPAIGN_DAYS)
    throw new Error("Invalid saved campaign");
  const days = new Set<number>();
  for (const run of value.runs) {
    const time = Date.parse(run.startedAt);
    if (!Number.isInteger(run.day) || run.day < 0 || run.day >= CAMPAIGN_DAYS ||
        days.has(run.day) || !Number.isFinite(time) || time < start || time >= end ||
        Math.floor((time - start) / DAY_MS) !== run.day ||
        !["running", "ready", "failed", "interrupted"].includes(run.state))
      throw new Error("Invalid saved run");
    days.add(run.day);
  }
}

export function claimDay(campaign: MapCampaign, now: number): MapRun | null {
  validateCampaign(campaign);
  const start = Date.parse(campaign.startedAt);
  if (!Number.isFinite(now) || campaign.stoppedAt || now < start ||
      now >= Date.parse(campaign.endsAt) || campaign.runs.some(r => r.state === "running"))
    return null;
  const day = Math.floor((now - start) / DAY_MS);
  if (campaign.runs.some(r => r.day === day)) return null;
  const run: MapRun = { day, startedAt: new Date(now).toISOString(), state: "running" };
  campaign.runs.push(run);
  return run;
}

export function recoverCampaign(campaign: MapCampaign, now: number): void {
  validateCampaign(campaign);
  for (const run of campaign.runs) {
    if (run.state === "running") {
      run.state = "interrupted";
      run.finishedAt = new Date(now).toISOString();
    }
  }
}
