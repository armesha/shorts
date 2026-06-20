export const meta = {
  name: 'space-qa',
  description: 'Visual QA of space Shorts: subagents read frame grids and flag black bars / caption / footage defects',
  phases: [{ title: 'QA' }],
}

// CLIPS injected before run: [{ id, title, montage }]
const CLIPS = [{"id":"mars_winds_so_strong_they_brok","title":"Mars winds so strong they broke a rover","montage":"/tmp/qa/mars_winds_so_strong_they_brok.jpg"},{"id":"standing_next_to_curiosity_on_","title":"Standing Next to Curiosity on Mars","montage":"/tmp/qa/standing_next_to_curiosity_on_.jpg"},{"id":"mars_hills_so_stunning_they_d_","title":"Mars Hills So Stunning They'd Be a Park","montage":"/tmp/qa/mars_hills_so_stunning_they_d_.jpg"},{"id":"the_last_trace_of_water_on_mar","title":"The Last Trace of Water on Mars","montage":"/tmp/qa/the_last_trace_of_water_on_mar.jpg"},{"id":"curiosity_s_360_view_of_where_","title":"Curiosity's 360 view of where it landed","montage":"/tmp/qa/curiosity_s_360_view_of_where_.jpg"},{"id":"curiosity_found_pure_sulfur_on","title":"Curiosity Found Pure Sulfur on Mars","montage":"/tmp/qa/curiosity_found_pure_sulfur_on.jpg"},{"id":"why_this_asteroid_sample_is_un","title":"Why this asteroid sample is unlike any other","montage":"/tmp/qa/why_this_asteroid_sample_is_un.jpg"},{"id":"nasa_s_target_a_crater_3_parki","title":"NASA's target: a crater 3 parking spaces wide","montage":"/tmp/qa/nasa_s_target_a_crater_3_parki.jpg"},{"id":"how_a_spacecraft_grabs_an_aste","title":"How a spacecraft grabs an asteroid in seconds","montage":"/tmp/qa/how_a_spacecraft_grabs_an_aste.jpg"},{"id":"how_nasa_will_grab_a_piece_of_","title":"How NASA will grab a piece of an asteroid","montage":"/tmp/qa/how_nasa_will_grab_a_piece_of_.jpg"},{"id":"the_asteroid_site_with_a_myste","title":"The asteroid site with a mysterious dark patch","montage":"/tmp/qa/the_asteroid_site_with_a_myste.jpg"},{"id":"what_bennu_really_looked_like_","title":"What Bennu Really Looked Like Up Close","montage":"/tmp/qa/what_bennu_really_looked_like_.jpg"},{"id":"no_safe_spot_to_land_on_the_as","title":"No Safe Spot to Land on the Asteroid","montage":"/tmp/qa/no_safe_spot_to_land_on_the_as.jpg"},{"id":"solar_wind_hits_earth_at_a_mil","title":"Solar wind hits Earth at a million mph","montage":"/tmp/qa/solar_wind_hits_earth_at_a_mil.jpg"},{"id":"space_weather_can_fry_satellit","title":"Space weather can fry satellites & astronauts","montage":"/tmp/qa/space_weather_can_fry_satellit.jpg"},{"id":"aurora_with_the_energy_of_an_e","title":"Aurora With the Energy of an Earthquake","montage":"/tmp/qa/aurora_with_the_energy_of_an_e.jpg"},{"id":"our_sun_is_more_than_heat_and_","title":"Our Sun Is More Than Heat And Light","montage":"/tmp/qa/our_sun_is_more_than_heat_and_.jpg"},{"id":"37_miles_a_second_into_jupiter","title":"37 Miles a Second Into Jupiter","montage":"/tmp/qa/37_miles_a_second_into_jupiter.jpg"},{"id":"scars_that_mapped_jupiter_s_wi","title":"Scars That Mapped Jupiter's Winds","montage":"/tmp/qa/scars_that_mapped_jupiter_s_wi.jpg"},{"id":"how_nasa_actually_saw_a_4_bill","title":"How NASA actually saw a 4-billion-mile fossil","montage":"/tmp/qa/how_nasa_actually_saw_a_4_bill.jpg"},{"id":"one_object_or_two_the_flyby_re","title":"One object or two? The flyby revealed the truth","montage":"/tmp/qa/one_object_or_two_the_flyby_re.jpg"},{"id":"spitzer_to_webb_deeper_into_th","title":"Spitzer to Webb: deeper into the cosmos","montage":"/tmp/qa/spitzer_to_webb_deeper_into_th.jpg"},{"id":"when_neutron_stars_collide_lig","title":"When neutron stars collide, light is born","montage":"/tmp/qa/when_neutron_stars_collide_lig.jpg"}];
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
