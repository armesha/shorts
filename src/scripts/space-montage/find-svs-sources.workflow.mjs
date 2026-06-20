export const meta = {
  name: 'find-svs-sources',
  description: 'Find direct public-domain MP4 URLs (NASA SVS / Hubble / Webb) for space montage topics',
  phases: [{ title: 'Find', detail: 'one agent per topic: WebSearch SVS, WebFetch page, extract+validate MP4 URL' }],
}

const TOPICS = [
  { id: 'black_hole_disk', subject: 'a spinning black hole bending light around its glowing accretion disk', terms: 'black hole accretion disk visualization' },
  { id: 'black_hole_binary', subject: 'two supermassive black holes spiraling toward a collision', terms: 'binary supermassive black hole simulation' },
  { id: 'magnetar', subject: 'a magnetar, a neutron star with the strongest magnetic field in the universe', terms: 'magnetar neutron star animation NICER' },
  { id: 'pulsar', subject: 'a pulsar sweeping beams of radiation across space like a lighthouse', terms: 'pulsar neutron star beam animation' },
  { id: 'quasar', subject: 'a quasar, a feeding black hole blasting jets and outshining its galaxy', terms: 'quasar black hole jet animation' },
  { id: 'tidal_disruption', subject: 'a black hole shredding a passing star into a stream of gas', terms: 'tidal disruption event star black hole animation' },
  { id: 'gamma_ray_burst', subject: 'a gamma-ray burst, the most powerful explosion in the universe', terms: 'gamma-ray burst jet animation Fermi Swift' },
  { id: 'white_dwarf', subject: 'a white dwarf, the dense ember left when a star like the Sun dies', terms: 'white dwarf star animation' },
  { id: 'galaxy_merger', subject: 'two galaxies colliding and merging over millions of years', terms: 'galaxy collision merger simulation' },
  { id: 'cosmic_web', subject: 'the cosmic web of dark matter linking every galaxy', terms: 'cosmic web dark matter large scale structure simulation' },
  { id: 'gaia_milkyway', subject: 'a map of the Milky Way built from a billion stars', terms: 'Gaia Milky Way stars galaxy map animation' },
  { id: 'protoplanet_disk', subject: 'planets being born inside a swirling disk of gas and dust', terms: 'protoplanetary disk planet formation animation' },
  { id: 'exoplanet_transit', subject: 'a planet crossing its star, how we discover distant worlds', terms: 'exoplanet transit Kepler TESS animation' },
  { id: 'trappist1', subject: 'TRAPPIST-1, seven Earth-sized worlds orbiting one tiny star', terms: 'TRAPPIST-1 system planets animation' },
  { id: 'hot_jupiter', subject: 'a hot Jupiter, a giant planet skimming the surface of its star', terms: 'hot Jupiter exoplanet animation' },
  { id: 'crab_nebula', subject: 'the Crab Nebula, the glowing wreckage of an exploded star', terms: 'Crab Nebula supernova remnant animation Chandra Hubble' },
  { id: 'star_formation', subject: 'newborn stars igniting inside a towering cloud of gas', terms: 'star forming region pillars nebula visualization' },
  { id: 'mars_flyover', subject: 'a flight over the canyons and craters of Mars', terms: 'Mars terrain flyover HiRISE MOLA visualization' },
  { id: 'jupiter_juno', subject: 'a dive past Jupiter and its giant storms with Juno', terms: 'Jupiter Juno perijove flyover animation' },
  { id: 'saturn_cassini', subject: 'Saturn and its rings, seen by Cassini', terms: 'Saturn rings Cassini animation' },
  { id: 'europa', subject: 'Europa and its global ocean beneath a cracked shell of ice', terms: 'Europa ocean world ice moon animation' },
  { id: 'titan', subject: 'Titan, a moon with rivers and seas of liquid methane', terms: 'Titan methane lakes surface animation' },
  { id: 'enceladus', subject: 'Enceladus firing geysers of ocean water into space', terms: 'Enceladus plumes geysers Cassini animation' },
  { id: 'io_volcanoes', subject: 'Io, the most volcanic world in the solar system', terms: 'Io volcanoes Jupiter moon animation' },
  { id: 'pluto', subject: 'a flyover of Pluto and its frozen heart', terms: 'Pluto New Horizons flyover animation' },
  { id: 'mercury', subject: 'Mercury, a scorched cratered world next to the Sun', terms: 'Mercury MESSENGER mosaic rotation animation' },
  { id: 'venus', subject: 'Venus, a furnace hot enough to melt lead', terms: 'Venus surface Magellan VERITAS animation' },
  { id: 'neptune_uranus', subject: 'the ice giants Neptune and Uranus on the cold frontier', terms: 'Neptune Uranus ice giant animation' },
  { id: 'bennu', subject: 'spacecraft OSIRIS-REx touching asteroid Bennu to grab a sample', terms: 'Bennu OSIRIS-REx touchdown sample animation' },
  { id: 'asteroid_belt', subject: 'the asteroid belt, rocky leftovers from the birth of the planets', terms: 'asteroid belt animation solar system' },
  { id: 'aurora', subject: 'auroras lighting up Earth when the solar wind strikes', terms: 'aurora substorm magnetosphere THEMIS animation' },
  { id: 'iss_earth', subject: 'the Space Station racing over a glowing Earth', terms: 'ISS Earth orbit time-lapse night' },
  { id: 'voyager', subject: 'Voyager leaving the Sun behind for interstellar space', terms: 'Voyager interstellar heliosphere boundary animation' },
  { id: 'comet_sungrazer', subject: 'a comet plunging toward the Sun and growing a brilliant tail', terms: 'comet sungrazer SOHO Sun animation' },
  { id: 'webb_deepfield', subject: 'the James Webb telescope peering back to the first galaxies', terms: 'James Webb deep field first galaxies zoom animation' },
  { id: 'helio_solarwind', subject: 'the Sun blasting a storm of plasma across the solar system', terms: 'solar wind coronal mass ejection solar system animation' },
]

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'found'],
  properties: {
    id: { type: 'string' },
    found: { type: 'boolean' },
    pageUrl: { type: 'string' },
    mp4Url: { type: 'string' },
    source: { type: 'string', description: 'SVS | NASA | Hubble | Webb' },
    title: { type: 'string' },
    description: { type: 'string', description: 'what the footage actually shows, 1-2 sentences' },
    credit: { type: 'string' },
    license: { type: 'string', description: 'public domain | CC BY 4.0 | etc' },
    orientation: { type: 'string', description: 'landscape | square | portrait | unknown' },
    httpOk: { type: 'boolean', description: 'true only if you confirmed the mp4 URL returns HTTP 200 with a video content-type via curl -sIL' },
    note: { type: 'string' },
  },
}

function buildPrompt(t) {
  return `You find ONE direct, public-domain MP4 video file for a vertical space Shorts montage.

TOPIC id: ${t.id}
SUBJECT (what the clip must visually show): ${t.subject}
Search seed terms: ${t.terms}

GOAL: return the single best DIRECT .mp4 URL of a cinematic SCIENTIFIC VISUALIZATION / animation / telescope footage that visually depicts the subject.

STRONGLY PREFER NASA's Scientific Visualization Studio (svs.gsfc.nasa.gov) — it is public domain and cinematic. Fallbacks (only if SVS has nothing fitting): esahubble.org (ESA/Hubble videos, usually CC BY 4.0), webbtelescope.org, or images-assets.nasa.gov.

STEPS:
1. WebSearch: \`site:svs.gsfc.nasa.gov ${t.terms}\` (and a second query if needed). Collect candidate visualization page URLs like https://svs.gsfc.nasa.gov/NNNNN .
2. Pick the page whose footage best MATCHES the subject and is a pure beauty visualization/animation (NOT a data plot, NOT a talking-head, NOT slides, NOT a launch).
3. WebFetch that page and extract the exact direct .mp4 download URLs it offers.
4. Choose ONE mp4: prefer a 1920x1080 (or 4k) LANDSCAPE "beauty"/full-frame/sim version. Avoid files named Banner / forGIF / thumbnail / WebSize if a 1080 exists. A square (1080x1080) or portrait version is acceptable if no landscape exists.
5. VALIDATE it with Bash: \`curl -sIL --max-time 30 "<mp4Url>"\` — confirm a final HTTP 200 and a video content-type (or a large Content-Length). Set httpOk accordingly. If it 404s, pick a different file/page.

Return the StructuredOutput. If after honest effort you cannot find a fitting public-domain clip, return { id, found: false, note }. Keep description grounded in what the footage actually shows. Do NOT invent URLs — only return a URL you actually saw on the page and validated.`
}

phase('Find')
const results = await parallel(TOPICS.map((t) => () =>
  agent(buildPrompt(t), { label: `find:${t.id}`, phase: 'Find', schema: SCHEMA, model: 'sonnet', agentType: 'general-purpose' })
))

const clean = results.filter(Boolean)
const found = clean.filter((r) => r.found && r.mp4Url)
log(`found ${found.length}/${TOPICS.length} sources (${found.filter((r) => r.httpOk).length} http-validated)`)
return { topics: TOPICS, results: clean, found }
