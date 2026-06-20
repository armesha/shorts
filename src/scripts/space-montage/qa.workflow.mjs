export const meta = {
  name: 'space-qa',
  description: 'Visual QA of space Shorts: subagents read frame grids and flag black bars / caption / footage defects',
  phases: [{ title: 'QA' }],
}

// CLIPS injected before run: [{ id, title, montage }]
const CLIPS = [{"id":"what_the_accretion_disk_really","title":"What the accretion disk really is","montage":"/tmp/qa/what_the_accretion_disk_really.jpg"},{"id":"even_black_holes_can_leak","title":"Even black holes can leak","montage":"/tmp/qa/even_black_holes_can_leak.jpg"},{"id":"how_supernovae_forge_cosmic_ra","title":"How Supernovae Forge Cosmic Rays","montage":"/tmp/qa/how_supernovae_forge_cosmic_ra.jpg"},{"id":"a_detector_floated_to_earth_s_","title":"A Detector Floated to Earth's Edge","montage":"/tmp/qa/a_detector_floated_to_earth_s_.jpg"},{"id":"95_of_the_universe_is_invisibl","title":"95% of the universe is invisible","montage":"/tmp/qa/95_of_the_universe_is_invisibl.jpg"},{"id":"built_for_3_years_still_runnin","title":"Built for 3 years, still running at 8","montage":"/tmp/qa/built_for_3_years_still_runnin.jpg"},{"id":"why_the_sun_triggers_earth_s_a","title":"Why the Sun triggers Earth's auroras","montage":"/tmp/qa/why_the_sun_triggers_earth_s_a.jpg"},{"id":"solar_wind_smacks_into_earth_s","title":"Solar wind smacks into Earth's shield","montage":"/tmp/qa/solar_wind_smacks_into_earth_s.jpg"},{"id":"why_nasa_flew_a_probe_into_the","title":"Why NASA flew a probe into the Sun","montage":"/tmp/qa/why_nasa_flew_a_probe_into_the.jpg"},{"id":"cosmic_rays_from_dying_stars_h","title":"Cosmic rays from dying stars hit Earth","montage":"/tmp/qa/cosmic_rays_from_dying_stars_h.jpg"},{"id":"nutrition_in_the_vastness_of_s","title":"Nutrition in the vastness of space","montage":"/tmp/qa/nutrition_in_the_vastness_of_s.jpg"},{"id":"the_moon_remembers_what_earth_","title":"The Moon remembers what Earth forgot","montage":"/tmp/qa/the_moon_remembers_what_earth_.jpg"},{"id":"one_small_step_50_years_on","title":"One small step, 50 years on","montage":"/tmp/qa/one_small_step_50_years_on.jpg"},{"id":"how_rockets_fuel_america_s_spa","title":"How rockets fuel America's space economy","montage":"/tmp/qa/how_rockets_fuel_america_s_spa.jpg"},{"id":"mining_the_moon_the_next_space","title":"Mining the Moon: the next space business","montage":"/tmp/qa/mining_the_moon_the_next_space.jpg"},{"id":"solar_arrays_that_roll_out_in_","title":"Solar arrays that roll out in space","montage":"/tmp/qa/solar_arrays_that_roll_out_in_.jpg"},{"id":"how_nasa_grows_a_garden_in_spa","title":"How NASA grows a garden in space","montage":"/tmp/qa/how_nasa_grows_a_garden_in_spa.jpg"},{"id":"why_your_organs_need_blood_ves","title":"Why your organs need blood-vessel networks","montage":"/tmp/qa/why_your_organs_need_blood_ves.jpg"},{"id":"a_lab_grown_human_organ_within","title":"A lab-grown human organ within a decade?","montage":"/tmp/qa/a_lab_grown_human_organ_within.jpg"},{"id":"lightning_that_shoots_up_and_g","title":"Lightning that shoots UP and glows red","montage":"/tmp/qa/lightning_that_shoots_up_and_g.jpg"},{"id":"two_black_holes_locked_in_a_de","title":"Two Black Holes Locked in a Death Spiral","montage":"/tmp/qa/two_black_holes_locked_in_a_de.jpg"},{"id":"gravity_so_strong_it_bends_spa","title":"Gravity So Strong It Bends Space-Time","montage":"/tmp/qa/gravity_so_strong_it_bends_spa.jpg"},{"id":"nothing_escapes_a_black_hole_n","title":"Nothing escapes a black hole, not even light","montage":"/tmp/qa/nothing_escapes_a_black_hole_n.jpg"},{"id":"how_we_hunt_invisible_cosmic_m","title":"How we hunt invisible cosmic monsters","montage":"/tmp/qa/how_we_hunt_invisible_cosmic_m.jpg"},{"id":"a_pulsar_spins_1000s_of_times_","title":"A Pulsar Spins 1000s of Times a Second","montage":"/tmp/qa/a_pulsar_spins_1000s_of_times_.jpg"},{"id":"the_cosmic_wall_where_light_hi","title":"The Cosmic Wall Where Light Hits Its Limit","montage":"/tmp/qa/the_cosmic_wall_where_light_hi.jpg"},{"id":"black_hole_jets_light_up_the_c","title":"Black-hole jets light up the cosmos","montage":"/tmp/qa/black_hole_jets_light_up_the_c.jpg"},{"id":"stars_forged_the_universe_s_ir","title":"Stars forged the universe's iron","montage":"/tmp/qa/stars_forged_the_universe_s_ir.jpg"},{"id":"finding_a_firefly_next_to_a_li","title":"Finding a firefly next to a lighthouse","montage":"/tmp/qa/finding_a_firefly_next_to_a_li.jpg"},{"id":"cosmic_dust_that_becomes_earth","title":"Cosmic dust that becomes Earths","montage":"/tmp/qa/cosmic_dust_that_becomes_earth.jpg"},{"id":"nasa_s_new_infrared_look_at_ou","title":"NASA's New Infrared Look at Our Galaxy","montage":"/tmp/qa/nasa_s_new_infrared_look_at_ou.jpg"},{"id":"inside_the_milky_way_s_black_h","title":"Inside the Milky Way's Black-Hole Heart","montage":"/tmp/qa/inside_the_milky_way_s_black_h.jpg"},{"id":"the_mars_rock_that_doesn_t_bel","title":"The Mars rock that doesn't belong","montage":"/tmp/qa/the_mars_rock_that_doesn_t_bel.jpg"},{"id":"rushing_water_once_filled_this","title":"Rushing water once filled this crater","montage":"/tmp/qa/rushing_water_once_filled_this.jpg"},{"id":"how_saturn_is_raining_its_ring","title":"How Saturn Is Raining Its Rings Away","montage":"/tmp/qa/how_saturn_is_raining_its_ring.jpg"},{"id":"saturn_s_rings_will_be_gone_in","title":"Saturn's Rings Will Be Gone in 300M Years","montage":"/tmp/qa/saturn_s_rings_will_be_gone_in.jpg"},{"id":"a_storm_that_wrapped_around_sa","title":"A Storm That Wrapped Around Saturn","montage":"/tmp/qa/a_storm_that_wrapped_around_sa.jpg"},{"id":"8_years_in_orbit_140_billion_c","title":"8 years in orbit, 140 billion cosmic rays","montage":"/tmp/qa/8_years_in_orbit_140_billion_c.jpg"},{"id":"5_years_past_its_design_life_c","title":"5 years past its design life - can it last?","montage":"/tmp/qa/5_years_past_its_design_life_c.jpg"}];
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
