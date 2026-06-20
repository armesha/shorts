export const meta = {
  name: 'find-batch2',
  description: 'Find CLEAN cinematic public-domain MP4s for 22 new space topics (silent subtitle Shorts)',
  phases: [{ title: 'Find' }],
}

const TOPICS = [
  { id: 'moon', subject: 'the Moon rotating, its craters and seas in sharp detail', terms: 'CGI Moon rotation libration Dial-a-Moon animation' },
  { id: 'sun_dynamics', subject: 'the roiling surface of the Sun with active regions and plasma', terms: 'Sun SDO solar dynamics observatory active region close-up' },
  { id: 'earth_night', subject: 'Earth at night, glowing with city lights', terms: 'Earth at night city lights Black Marble Suomi NPP' },
  { id: 'blue_marble', subject: 'the whole Earth, a blue marble spinning in space', terms: 'Earth rotating Blue Marble full disk' },
  { id: 'milky_way_center', subject: 'the crowded heart of the Milky Way around its central black hole', terms: 'Milky Way galactic center Sagittarius A star black hole visualization' },
  { id: 'orion_nebula', subject: 'a flight through the glowing Orion Nebula', terms: 'Orion Nebula fly-through flythrough visualization Hubble Spitzer' },
  { id: 'carina_nebula', subject: 'the towering cosmic cliffs of the Carina Nebula', terms: 'Carina Nebula Webb cosmic cliffs flythrough' },
  { id: 'ring_nebula', subject: 'the glowing Ring Nebula, a dying star’s shed shell', terms: 'Ring Nebula Webb visualization' },
  { id: 'supernova_1987a', subject: 'the glowing ring around Supernova 1987A', terms: 'Supernova 1987A ring Hubble Webb visualization' },
  { id: 'cassiopeia_a', subject: 'the shredded shell of supernova remnant Cassiopeia A', terms: 'Cassiopeia A supernova remnant Webb Chandra visualization' },
  { id: 'dark_matter', subject: 'invisible dark matter shaping the structure of the universe', terms: 'dark matter simulation cosmic structure formation' },
  { id: 'dark_energy', subject: 'dark energy pushing the universe to expand ever faster', terms: 'dark energy universe accelerating expansion visualization' },
  { id: 'cosmic_dawn', subject: 'the first stars igniting in the early universe', terms: 'first stars cosmic dawn early universe reionization simulation' },
  { id: 'globular_cluster', subject: 'a dense ancient swarm of a million stars in a globular cluster', terms: 'globular cluster Omega Centauri stars flythrough' },
  { id: 'solar_eclipse', subject: 'the Moon’s shadow sweeping across Earth during a solar eclipse', terms: 'solar eclipse Moon shadow Earth from space satellite' },
  { id: 'jupiter_moons', subject: 'Jupiter’s four giant Galilean moons orbiting the king of planets', terms: 'Jupiter Galilean moons Io Europa Ganymede Callisto animation' },
  { id: 'uranus_rings', subject: 'tilted Uranus and its faint rings glowing in infrared', terms: 'Uranus rings Webb infrared' },
  { id: 'arrokoth', subject: 'the snowman-shaped Kuiper Belt world Arrokoth, the farthest place ever visited', terms: 'Arrokoth New Horizons Kuiper Belt flyby animation' },
  { id: 'solar_flare', subject: 'a violent solar flare erupting in a loop of plasma', terms: 'solar flare prominence eruption SDO close-up' },
  { id: 'kilonova', subject: 'two neutron stars colliding in a kilonova that forges gold', terms: 'kilonova neutron star merger collision simulation' },
  { id: 'mars_perseverance', subject: 'a rover exploring the dusty red surface of Mars', terms: 'Perseverance Curiosity rover Mars surface drive footage' },
  { id: 'earthrise', subject: 'the Earth rising over the barren lunar horizon', terms: 'Earthrise Earth from Moon LRO animation' },
]

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'found'],
  properties: {
    id: { type: 'string' }, found: { type: 'boolean' },
    pageUrl: { type: 'string' }, mp4Url: { type: 'string' }, source: { type: 'string' },
    title: { type: 'string' }, description: { type: 'string' }, credit: { type: 'string' },
    license: { type: 'string' }, orientation: { type: 'string' },
    startSec: { type: 'number', description: 'seconds to skip any intro/title card (0 if none)' },
    httpOk: { type: 'boolean' }, note: { type: 'string' },
  },
}

function buildPrompt(t) {
  return `Find ONE direct public-domain MP4 of CLEAN CINEMATIC footage for a vertical (9:16) silent space Short (subtitles only, no narration).

id: ${t.id}
SUBJECT (must visually fill the frame): ${t.subject}
search seeds: ${t.terms}

HARD REJECT — never return a clip that is any of: a light-curve/graph/chart/orbit-map/schematic/diagram, a comparison slide or infographic, a title card, a talking-head presenter, lab hardware or a cleanroom, a rocket launch, an instrument legend, or a clip that is mostly black with only text. It MUST be cinematic imagery of the subject filling the frame.

STEPS:
1. WebSearch \`site:svs.gsfc.nasa.gov ${t.terms}\` (and a second query if needed). Prefer NASA Scientific Visualization Studio (svs.gsfc.nasa.gov) — public domain. For real-footage subjects (rover, Earth-from-orbit) the NASA Image & Video Library (images.nasa.gov / images-assets.nasa.gov, public domain) is fine; ESA/Hubble (esahubble.org, CC BY 4.0) is an acceptable fallback.
2. WebFetch the best page; confirm from its description the footage is cinematic and matches the subject (NOT a diagram/slide/launch/talking-head). If not, pick another.
3. Extract the exact direct .mp4 URL — prefer a 1920x1080 (or vertical) beauty/flythrough/rotation movie. Avoid Banner/forGIF/thumbnail/WebSize.
4. VALIDATE with Bash: \`curl -sIL --max-time 30 "<mp4Url>"\` — confirm final HTTP 200 + a video content-type. Set httpOk. If it 404s, pick another file/page.
5. If there is an intro/title card, set startSec to skip it.

Return StructuredOutput. If you truly cannot find a clean cinematic clip, return { id, found:false, note }. Do not invent URLs; only return one you actually saw and validated.`
}

phase('Find')
const results = await parallel(TOPICS.map((t) => () =>
  agent(buildPrompt(t), { label: `b2:${t.id}`, phase: 'Find', schema: SCHEMA, model: 'opus', agentType: 'general-purpose' })
))
const clean = results.filter(Boolean)
const found = clean.filter((r) => r.found && r.mp4Url)
log(`batch2 found ${found.length}/${TOPICS.length} (${found.filter((r) => r.httpOk).length} http-ok)`)
return { topics: TOPICS, results: clean, found }
