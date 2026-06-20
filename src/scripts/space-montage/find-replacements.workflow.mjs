export const meta = {
  name: 'find-replacements',
  description: 'Find CLEAN cinematic public-domain MP4 replacements for space clips flagged in QA',
  phases: [{ title: 'Find' }],
}

// QA-flagged clips that need a cleaner cinematic source. avoid = page already used (don't reuse).
const TOPICS = [
  { id: 'gaia_milkyway', subject: 'a glowing spiral galaxy of countless stars, like our Milky Way', terms: 'Milky Way galaxy cinematic fly-through OR spiral galaxy zoom beauty', avoid: 'svs.gsfc.nasa.gov/4851 Deep Star Maps (too dark/empty)' },
  { id: 'exoplanet_transit', subject: 'a distant exoplanet world orbiting close to its star', terms: 'exoplanet orbiting star cinematic beauty animation', avoid: 'transit light-curve graph/diagram' },
  { id: 'trappist1', subject: 'the seven Earth-sized planets of TRAPPIST-1 around their red dwarf star', terms: 'TRAPPIST-1 planets cinematic flyover surface animation', avoid: 'orbital chart + talking-head presenter' },
  { id: 'saturn_cassini', subject: 'Saturn and its magnificent rings, a cinematic beauty pass', terms: 'Saturn rings cinematic beauty flyover', avoid: 'Cassini Grand Finale spacecraft hardware renders' },
  { id: 'venus', subject: 'the glowing hot surface and clouds of Venus', terms: 'Venus surface cinematic flyover globe Magellan', avoid: 'multi-probe comparison slide + talking-head presenter' },
  { id: 'aurora', subject: 'shimmering auroras glowing over Earth, seen from orbit', terms: 'aurora from space station cinematic real footage', avoid: 'magnetosphere schematic diagram (Earth + orbit ring on black)' },
  { id: 'comet_sungrazer', subject: 'a bright comet with a long glowing tail near the Sun', terms: 'comet cinematic tail SOHO coronagraph beauty', avoid: 'orbital trajectory diagram of comet path' },
  { id: 'neptune_uranus', subject: 'the deep blue ice giant Neptune in cinematic detail', terms: 'Neptune cinematic flyby beauty Voyager', avoid: 'archival rocket launch footage' },
  { id: 'mars_flyover', subject: 'a cinematic flight over the canyons of Mars', terms: 'Mars cinematic flyover Valles Marineris canyon surface', avoid: 'title cards + data-legend diagram intro' },
  { id: 'helio_solarwind', subject: 'a violent solar flare and eruption blasting off the Sun', terms: 'solar flare coronal mass ejection cinematic Sun eruption SDO', avoid: 'ENLIL text-overlay plot, mostly-black-with-text clip' },
]

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'found'],
  properties: {
    id: { type: 'string' }, found: { type: 'boolean' },
    pageUrl: { type: 'string' }, mp4Url: { type: 'string' }, source: { type: 'string' },
    title: { type: 'string' }, description: { type: 'string' }, credit: { type: 'string' },
    license: { type: 'string' }, orientation: { type: 'string' },
    startSec: { type: 'number', description: 'seconds to skip at the start to avoid any intro/title card (0 if none)' },
    httpOk: { type: 'boolean' }, note: { type: 'string' },
  },
}

function buildPrompt(t) {
  return `Find ONE direct public-domain MP4 of CLEAN CINEMATIC footage for a vertical space Short. The previous clip was rejected in QA — do not repeat that mistake.

id: ${t.id}
SUBJECT (must visually fill the frame): ${t.subject}
search seeds: ${t.terms}
AVOID (the rejected clip / failure mode): ${t.avoid}

HARD REJECT — do NOT return a clip that is any of: a light-curve/graph/chart/orbit-map/schematic/diagram animation, a comparison slide or infographic, a title card, a talking-head presenter, lab hardware or a cleanroom, a rocket launch, an instrument legend, or a clip that is mostly black with only text. The footage MUST be cinematic imagery of the subject filling the frame the whole time.

STEPS:
1. WebSearch \`site:svs.gsfc.nasa.gov ${t.terms}\`. Prefer NASA SVS (public domain). For real-footage subjects (aurora, Earth-from-orbit) the NASA Image & Video Library (images.nasa.gov / images-assets.nasa.gov, public domain) is also good.
2. Open the best candidate page (WebFetch) and read what the footage actually shows. If it is a diagram/slide/launch/talking-head, pick a different one.
3. Extract the exact direct .mp4 URL — prefer a 1920x1080 landscape "beauty"/flythrough/rotation movie. Avoid Banner/forGIF/thumbnail.
4. Validate with Bash: \`curl -sIL --max-time 30 "<mp4Url>"\` → expect HTTP 200 + a video content-type. Set httpOk.
5. If the clip has an intro/title card, set startSec to skip it.

Return the StructuredOutput. If you genuinely cannot find a clean cinematic clip, return { id, found:false, note }. Do not invent URLs.`
}

phase('Find')
const results = await parallel(TOPICS.map((t) => () =>
  agent(buildPrompt(t), { label: `repl:${t.id}`, phase: 'Find', schema: SCHEMA, model: 'sonnet', agentType: 'general-purpose' })
))
const clean = results.filter(Boolean)
const found = clean.filter((r) => r.found && r.mp4Url)
log(`replacements found ${found.length}/${TOPICS.length} (${found.filter((r) => r.httpOk).length} http-ok)`)
return { results: clean, found }
