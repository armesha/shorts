export const meta = {
  name: 'space-qa',
  description: 'Visual QA of space Shorts: subagents read frame grids and flag black bars / caption / footage defects',
  phases: [{ title: 'QA' }],
}

// CLIPS injected before run: [{ id, title, montage }]
const CLIPS = [{"id":"moon","title":"The Same Face for Four Billion Years","montage":"/tmp/qa/moon.jpg"},{"id":"sun_dynamics","title":"A Million-Degree Inferno of Plasma","montage":"/tmp/qa/sun_dynamics.jpg"},{"id":"earth_night","title":"Our Civilization, Glowing From Orbit","montage":"/tmp/qa/earth_night.jpg"},{"id":"blue_marble","title":"The Only Blue Marble We Have","montage":"/tmp/qa/blue_marble.jpg"},{"id":"milky_way_center","title":"Half a Million Stars, One Monster","montage":"/tmp/qa/milky_way_center.jpg"},{"id":"orion_nebula","title":"Flying Into a Star Factory","montage":"/tmp/qa/orion_nebula.jpg"},{"id":"carina_nebula","title":"Cosmic Cliffs Seven Light-Years Tall","montage":"/tmp/qa/carina_nebula.jpg"},{"id":"supernova_1987a","title":"A Ring Lit by a Dying Star","montage":"/tmp/qa/supernova_1987a.jpg"},{"id":"dark_matter","title":"The Invisible Web Holding Everything","montage":"/tmp/qa/dark_matter.jpg"},{"id":"dark_energy","title":"The Force Tearing Space Apart","montage":"/tmp/qa/dark_energy.jpg"},{"id":"cosmic_dawn","title":"When the First Stars Switched On","montage":"/tmp/qa/cosmic_dawn.jpg"},{"id":"globular_cluster","title":"A Million Suns Packed Tight","montage":"/tmp/qa/globular_cluster.jpg"},{"id":"jupiter_moons","title":"Four Worlds Circling a Giant","montage":"/tmp/qa/jupiter_moons.jpg"},{"id":"uranus_rings","title":"An Ice Giant Tipped On Its Side","montage":"/tmp/qa/uranus_rings.jpg"},{"id":"solar_flare","title":"A Plasma Eruption Bigger Than Earth","montage":"/tmp/qa/solar_flare.jpg"},{"id":"kilonova","title":"Where the Universe Forges Gold","montage":"/tmp/qa/kilonova.jpg"},{"id":"mars_perseverance","title":"Standing on a Dead Martian Lake","montage":"/tmp/qa/mars_perseverance.jpg"},{"id":"earthrise","title":"The Photo That Changed Everything","montage":"/tmp/qa/earthrise.jpg"}];
if (!CLIPS.length) { log('no clips'); return { results: [] } }

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'pass', 'blackBars', 'captionDefect', 'footageDefect', 'severity'],
  properties: {
    id: { type: 'string' },
    pass: { type: 'boolean', description: 'true only if the Short looks publishable with no real defect' },
    blackBars: { type: 'boolean', description: 'true if there are hard letterbox black bars (uniform black rectangle with a sharp straight edge), NOT just a dark space background' },
    captionDefect: { type: 'boolean', description: 'true if captions are cut off at the frame edge, overflow, overlap unreadably, are missing, or the gold highlight box is broken' },
    footageDefect: { type: 'boolean', description: 'true if the footage is a talking head, a slide/diagram only, hardware/cleanroom, a rocket launch, mostly empty/black, or otherwise not cinematic space imagery' },
    severity: { type: 'string', description: 'none | minor | major' },
    notes: { type: 'string', description: 'one concise sentence on any problem, or "clean"' },
  },
}

function prompt(c) {
  return `Read the image file at this path and judge it as a quality reviewer for a vertical (9:16) YouTube Short about space:

${c.montage}

It is a 2x3 grid of six frames sampled across one Short titled "${c.title}". Judge the actual Short (1080x1920), not the grid layout.

Check carefully:
1. BLACK BARS: are there hard letterbox black bars — a uniform black rectangle with a sharp straight horizontal edge at top or bottom? A dark or black SPACE background (stars, black hole, deep space) that blends into the image is NOT a black bar and is fine. Only flag real geometric letterbox bars.
2. CAPTIONS: the white karaoke captions with a gold highlight box on the active word must be fully on-screen (not cut off at left/right/bottom edge), readable, not overflowing or overlapping into an unreadable mess. The credit line at the very bottom is expected and fine.
3. FOOTAGE: it should be cinematic space imagery / scientific visualization. Flag if it is instead a talking head, a plain slide or diagram, lab hardware/cleanroom, a rocket launch, or mostly empty black.
4. Any other obvious visual defect.

Return the StructuredOutput verdict. Be strict but fair: pass=true if it is publishable.`;
}

phase('QA')
const results = await parallel(CLIPS.map((c) => () =>
  agent(prompt(c), { label: `qa:${c.id}`, phase: 'QA', schema: SCHEMA, model: 'opus', agentType: 'general-purpose' })
))
const clean = results.filter(Boolean)
const fails = clean.filter((r) => !r.pass)
log(`QA: ${clean.length - fails.length}/${clean.length} pass; flagged: ${fails.map((f) => f.id).join(', ') || 'none'}`)
return { results: clean, fails }
