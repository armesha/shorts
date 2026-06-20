// Broader discovery: narrated PD space-astronomy videos with official .srt.
import fs from "node:fs";
const enc = (u) => encodeURI(u.replace(/^http:/, "https:"));
async function j(u) { const r = await fetch(u, { headers: { "user-agent": "shorts/1.0" } }); if (!r.ok) throw new Error(r.status); return r.json(); }
const queries = [
  "black hole", "supernova remnant", "neutron star", "galaxy collision", "exoplanet",
  "nebula", "Milky Way galaxy", "dark matter", "dark energy", "gravitational waves",
  "solar flare sun", "aurora solar wind", "Mars exploration", "Jupiter", "Saturn rings",
  "asteroid comet", "Hubble discovers", "Webb telescope reveals", "cosmic rays", "star formation",
  "pulsar", "quasar", "Pluto New Horizons", "Voyager interstellar",
];
// exclude station-life / briefings / hosts-only series
const BAD = /this week|@nasa|briefing|press|town hall|crew-|live coverage|nutrition|cement|business in space|plant growth|biomanufactur|water recovery|vision changes|lightning from|hearing|administrator|anniversary special|podcast|q&a|interview|how to|expedition \d|spacewalk|launch of/i;
const ASTRO = /black hole|supernova|neutron|galax|exoplanet|nebula|milky way|dark matter|dark energy|gravitational wave|solar|aurora|mars|jupiter|saturn|asteroid|comet|hubble|webb|cosmic|star|pulsar|quasar|pluto|voyager|universe|planet|telescope|spitzer|chandra/i;
const seen = new Map();
for (const q of queries) {
  let items = [];
  try { items = (await j(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=video`)).collection?.items || []; } catch { continue; }
  for (const it of items.slice(0, 10)) {
    const d = it.data?.[0] || {};
    const t = d.title || "";
    if (!d.nasa_id || seen.has(d.nasa_id)) continue;
    if (BAD.test(t) || !ASTRO.test(t)) continue;
    let col = [];
    try { col = await j(it.href); } catch { continue; }
    const srt = col.find((u) => /\.srt$/i.test(u));
    const mp4 = col.find((u) => /~orig\.mp4/i.test(u)) || col.find((u) => /~large\.mp4/i.test(u)) || col.find((u) => /~medium\.mp4/i.test(u)) || col.find((u) => /\.mp4/i.test(u));
    if (!srt || !mp4) continue;
    seen.set(d.nasa_id, { nasa_id: d.nasa_id, title: t, center: d.center || "", mp4: enc(mp4), srt: enc(srt) });
  }
}
const list = [...seen.values()];
fs.writeFileSync("/tmp/narrated.json", JSON.stringify(list, null, 2));
console.log(`found ${list.length} narrated astronomy videos with .srt:`);
for (const v of list) console.log(`  ${v.nasa_id.slice(0, 30).padEnd(31)} | ${v.center.padEnd(5)} | ${v.title.slice(0, 52)}`);
