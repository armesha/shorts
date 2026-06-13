// End-to-end smoke for the tips deck: real item from data/tips → profession render → MP4.
// Run: node --import tsx src/scripts/tips-e2e.ts
import { resolve } from "node:path";
import { produceAnecdoteVideo } from "../anecdotes/pipeline.ts";

const out = resolve(process.cwd(), "data/output");
for (let i = 0; i < 4; i++) {
  const v = await produceAnecdoteVideo(out, "tips");
  if (!v) {
    console.log("null — нет свободных советов");
    continue;
  }
  console.log(`OK bg=${v.bg} | «${v.title}» | ${v.text.slice(0, 64)}…`);
  console.log(`   img=${v.imagePath}`);
}
console.log("done");
