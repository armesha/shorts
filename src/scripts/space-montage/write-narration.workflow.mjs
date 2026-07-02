export const meta = {
  name: 'write-space-narration',
  description: 'Write engaging short space-Shorts narration + titles (Opus 4.8) grounded in real NASA footage',
  phases: [{ title: 'Draft' }, { title: 'Polish' }],
}

// topics embedded (generated from tmp/space-build/sources.json)
const topics = [{"id":"moon","subject":"the Moon rotating, its craters and seas in sharp detail","title":"Moon Phase and Libration, 2025 (plain)","description":"Clean, full-frame CGI render of the Moon rotating through its phases and libration over 2025 at hourly intervals. Craters and maria (lunar seas) are rendered in sharp detail (built from Lunar Reconnaissance Orbiter elevation/imagery data). This is the \"plain\" version: the Moon fills the frame against black with NO labe"},{"id":"sun_dynamics","subject":"the roiling surface of the Sun with active regions and plasma","title":"The Active Sun from SDO: 171 Ångstroms (Jewelbox)","description":"Full-disk SDO movie of the Sun in 171 Angstrom extreme-UV light: the roiling solar surface filling the frame with bright active regions and glowing coronal plasma loops against black space. 17-hour time-lapse sampled every 36 seconds. Cinematic real-imagery beauty shot, no graphs/diagrams/title card."},{"id":"earth_night","subject":"Earth at night, glowing with city lights","title":"Rotating Earth at Night (VIIRS Day-Night Band over MODIS Blue Marble)","description":"Cinematic rotating 3D globe of Earth at night: Suomi NPP VIIRS day-night-band city lights composited over MODIS Blue Marble for a realistic full-frame Earth. Glowing urban clusters across continents against dark oceans. No chart/diagram/title card. 1920x1080, ~6.5 MB, HTTP 200 video/mp4. Landscape — crop/zoom to 9:16 f"},{"id":"blue_marble","subject":"the whole Earth, a blue marble spinning in space","title":"Blue Marble 2015 — Rotating full-disk Earth (VIIRS true-color)","description":"Cinematic 360-degree rotation of the whole Earth as a blue marble in space, full disk filling the frame, built from a VIIRS true-color global composite captured October 14, 2015. No narration, no title card, no diagram/chart — pure imagery of the subject."},{"id":"milky_way_center","subject":"the crowded heart of the Milky Way around its central black hole","title":"Zoom into the Center of Our Galaxy","description":"Cinematic infrared zoom from a wide starscape into the extraordinarily crowded nuclear star cluster at the Milky Way's center, the dense field of half a million stars surrounding the central supermassive black hole Sagittarius A*. Fills the frame with stars; no graph, diagram, slide, title card, presenter, or hardware."},{"id":"orion_nebula","subject":"a flight through the glowing Orion Nebula","title":"Flight Through the Orion Nebula in Visible Light","description":"Continuous cinematic 3D fly-through of the Orion Nebula built from Hubble visible-light observations: the camera dives into the glowing gaseous star-forming region, past wispy bow shocks and proplyds. The nebula fills the frame; no charts, diagrams, title cards, talking-heads, or hardware."},{"id":"carina_nebula","subject":"the towering cosmic cliffs of the Carina Nebula","title":"Exploring the Cosmic Cliffs in 3D","description":"Non-narrated cinematic 3D flythrough flying through the towering dust pillars / \"cosmic cliffs\" of the Carina Nebula (NGC 3324), based on the JWST NIRCam image. Dust pillars, stellar jets, and streams of ionized gas fill the frame. No labels, charts, or comparison overlays — pure cinematic imagery of the subject."},{"id":"supernova_1987a","subject":"the glowing ring around Supernova 1987A","title":"Blast Wave from Supernova 1987A","description":"Cinematic 3D scientific visualization of Supernova 1987A: the blast wave propagates outward, collides with the pre-existing circumstellar ring and heats it until it glows, then the camera circles the present-day luminous ring so it fills the frame. Subject (the glowing ring) dominates the shot. No charts, diagrams, tit"},{"id":"dark_matter","subject":"invisible dark matter shaping the structure of the universe","title":"Journey Through the Cosmic Web: Cosmic Cruising 2","description":"Cinematic computer-simulation flythrough of the cosmic web: bright knots are entire galaxies, purple filaments are the dark matter strands between them, directly visualizing how invisible dark matter shapes the large-scale structure of the universe. Camera cruises straight through the simulation volume. Fills the frame"},{"id":"dark_energy","subject":"dark energy pushing the universe to expand ever faster","title":"Dark Energy Expands the Universe","description":"Cinematic flythrough of a series of galaxy clusters (the largest gravitationally-bound structures in the universe), illustrating how cosmic expansion first decelerated after the Big Bang then began to accelerate, driven by dark energy. Galaxy/cosmic-web imagery fills the frame throughout — no diagrams, charts, title ca"},{"id":"cosmic_dawn","subject":"the first stars igniting in the early universe","title":"Reionization Animation (unlabeled) — Distant Galaxy Group EGS77 Driving Cosmic Reionization","description":"Cinematic 3D rendered flythrough of the early universe: flies in to the first galaxies and shows ultraviolet light from their newborn stars igniting and inflating expanding bubbles of ionized hydrogen during cosmic reionization. The \"no_label\" master has all on-screen text/labels removed — pure simulation imagery filli"},{"id":"globular_cluster","subject":"a dense ancient swarm of a million stars in a globular cluster","title":"Zoom to Globular Star Cluster NGC 6397 (Hubble)","description":"Cinematic Hubble Space Telescope zoom into the dense ancient globular star cluster NGC 6397, the swarm of stars filling the frame. No annotations, narration, charts, or title cards. 1920x1080, 30fps."},{"id":"jupiter_moons","subject":"Jupiter’s four giant Galilean moons orbiting the king of planets","title":"Simulation of Galilean Satellites orbiting Jupiter","description":"Cinematic 3D simulation of Jupiter with its four Galilean moons (Io, Europa, Ganymede, Callisto) orbiting the planet, with moons transiting and casting shadows on Jupiter's disk. Jupiter fills the frame. 1920x1080. No diagram/chart/title-card/launch/talking-head."},{"id":"uranus_rings","subject":"tilted Uranus and its faint rings glowing in infrared","title":"Pan of Uranus (NIRCam)","description":"A 30-second slow cinematic pan across the James Webb Space Telescope NIRCam near-infrared image of Uranus: the tilted ice giant with its bright seasonal polar cap, surrounded by its faint glowing rings (including the inner Zeta ring) and several moons, filling the frame against a black sky. No narration, no diagram, no"},{"id":"solar_flare","subject":"a violent solar flare erupting in a loop of plasma","title":"Summer Sun from SDO: Eruption and Coronal Loops on the Solar Limb (AIA 304A)","description":"Cinematic SDO/AIA extreme-ultraviolet (304 angstrom) footage of a prominent plasma eruption off the lower-right limb of the Sun on June 18, 2015, followed by complex glowing coronal-loop evolution. Hot plasma fills the frame against black space; no graph, diagram, title card, launch, or presenter."},{"id":"kilonova","subject":"two neutron stars colliding in a kilonova that forges gold","title":"Neutron Stars Rip Each Other Apart to Form Black Hole","description":"Cinematic 3D supercomputer simulation of two neutron stars spiraling in, colliding and tearing each other apart as they merge into a black hole. Lower-density debris shown in redder colors with green/white magnetic field ribbons; the violent merger that drives a kilonova fills the frame. No narration, no charts/diagram"},{"id":"mars_perseverance","subject":"a rover exploring the dusty red surface of Mars","title":"Curiosity Mars rover panorama (PIA26551) — zoom and pan across Mount Sharp / Gale Crater","description":"Clean cinematic 4K (3840x2160) zoom-and-pan animation across a color panorama of the dusty reddish Martian surface — Curiosity's view from Mount Sharp looking back across the floor and rim of Gale Crater (Feb 7, 2025). No narrator, no burned-in text labels, no title card, no diagrams/charts. Rocky red terrain and dista"},{"id":"earthrise","subject":"the Earth rising over the barren lunar horizon","title":"Earthrise: The 45th Anniversary — idealized Earthrise visualization (LRO data)","description":"Cinematic NASA SVS visualization of the Earth rising above the barren lunar horizon, reconstructed from Lunar Reconnaissance Orbiter (LRO) photo mosaics and elevation data, with the virtual camera at the Apollo 8 position on Dec 24, 1968. This specific file (earthrise_1080p30.mp4) is the clean \"idealized view\" version "}];
if (!topics.length) { log("no topics"); return { items: [] } }

const ITEM_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'title', 'narration'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string', description: 'catchy hook title, <= 42 chars, Title Case, no end period' },
          narration: { type: 'string', description: 'spoken narration, 40-52 words, plain text for TTS' },
        },
      },
    },
  },
}

const RULES = `You write narration for vertical YouTube Shorts about space. Each clip shows a real NASA/ESA scientific visualization (footage described per item). Narration is read aloud by an AI female voice (ElevenLabs).

HARD RULES per item:
- 40-52 words. One tight paragraph. Plain text only (no markdown, emojis, asterisks, or quotes).
- Spoken English, present tense, vivid and wondrous but accurate. Write numbers and units so a TTS reads them naturally (e.g. "forty million light-years", "two hundred times the mass of the Sun").
- Structure: a HOOK in the first 5-7 words that stops the scroll, then the jaw-dropping payoff, then a short punchy closing line. Never open with "Did you know" or "Imagine".
- Stay grounded in the item's SUBJECT and the footage DESCRIPTION. Do not invent specific false numbers; if unsure, stay qualitative.
- title: a punchy hook headline <= 42 characters, Title Case, no trailing period (e.g. "Jets Longer Than 140 Galaxies", "A Furnace That Melts Lead").
- Keep every item's opening DISTINCT — do not reuse the same first words or sentence shape across items.`

phase('Draft')
const draftPrompt = `${RULES}

Write narration + title for ALL ${topics.length} items below. Return StructuredOutput {items:[{id,title,narration}]} covering every id exactly once.

ITEMS:
${topics.map((t, i) => `${i + 1}. id: ${t.id}
   subject: ${t.subject}
   footage: ${(t.description || t.title || '').slice(0, 400)}`).join('\n')}`
const draft = await agent(draftPrompt, { label: 'draft-all', phase: 'Draft', schema: ITEM_SCHEMA, model: 'opus', effort: 'high' })

phase('Polish')
const polishPrompt = `${RULES}

Below are DRAFT narrations for ${topics.length} space Shorts. Polish ALL of them and return the final StructuredOutput {items:[...]} with every id.
Fix: any item over 52 words or under 40; weak or generic hooks; any two items that open with the same words or same shape (rewrite one); robotic phrasing; anything a TTS would mispronounce; titles over 42 chars or with trailing periods. Keep what is already strong. Keep each grounded in its subject.

DRAFTS (json):
${JSON.stringify(draft?.items || [], null, 1)}

SUBJECTS (for grounding):
${topics.map((t) => `${t.id}: ${t.subject}`).join('\n')}`
const final = await agent(polishPrompt, { label: 'polish-all', phase: 'Polish', schema: ITEM_SCHEMA, model: 'opus', effort: 'high' })

const items = (final?.items?.length ? final.items : draft?.items || [])
const wc = (s) => (s || '').trim().split(/\s+/).length
log(`narration ready: ${items.length} items; word counts ${items.map((i) => wc(i.narration)).join(',')}`)
return { items }
