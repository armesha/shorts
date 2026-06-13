// Smoke-test the anecdote render tweak (bigger max font, capped line-height) on dense Italian text.
//   node --import tsx src/scripts/render-it-test.ts
import { resolve } from "node:path";
import { renderAnecdote } from "../anecdotes/render.ts";

const CH = "Barzellette Italiane";
const SAMPLES = [
  {
    title: "Vivere fino a 100 anni",
    text:
      "Un signore va dal dottore e gli chiede se potrà vivere fino a 100 anni.\n" +
      "Il dottore gli chiede: «Lei beve? O fuma?»\n«No, mai» risponde il paziente.\n" +
      "«Conduce una vita disordinata, guida oltre i limiti di velocità?»\n«Mai fatto.»\n" +
      "«Va spesso a donne?»\n«Mai, dottore.»\n«E allora perché mai vuole vivere fino a 100 anni?»",
  },
  {
    title: "La pagella di Pierino",
    text:
      "Pierino torna a casa con la pagella e dice al papà: «Ho una buona e una cattiva notizia.»\n" +
      "«Comincia da quella cattiva.»\n«Sono stato bocciato in tutte le materie.»\n" +
      "Il papà, furioso: «E quale sarebbe la buona notizia?!»\n" +
      "E Pierino, tutto contento: «Che la maestra dice che sono identico a te. Quindi, papà, " +
      "è chiaramente un problema di famiglia!»",
  },
  {
    title: "Senti questa",
    text:
      "Due amici al bar. «Sai, ho smesso di fumare.» «Bravo, e come hai fatto?» " +
      "«Ho seguito il consiglio del dottore.» «E cioè?» «Mi ha detto di non comprare più sigarette.»",
  },
];

async function main() {
  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    const out = resolve(process.cwd(), `data/output/it-test-${i + 1}.png`);
    const r = await renderAnecdote({ ...s, channel: CH, deck: "it" }, out);
    console.log(`#${i + 1} chars=${s.text.length} font=${r.fontPx}px bg=${r.bg} -> ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
