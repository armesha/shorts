#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE = resolve(ROOT, "data/memes-en/cards.json");
const OUT_DIR = resolve(ROOT, "data/memes-pt");
const PER_TEMPLATE = 10;

const subjects = [
  "Eu",
  "Meu cérebro",
  "Minha paciência",
  "Meu plano",
  "Minha produtividade",
  "Meu orçamento",
  "Meu sono",
  "Minha motivação",
  "O grupo",
  "A reunião",
  "A segunda-feira",
  "O prazo",
  "A internet",
  "O aplicativo",
  "Minha lista de tarefas",
  "Meu lado responsável",
  "Meu lado impulsivo",
  "Minha concentração",
  "O café",
  "A notificação",
  "O Wi-Fi",
  "A conversa",
  "A rotina",
  "Meu humor",
];

const situations = [
  "tentando parecer normal",
  "depois de ouvir \"é rapidinho\"",
  "quando falta só um detalhe",
  "antes do primeiro café",
  "quando alguém muda o plano",
  "abrindo a agenda da semana",
  "prometendo dormir cedo",
  "lendo a mesma mensagem de novo",
  "quando a chamada podia ser um texto",
  "vendo a bateria em 1%",
  "tentando economizar",
  "quando a página finalmente carrega",
  "recebendo outra tarefa simples",
  "quando o silêncio fica estranho",
  "tentando responder com calma",
  "depois de cinco minutos de foco",
  "quando tudo parecia resolvido",
  "vendo o carrinho de compras",
  "quando chega a atualização",
  "tentando não abrir outra aba",
  "quando o plano B vira plano A",
  "depois de dizer \"eu cuido disso\"",
  "quando o lembrete aparece",
  "tentando manter a elegância",
];

const outcomes = [
  "e por dentro já abriu 20 abas",
  "mas a alma já saiu para intervalo",
  "com a energia de uma sexta chuvosa",
  "e fingindo que entendeu tudo",
  "mas calculando a fuga em silêncio",
  "com três ideias e nenhuma coragem",
  "e achando que isso conta como organização",
  "enquanto o caos faz fila",
  "com uma confiança totalmente emprestada",
  "e o relógio correndo mais rápido",
  "mas o sofá venceu por pontos",
  "e a senha foi esquecida de novo",
  "com cara de quem tem um método",
  "mas o método era sorte",
  "e a geladeira chamou primeiro",
  "com uma paz claramente temporária",
  "mas já preparando outra desculpa",
  "e ninguém precisava saber disso",
  "com o sorriso de quem aceitou o destino",
  "mas sem aceitar de verdade",
  "e a última neurônia pediu férias",
  "com drama suficiente para uma temporada",
  "mas pelo menos ficou bonito",
  "e agora parece problema de amanhã",
];

const safeClosers = [
  "vida adulta em uma imagem",
  "pequenas vitórias, grande cansaço",
  "tudo sob controle, segundo a minha cara",
  "o plano era simples até começar",
  "eu chamo isso de equilíbrio",
  "funcionou na minha cabeça",
  "ninguém avisou que era hoje",
  "a teoria estava perfeita",
  "a prática pediu demissão",
  "não era para ser tão real",
  "um minuto de silêncio pela organização",
  "parecia fácil no tutorial",
  "o importante é manter a pose",
  "foco, café e abas abertas",
  "o roteiro mudou sozinho",
  "respira e finge naturalidade",
  "modo sobrevivência ativado",
  "quase profissional",
  "muito conceito, pouca bateria",
  "o pensamento venceu a ação",
];

const contexts = [
  "no trabalho",
  "na reunião",
  "em casa",
  "na fila",
  "no domingo",
  "no grupo",
  "na cozinha",
  "no sofá",
  "no mercado",
  "no trânsito",
  "na chamada",
  "no elevador",
  "na pausa",
  "no almoço",
  "no escritório",
  "na mensagem",
  "no calendário",
  "na planilha",
  "no navegador",
  "no fim do dia",
  "na segunda",
  "na sexta",
  "no celular",
  "na entrega",
  "no orçamento",
  "na rotina",
  "no lembrete",
  "no projeto",
  "na conversa",
  "no checkout",
  "no tutorial",
  "na senha",
  "no Wi-Fi",
  "na agenda",
  "no relatório",
  "na notificação",
];

const flavors = [
  "sem manual",
  "por dentro",
  "com estilo",
  "na teoria",
  "quase lá",
  "em silêncio",
  "sem plateia",
  "versão beta",
  "modo turbo",
  "do nada",
  "com atraso",
  "sem roteiro",
  "de fininho",
  "quase bem",
  "em modo teste",
  "com pose",
  "no improviso",
  "em mini crise",
  "com suspense",
  "bem discreto",
  "com calma falsa",
  "meio oficial",
  "com cara séria",
  "em baixa energia",
  "com zero preparo",
  "na raça",
  "em modo avião",
  "no automático",
  "com muita opinião",
  "sem garantia",
  "em tela cheia",
];

const banned = [
  /\b(deus|cristo|santo|santa|igreja|padre|religião|religioso|inferno|pecado)\b|(^|\s)fé(\s|$)/i,
  /\b(matar|morre|morte|sangue|arma|guerra|bomba|crime|roubo|ladrão|ódio)\b/i,
  /\b(sexo|nudez|beijo|cama|amante|adultério|bêbado|vinho|cerveja)\b/i,
  /\b(preto|judeu|cigano|cego|surdo|aleijado|louco|idiota|burro)\b/i,
];

const source = JSON.parse(readFileSync(SOURCE, "utf8"));
const templates = [];
const seenPhoto = new Set();
for (const card of source) {
  if (!card?.photoFile || seenPhoto.has(card.photoFile)) continue;
  seenPhoto.add(card.photoFile);
  templates.push({ photoFile: card.photoFile, theme: card.theme || "", srcFile: card.srcFile || "" });
}

function captionFor(templateIndex, slot) {
  const i = templateIndex + 1;
  const line1 = `${subjects[(i + slot * 3) % subjects.length]} ${situations[(i * 5 + slot) % situations.length]}`;
  const flavor = flavors[(i * 19 + slot * 13) % flavors.length];
  const line2 = `${outcomes[(i * 7 + slot * 2) % outcomes.length]} ${flavor}`;
  const line3 = `${safeClosers[(i * 11 + slot * 5) % safeClosers.length]} ${flavor}`;
  return slot % 3 === 0 ? `${line1}\n${line3}` : `${line1}\n${line2}`;
}

function validateCaption(caption) {
  const lines = caption.split("\n");
  if (lines.length !== 2) return "expected two lines";
  if (caption.length < 18 || caption.length > 130) return "length out of range";
  if (lines.some((line) => line.length > 68)) return "line too long";
  if (banned.some((rule) => rule.test(caption))) return "banned term";
  return "";
}

const cards = [];
const seenCaptionPerPhoto = new Set();
for (const [templateIndex, template] of templates.entries()) {
  for (let slot = 0; slot < PER_TEMPLATE; slot++) {
    const caption = captionFor(templateIndex, slot);
    const error = validateCaption(caption);
    if (error) throw new Error(`bad caption for ${template.photoFile} #${slot}: ${error}: ${caption}`);
    const key = `${template.photoFile}\0${caption}`;
    if (seenCaptionPerPhoto.has(key)) continue;
    seenCaptionPerPhoto.add(key);
    cards.push({
      caption,
      photoFile: template.photoFile,
      format: "board",
      theme: template.theme,
      srcFile: template.srcFile,
    });
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "cards.json"), `${JSON.stringify(cards, null, 2)}\n`);
writeFileSync(
  resolve(OUT_DIR, "index.json"),
  `${JSON.stringify(
    {
      total: cards.length,
      packs: 1,
      packSize: cards.length,
      withPhoto: cards.length,
      range: [1, templates.length],
      source:
        "Original Portuguese captions over the existing local meme-board template image set. No new external images downloaded.",
      safety: {
        filters: "religion/adult/violence/protected-class blocklist + length checks",
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`memes-pt ready: ${cards.length} cards across ${templates.length} board templates`);
