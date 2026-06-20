export const meta = {
  name: "curate-doc-fragments",
  description: "Pick clean-footage self-contained fragments from narrated PD space docs",
  phases: [{ title: "Curate" }],
}
const SRCS = [{"id":"JPL-20220622-MARSRf-0001-Mars_Report","title":"How Scientists Study Wind on Mars (NASA Mars News Report June 22, 2022) ","dur":187,"cs":"/tmp/doc-cs/JPL-20220622-MARSRf-0001-Mars_Report.jpg","srt":"/tmp/doc-srt/JPL-20220622-MARSRf-0001-Mars_Report.txt"},{"id":"JPL-20230803-MARSf-0001-Mars_Report_Curi","title":"Curiosity Rover’s Most Challenging Climb Yet (Mars Report - August 2023)","dur":178,"cs":"/tmp/doc-cs/JPL-20230803-MARSf-0001-Mars_Report_Curi.jpg","srt":"/tmp/doc-srt/JPL-20230803-MARSf-0001-Mars_Report_Curi.txt"},{"id":"JPL-20230208-MSLf-0001-Curiosity_Finds_N","title":"NASA’s Curiosity Rover Finds New Clues to Mars’ Watery Past","dur":190,"cs":"/tmp/doc-cs/JPL-20230208-MSLf-0001-Curiosity_Finds_N.jpg","srt":"/tmp/doc-srt/JPL-20230208-MSLf-0001-Curiosity_Finds_N.txt"},{"id":"JPL-20210520-M2020f-0001-Mars_Report_May","title":"Mars Report: Update on NASA’s Perseverance Rover & Curiosity Rover (May 20, 2021)","dur":276,"cs":"/tmp/doc-cs/JPL-20210520-M2020f-0001-Mars_Report_May.jpg","srt":"/tmp/doc-srt/JPL-20210520-M2020f-0001-Mars_Report_May.txt"},{"id":"GSFC_20120629_SAM_m11018_What_is","title":"Sample Analysis at Mars (SAM) Overview","dur":128,"cs":"/tmp/doc-cs/GSFC_20120629_SAM_m11018_What_is.jpg","srt":"/tmp/doc-srt/GSFC_20120629_SAM_m11018_What_is.txt"},{"id":"JPL-20240912_MSLf-0001-Mars_Report_Commu","title":"Earth to Mars: How NASA Keeps Curiosity Connected (Mars Report) ","dur":120,"cs":"/tmp/doc-cs/JPL-20240912_MSLf-0001-Mars_Report_Commu.jpg","srt":"/tmp/doc-srt/JPL-20240912_MSLf-0001-Mars_Report_Commu.txt"},{"id":"GSFC_20180824_M13051_orex_approach","title":"NASA's OSIRIS-REx Approaches Asteroid Bennu","dur":319,"cs":"/tmp/doc-cs/GSFC_20180824_M13051_orex_approach.jpg","srt":"/tmp/doc-srt/GSFC_20180824_M13051_orex_approach.txt"},{"id":"GSFC_20201016_M13733_BennuIn360","title":"Sample Asteroid Bennu in 360","dur":213,"cs":"/tmp/doc-cs/GSFC_20201016_M13733_BennuIn360.jpg","srt":"/tmp/doc-srt/GSFC_20201016_M13733_BennuIn360.txt"},{"id":"GSFC_20200227_M13565_Nightingale","title":"Asteroid Bennu: Selecting Site Nightingale","dur":214,"cs":"/tmp/doc-cs/GSFC_20200227_M13565_Nightingale.jpg","srt":"/tmp/doc-srt/GSFC_20200227_M13565_Nightingale.txt"},{"id":"GSFC_20201014_M13730_COT","title":"NASAs Asteroid Heist: The Challenges of TAG","dur":285,"cs":"/tmp/doc-cs/GSFC_20201014_M13730_COT.jpg","srt":"/tmp/doc-srt/GSFC_20201014_M13730_COT.txt"},{"id":"GSFC_20090318_SED_m10411_Top_5_No_1","title":"The Top 5 Solar Discoveries Number 1","dur":101,"cs":"/tmp/doc-cs/GSFC_20090318_SED_m10411_Top_5_No_1.jpg","srt":"/tmp/doc-srt/GSFC_20090318_SED_m10411_Top_5_No_1.txt"},{"id":"GSFC_20090318_SED_m10411_Top_5_No_3","title":"The Top 5 Solar Discoveries Number 3","dur":101,"cs":"/tmp/doc-cs/GSFC_20090318_SED_m10411_Top_5_No_3.jpg","srt":"/tmp/doc-srt/GSFC_20090318_SED_m10411_Top_5_No_3.txt"},{"id":"GSFC_20090318_SED_m10411_Intro_and_No_5","title":"The Top 5 Solar Discoveries Intro and Number 5","dur":112,"cs":"/tmp/doc-cs/GSFC_20090318_SED_m10411_Intro_and_No_5.jpg","srt":"/tmp/doc-srt/GSFC_20090318_SED_m10411_Intro_and_No_5.txt"},{"id":"GSFC_20090318_SED_m10411_Top_5_No_4","title":"The Top 5 Solar Discoveries Number 4","dur":70,"cs":"/tmp/doc-cs/GSFC_20090318_SED_m10411_Top_5_No_4.jpg","srt":"/tmp/doc-srt/GSFC_20090318_SED_m10411_Top_5_No_4.txt"},{"id":"299_ImpactsOfSL9","title":"NASA ScienceCasts: The Lasting Impacts of Comet Shoemaker-Levy 9","dur":239,"cs":"/tmp/doc-cs/299_ImpactsOfSL9.jpg","srt":"/tmp/doc-srt/299_ImpactsOfSL9.txt"},{"id":"298_MU69","title":"NASA ScienceCasts: Watch the History of our Solar System Fly By with MU69","dur":248,"cs":"/tmp/doc-cs/298_MU69.jpg","srt":"/tmp/doc-srt/298_MU69.txt"},{"id":"JPL-20231222-SOLSYSf-0001-NASA_Telescope","title":"NASA Telescopes Reveal an Invisible Infrared Universe","dur":93,"cs":"/tmp/doc-cs/JPL-20231222-SOLSYSf-0001-NASA_Telescope.jpg","srt":"/tmp/doc-srt/JPL-20231222-SOLSYSf-0001-NASA_Telescope.txt"},{"id":"GSFC_20181108_FERMI_m13042_Luck4K","title":"NASA's Fermi Mission Shows How Luck Favors the Prepared","dur":304,"cs":"/tmp/doc-cs/GSFC_20181108_FERMI_m13042_Luck4K.jpg","srt":"/tmp/doc-srt/GSFC_20181108_FERMI_m13042_Luck4K.txt"}];
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["id","fragments"],
  properties: { id:{type:"string"}, fragments:{type:"array", items:{
    type:"object", additionalProperties:false, required:["start","end","title"],
    properties:{ start:{type:"number"}, end:{type:"number"}, title:{type:"string",description:"punchy hook <=42 chars"}, reason:{type:"string"} } } } }
}
function prompt(s){
  return [
    "You curate vertical (9:16) space Shorts from a FREE-LICENSE NASA documentary (narration over footage).",
    `Source id: ${s.id}`, `Title: ${s.title}`, `Duration: ${s.dur}s`,
    "",
    `1. Read the contact-sheet image at: ${s.cs}`,
    "   It is a grid of frames sampled every ~12 seconds; each frame is labeled with its timecode (e.g. 48s). Use it to SEE what the footage looks like at each time.",
    `2. Read the transcript at: ${s.srt}`,
    "   Lines are [Ns] spoken text.",
    "",
    "Pick UP TO 2 fragments (each 18-45 seconds) where BOTH are true:",
    " (a) FOOTAGE in that window is clean cinematic SPACE imagery / orbital or telescope footage / experiment footage in space — NOT a website-or-app screenshot, NOT an on-screen host/person talking to camera, NOT a slide/diagram/graph/chart, NOT a title card or logo. Verify using the contact-sheet timecodes around start..end.",
    " (b) the spoken text in that window is a self-contained, interesting passage (hook + payoff), starting and ending on sentence boundaries.",
    "",
    "For each fragment return {start, end (seconds, on sentence boundaries), title (punchy <=42 char hook), reason}.",
    "Pick the cleanest + most interesting windows. If the whole video is host/screenshots/slides with no clean cinematic space window, return fragments: [].",
  ].join("\n");
}
phase("Curate")
const results = await parallel(SRCS.map((s)=>()=>agent(prompt(s),{label:`curate:${s.id}`,phase:"Curate",schema:SCHEMA,model:"opus",agentType:"general-purpose"})))
const clean = results.filter(Boolean)
const frags = clean.flatMap((r)=>(r.fragments||[]).map((f)=>({src:r.id,...f})))
log(`fragments: ${frags.length} from ${clean.filter((r)=>r.fragments?.length).length} sources`)
return { results: clean, fragments: frags }
