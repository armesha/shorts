export const meta = {
  name: 'space-qa',
  description: 'Visual QA of space Shorts: subagents read frame grids and flag black bars / caption / footage defects',
  phases: [{ title: 'QA' }],
}

// CLIPS injected before run: [{ id, title, montage }]
const CLIPS = [{"id":"black_hole_disk","title":"Light Bends Around the Abyss","montage":"/tmp/qa/black_hole_disk.jpg"},{"id":"black_hole_binary","title":"Two Giants Dance to the End","montage":"/tmp/qa/black_hole_binary.jpg"},{"id":"magnetar","title":"The Strongest Magnet in Existence","montage":"/tmp/qa/magnetar.jpg"},{"id":"pulsar","title":"A Lighthouse of the Cosmos","montage":"/tmp/qa/pulsar.jpg"},{"id":"quasar","title":"Brighter Than a Trillion Suns","montage":"/tmp/qa/quasar.jpg"},{"id":"tidal_disruption","title":"A Star Torn Into Spaghetti","montage":"/tmp/qa/tidal_disruption.jpg"},{"id":"gamma_ray_burst","title":"The Universe's Deadliest Blast","montage":"/tmp/qa/gamma_ray_burst.jpg"},{"id":"white_dwarf","title":"A Dead Sun Devours Worlds","montage":"/tmp/qa/white_dwarf.jpg"},{"id":"galaxy_merger","title":"Andromeda Is Coming for Us","montage":"/tmp/qa/galaxy_merger.jpg"},{"id":"cosmic_web","title":"Every Galaxy on Invisible Threads","montage":"/tmp/qa/cosmic_web.jpg"},{"id":"gaia_milkyway","title":"Mapping a Billion Stars","montage":"/tmp/qa/gaia_milkyway.jpg"},{"id":"protoplanet_disk","title":"Watch Planets Being Born","montage":"/tmp/qa/protoplanet_disk.jpg"},{"id":"exoplanet_transit","title":"How We Find Hidden Worlds","montage":"/tmp/qa/exoplanet_transit.jpg"},{"id":"trappist1","title":"Seven Earths Around One Star","montage":"/tmp/qa/trappist1.jpg"},{"id":"hot_jupiter","title":"A Planet Hotter Than Stars","montage":"/tmp/qa/hot_jupiter.jpg"},{"id":"crab_nebula","title":"The Corpse of an Exploded Star","montage":"/tmp/qa/crab_nebula.jpg"},{"id":"star_formation","title":"Towers Where Stars Are Born","montage":"/tmp/qa/star_formation.jpg"},{"id":"mars_flyover","title":"A Canyon to Swallow Continents","montage":"/tmp/qa/mars_flyover.jpg"},{"id":"jupiter_juno","title":"Diving Into Jupiter's Storms","montage":"/tmp/qa/jupiter_juno.jpg"},{"id":"saturn_cassini","title":"The Crown of the Solar System","montage":"/tmp/qa/saturn_cassini.jpg"},{"id":"europa","title":"An Ocean Under Cracked Ice","montage":"/tmp/qa/europa.jpg"},{"id":"titan","title":"Rivers of Liquid Methane","montage":"/tmp/qa/titan.jpg"},{"id":"enceladus","title":"A Moon That Sprays the Sky","montage":"/tmp/qa/enceladus.jpg"},{"id":"io_volcanoes","title":"The Most Volcanic World","montage":"/tmp/qa/io_volcanoes.jpg"},{"id":"pluto","title":"Pluto's Frozen Heart","montage":"/tmp/qa/pluto.jpg"},{"id":"mercury","title":"Scorched and Battered by the Sun","montage":"/tmp/qa/mercury.jpg"},{"id":"venus","title":"A Furnace That Melts Lead","montage":"/tmp/qa/venus.jpg"},{"id":"neptune_uranus","title":"Worlds at the Cold Frontier","montage":"/tmp/qa/neptune_uranus.jpg"},{"id":"bennu","title":"Touching an Asteroid to Steal Dust","montage":"/tmp/qa/bennu.jpg"},{"id":"asteroid_belt","title":"Leftovers From the Planets' Birth","montage":"/tmp/qa/asteroid_belt.jpg"},{"id":"aurora","title":"When the Sun Strikes the Sky","montage":"/tmp/qa/aurora.jpg"},{"id":"iss_earth","title":"Racing Earth at 17,500 mph","montage":"/tmp/qa/iss_earth.jpg"},{"id":"voyager","title":"Humanity's Farthest Traveler","montage":"/tmp/qa/voyager.jpg"},{"id":"comet_sungrazer","title":"A Frozen Wanderer Wakes Up","montage":"/tmp/qa/comet_sungrazer.jpg"},{"id":"webb_deepfield","title":"Seeing the First Galaxies","montage":"/tmp/qa/webb_deepfield.jpg"},{"id":"helio_solarwind","title":"A Storm Across the Solar System","montage":"/tmp/qa/helio_solarwind.jpg"}];
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
