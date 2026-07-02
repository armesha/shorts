#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openDb } from "../server/db.ts";
import { parseCreds, updateChannelDescription, ytErrorReason } from "../server/services/youtube.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const argValue = (name, fallback = "") => {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
};

const APPLY = args.has("--apply");
const INCLUDE_AUTH_ERROR = args.has("--include-auth-error");
const DB_PATH = resolve(ROOT, argValue("--db", process.env.DATABASE_PATH || "data/app.db"));
const OUT = resolve(ROOT, argValue("--out", `data/output/channel-descriptions-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
const ONLY = new Set(
  argValue("--only")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter(Number.isFinite),
);

function cleanArray(raw, fallback = []) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed.map((x) => String(x || "").trim()).filter(Boolean) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeLang(lang) {
  const s = String(lang || "").trim().toLowerCase();
  return ["ru", "de", "it", "fr", "en", "ar", "es", "pt"].includes(s) ? s : "en";
}

function topicFrom(account, sources, longSources) {
  const joined = `${account.name} ${sources.join(" ")} ${longSources.join(" ")}`.toLowerCase();
  if (/islam|quran|hadith|dua|أذكار|آيات/.test(joined)) return "islamic";
  if (/christian|prayer|prayers|bible|gebet/.test(joined)) return "religion";
  if (/psych|mind|platon|seele|gedanken|психолог|психология|dark/.test(joined)) return "psychology";
  if (/illusion|rätsel|riddle|brain|ответ|labyrinth|иллюз/.test(joined)) return "illusions";
  if (/curiosaur|facts|fact|cosmo|space|nemo/.test(joined)) return "facts";
  if (/quote|quotes|zitate|цитат|weisheit/.test(joined) && !/meme|witz|анекдот|joke|laugh|reír|risat|rir|ضحك/.test(joined))
    return "quotes";
  return "humor";
}

function joinList(items, lang) {
  const unique = [...new Set(items.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 4);
  if (unique.length === 0) return "";
  const sep = lang === "ar" ? "، " : ", ";
  return unique.join(sep);
}

const topicWords = {
  ru: {
    jokes: "анекдоты",
    memes: "мемы",
    quotes: "цитаты",
    long: "длинные истории",
    psychology: "психология",
    illusions: "визуальные загадки",
    facts: "интересные факты",
    religion: "духовные тексты",
    islamic: "исламские напоминания",
  },
  de: {
    jokes: "Witze",
    memes: "Memes",
    quotes: "Zitate",
    long: "längere Geschichten",
    psychology: "Psychologie",
    illusions: "visuelle Rätsel",
    facts: "kurze Fakten",
    religion: "spirituelle Texte",
    islamic: "islamische Erinnerungen",
  },
  en: {
    jokes: "jokes",
    memes: "memes",
    quotes: "quotes",
    long: "longer stories",
    psychology: "psychology",
    illusions: "visual riddles",
    facts: "curious facts",
    religion: "spiritual reflections",
    islamic: "Islamic reminders",
  },
  it: {
    jokes: "barzellette",
    memes: "meme",
    quotes: "citazioni",
    long: "storie più lunghe",
    psychology: "psicologia",
    illusions: "enigmi visivi",
    facts: "curiosità",
    religion: "testi spirituali",
    islamic: "promemoria islamici",
  },
  fr: {
    jokes: "blagues",
    memes: "memes",
    quotes: "citations",
    long: "histoires plus longues",
    psychology: "psychologie",
    illusions: "énigmes visuelles",
    facts: "faits curieux",
    religion: "textes spirituels",
    islamic: "rappels islamiques",
  },
  es: {
    jokes: "chistes",
    memes: "memes",
    quotes: "citas",
    long: "historias largas",
    psychology: "psicología",
    illusions: "acertijos visuales",
    facts: "curiosidades",
    religion: "textos espirituales",
    islamic: "recordatorios islámicos",
  },
  pt: {
    jokes: "piadas",
    memes: "memes",
    quotes: "citações",
    long: "histórias longas",
    psychology: "psicologia",
    illusions: "enigmas visuais",
    facts: "curiosidades",
    religion: "textos espirituais",
    islamic: "lembretes islâmicos",
  },
  ar: {
    jokes: "نكات",
    memes: "ميمز",
    quotes: "اقتباسات",
    long: "قصص أطول",
    psychology: "علم النفس",
    illusions: "ألغاز بصرية",
    facts: "حقائق قصيرة",
    religion: "نصوص روحية",
    islamic: "تذكيرات إسلامية",
  },
};

function sourceSummary(account, lang, topic) {
  const joined = `${account.name} ${account.sourceDecks.join(" ")} ${account.longVideoDecks.join(" ")}`.toLowerCase();
  const words = topicWords[lang] || topicWords.en;
  const items = [];
  if (/islam|quran|hadith|dua|islamic|أذكار|آيات/.test(joined)) items.push(words.islamic);
  if (/christian|prayer|prayers|bible|gebet|platon|seele/.test(joined)) items.push(words.religion);
  if (/psych|mind|психолог|психология|gedanken|dark/.test(joined)) items.push(words.psychology);
  if (/illusion|rätsel|riddle|brain|ответ|labyrinth|иллюз/.test(joined)) items.push(words.illusions);
  if (/curiosaur|facts|fact|cosmo|space|nemo/.test(joined)) items.push(words.facts);
  if (/meme|мем/.test(joined)) items.push(words.memes);
  if (/quote|quotes|zitate|цитат|weisheit/.test(joined)) items.push(words.quotes);
  if (/long/.test(joined)) items.push(words.long);
  if (topic === "humor" || /witz|joke|laugh|reír|risat|rir|ضحك|анекдот|шутк|barzellette|blague|chiste|piada/.test(joined)) {
    items.unshift(words.jokes);
  }
  if (!items.length) items.push(words[topic] || words.jokes);
  return joinList(items, lang);
}

const copy = {
  ru: {
    humor:
      "{name} - канал с короткими роликами для быстрого настроения: анекдоты, мемы, смешные наблюдения, цитаты и легкие истории в формате Shorts. Здесь выходят новые подборки по темам: {sources}. Подписывайтесь, если хочется каждый день находить короткий повод улыбнуться, переслать ролик друзьям или просто отвлечься на минуту.",
    quotes:
      "{name} - короткие цитаты, мысли и наблюдения, собранные в удобном формате Shorts. На канале выходят ролики по темам: {sources}. Это место для быстрых идей, сильных формулировок и фраз, которые хочется сохранить, переслать или обдумать позже.",
    psychology:
      "{name} - короткие психологические заметки, жизненные наблюдения и мысли о поведении людей. В роликах используются темы: {sources}. Канал для тех, кто любит замечать детали, понимать мотивы, узнавать себя и смотреть на обычные ситуации чуть глубже.",
    illusions:
      "{name} - короткие визуальные загадки, оптические иллюзии и ролики на внимательность. Основные темы: {sources}. Смотрите, проверяйте восприятие, ищите ответ и возвращайтесь за новыми задачами для глаз и мозга.",
    facts:
      "{name} - короткие факты, любопытные объяснения и необычные наблюдения в формате Shorts. Темы канала: {sources}. Здесь можно быстро узнать что-то новое, удивиться деталям и сохранить интересные ролики на потом.",
    religion:
      "{name} - спокойные короткие ролики с духовными текстами, цитатами и размышлениями. Темы канала: {sources}. Подходит для паузы, вдохновения и внимательного чтения в течение дня.",
    islamic:
      "{name} - короткие исламские напоминания, аяты, дуа и полезные духовные тексты. Темы канала: {sources}. Спокойный формат Shorts для ежедневного напоминания, размышления и сохранения важных слов.",
  },
  de: {
    humor:
      "{name} bringt kurze Unterhaltung für zwischendurch: Witze, Memes, pointierte Sprüche, kleine Alltagsszenen und schnelle Shorts zum Teilen. Die Inhalte kommen aus diesen Themen: {sources}. Abonnieren lohnt sich, wenn du regelmäßig kurze Clips für gute Laune, eine Pause im Alltag und neue lustige Gedanken sehen möchtest.",
    quotes:
      "{name} sammelt kurze Zitate, Gedanken und kluge Formulierungen im Shorts-Format. Die Schwerpunkte sind: {sources}. Hier findest du Sätze zum Nachdenken, Speichern und Teilen - kompakt, ruhig und regelmäßig neu.",
    psychology:
      "{name} zeigt kurze psychologische Impulse, Beobachtungen über Menschen und Gedanken zu Beziehungen, Verhalten und Alltag. Die Themenbasis: {sources}. Für alle, die Situationen genauer verstehen, Muster erkennen und kurze Denkanstöße mitnehmen möchten.",
    illusions:
      "{name} steht für optische Illusionen, Rätsel, Aufmerksamkeitstests und kurze Clips, die Wahrnehmung herausfordern. Die Themen: {sources}. Schau genau hin, prüfe deine Antwort und entdecke regelmäßig neue visuelle Aufgaben.",
    facts:
      "{name} liefert kurze Fakten, erstaunliche Details und verständliche Erklärungen im Shorts-Format. Die Themen: {sources}. Ideal für alle, die schnell etwas Neues lernen und interessante Clips speichern oder teilen möchten.",
    religion:
      "{name} veröffentlicht ruhige kurze Videos mit Gebeten, Zitaten und spirituellen Gedanken. Die Themen: {sources}. Ein Kanal für tägliche Pausen, Nachdenken und inspirierende Worte.",
    islamic:
      "{name} veröffentlicht kurze islamische Erinnerungen, Zitate, Bittgebete und ruhige spirituelle Impulse. Die Themen: {sources}. Für tägliche Besinnung, Nachdenken und kurze Momente der Ruhe.",
  },
  en: {
    humor:
      "{name} is a Shorts channel for quick entertainment: jokes, memes, funny observations, sharp quotes and light everyday moments. The channel is built around: {sources}. Subscribe for regular short videos you can watch in a minute, share with friends, or save for a quick mood reset.",
    quotes:
      "{name} shares short quotes, thoughtful lines and memorable ideas in a clean Shorts format. Main themes: {sources}. A place for words worth saving, quick reflection and compact inspiration throughout the day.",
    psychology:
      "{name} explores psychology, behavior, relationships and the hidden patterns behind everyday choices. The channel uses these themes: {sources}. Short videos for viewers who like practical insight, deeper questions and ideas that stay with you.",
    illusions:
      "{name} publishes visual riddles, optical illusions, attention tests and short brain challenges. Main themes: {sources}. Watch closely, test your perception and come back for new puzzles made for quick viewing.",
    facts:
      "{name} shares short facts, curious explanations and surprising details in a fast Shorts format. Main themes: {sources}. Subscribe for quick discoveries, compact learning and clips that are easy to save or share.",
    religion:
      "{name} offers calm short videos with prayers, reflections, quotes and spiritual reminders. Main themes: {sources}. A quiet place for daily inspiration, thoughtful pauses and meaningful words.",
    islamic:
      "{name} shares short Islamic reminders, duas, reflections and meaningful spiritual texts. Main themes: {sources}. A calm Shorts format for daily reflection, useful reminders and words worth saving.",
  },
  it: {
    humor:
      "{name} pubblica Shorts leggeri e veloci: barzellette, meme, battute, citazioni e piccoli momenti divertenti. I contenuti ruotano attorno a: {sources}. Iscriviti per una pausa quotidiana, video brevi da condividere e nuove idee per sorridere in pochi secondi.",
    quotes:
      "{name} raccoglie citazioni brevi, pensieri e frasi memorabili in formato Shorts. Temi principali: {sources}. Un canale per salvare parole utili, riflettere velocemente e trovare piccoli spunti ogni giorno.",
    psychology:
      "{name} propone brevi spunti di psicologia, comportamento umano, relazioni e osservazioni quotidiane. Temi: {sources}. Per chi ama capire meglio le persone, riconoscere schemi e portare con sé idee semplici ma profonde.",
    illusions:
      "{name} pubblica illusioni ottiche, enigmi visivi e test di attenzione in formato Shorts. Temi principali: {sources}. Guarda con attenzione, metti alla prova la percezione e torna per nuove sfide rapide.",
    facts:
      "{name} condivide fatti brevi, curiosità e spiegazioni semplici in formato Shorts. Temi principali: {sources}. Perfetto per scoprire qualcosa di nuovo in poco tempo e salvare i video più interessanti.",
    religion:
      "{name} pubblica brevi video spirituali con preghiere, citazioni e riflessioni calme. Temi: {sources}. Uno spazio per una pausa, un pensiero e parole da conservare durante la giornata.",
    islamic:
      "{name} condivide brevi promemoria islamici, dua, riflessioni e testi spirituali significativi. Temi: {sources}. Un formato calmo per ricordare, riflettere e salvare parole importanti.",
  },
  fr: {
    humor:
      "{name} propose des Shorts rapides pour sourire: blagues, memes, observations drôles, citations et petits moments du quotidien. Les thèmes principaux sont: {sources}. Abonnez-vous pour une pause légère, des vidéos courtes à partager et une dose régulière de bonne humeur.",
    quotes:
      "{name} rassemble des citations courtes, des pensées et des phrases marquantes au format Shorts. Thèmes: {sources}. Un espace pour garder des mots utiles, réfléchir rapidement et revenir à des idées simples mais fortes.",
    psychology:
      "{name} explore en vidéos courtes la psychologie, les comportements, les relations et les détails du quotidien. Thèmes: {sources}. Pour celles et ceux qui aiment comprendre les réactions humaines et garder des idées qui font réfléchir.",
    illusions:
      "{name} publie des illusions d'optique, énigmes visuelles et tests d'attention au format Shorts. Thèmes: {sources}. Regardez bien, testez votre perception et revenez pour de nouveaux défis rapides.",
    facts:
      "{name} partage des faits courts, curiosités et explications simples au format Shorts. Thèmes: {sources}. Une façon rapide d'apprendre, de s'étonner et de sauvegarder les vidéos les plus intéressantes.",
    religion:
      "{name} propose de courtes vidéos spirituelles avec prières, citations et réflexions calmes. Thèmes: {sources}. Un espace pour faire une pause, réfléchir et garder des mots importants.",
    islamic:
      "{name} partage de courts rappels islamiques, duas, réflexions et textes spirituels. Thèmes: {sources}. Un format calme pour la réflexion quotidienne et les mots à conserver.",
  },
  es: {
    humor:
      "{name} publica Shorts rápidos para reír: chistes, memes, frases graciosas, citas y pequeños momentos cotidianos. Los temas principales son: {sources}. Suscríbete para recibir videos breves, fáciles de compartir y perfectos para una pausa con buen humor.",
    quotes:
      "{name} reúne citas breves, ideas y frases memorables en formato Shorts. Temas principales: {sources}. Un canal para guardar palabras útiles, pensar un momento y volver a ideas que dejan huella.",
    psychology:
      "{name} explora psicología, comportamiento humano, relaciones y observaciones cotidianas en videos cortos. Temas: {sources}. Para quienes disfrutan entender mejor a las personas y descubrir patrones detrás de lo normal.",
    illusions:
      "{name} publica ilusiones ópticas, acertijos visuales y pruebas de atención en formato Shorts. Temas: {sources}. Mira con cuidado, pon a prueba tu percepción y vuelve por nuevos retos rápidos.",
    facts:
      "{name} comparte datos breves, curiosidades y explicaciones sencillas en formato Shorts. Temas: {sources}. Ideal para aprender algo nuevo en poco tiempo y guardar los videos más interesantes.",
    religion:
      "{name} ofrece videos cortos y tranquilos con oraciones, citas y reflexiones espirituales. Temas: {sources}. Un espacio para una pausa diaria, inspiración y palabras con sentido.",
    islamic:
      "{name} comparte recordatorios islámicos breves, duas, reflexiones y textos espirituales. Temas: {sources}. Un formato tranquilo para la reflexión diaria y palabras que vale la pena guardar.",
  },
  pt: {
    humor:
      "{name} publica Shorts rápidos para rir: piadas, memes, frases engraçadas, citações e pequenos momentos do dia a dia. Os temas principais são: {sources}. Inscreva-se para receber vídeos curtos, fáceis de compartilhar e perfeitos para uma pausa com bom humor.",
    quotes:
      "{name} reúne citações curtas, pensamentos e frases marcantes em formato Shorts. Temas principais: {sources}. Um canal para salvar palavras úteis, refletir rapidamente e voltar a ideias que ficam na memória.",
    psychology:
      "{name} explora psicologia, comportamento humano, relações e observações do cotidiano em vídeos curtos. Temas: {sources}. Para quem gosta de entender melhor as pessoas e perceber padrões por trás de situações comuns.",
    illusions:
      "{name} publica ilusões de ótica, enigmas visuais e testes de atenção em formato Shorts. Temas: {sources}. Observe com cuidado, teste sua percepção e volte para novos desafios rápidos.",
    facts:
      "{name} compartilha fatos curtos, curiosidades e explicações simples em formato Shorts. Temas: {sources}. Ideal para aprender algo novo em pouco tempo e salvar os vídeos mais interessantes.",
    religion:
      "{name} oferece vídeos curtos e tranquilos com orações, citações e reflexões espirituais. Temas: {sources}. Um espaço para pausa diária, inspiração e palavras com significado.",
    islamic:
      "{name} compartilha lembretes islâmicos curtos, duas, reflexões e textos espirituais. Temas: {sources}. Um formato calmo para reflexão diária e palavras que vale a pena guardar.",
  },
  ar: {
    humor:
      "{name} قناة Shorts للترفيه السريع: نكات، ميمز، مواقف خفيفة، اقتباسات ولقطات قصيرة تصلح للمشاركة. تعتمد القناة على هذه المواضيع: {sources}. اشترك لتجد كل يوم فيديو قصيرا يرفع المزاج، يضحكك في دقيقة، أو ترسله للأصدقاء بسهولة.",
    quotes:
      "{name} تقدم اقتباسات قصيرة، أفكارا مؤثرة وعبارات تستحق الحفظ في صيغة Shorts. المواضيع الأساسية: {sources}. قناة للكلمات الهادئة، التأمل السريع، والجمل التي يمكن الرجوع إليها لاحقا.",
    psychology:
      "{name} تقدم ملاحظات قصيرة عن علم النفس، السلوك، العلاقات والاختيارات اليومية. المواضيع: {sources}. لمن يحب فهم الناس بشكل أعمق، ملاحظة الأنماط، واكتشاف أفكار بسيطة تبقى في الذهن.",
    illusions:
      "{name} تنشر خدعا بصرية، ألغازا مرئية واختبارات انتباه في مقاطع Shorts قصيرة. المواضيع: {sources}. ركز جيدا، اختبر إدراكك، وعد لمشاهدة تحديات جديدة للعين والعقل.",
    facts:
      "{name} تقدم حقائق قصيرة، معلومات غريبة وشرحا بسيطا في صيغة Shorts. المواضيع: {sources}. اشترك لاكتشاف شيء جديد بسرعة، حفظ المقاطع المفيدة، ومشاركة التفاصيل المدهشة.",
    religion:
      "{name} تقدم مقاطع قصيرة هادئة فيها أدعية، اقتباسات وتأملات روحية. المواضيع: {sources}. مساحة بسيطة للتذكير اليومي، الهدوء، والكلمات التي تستحق التأمل.",
    islamic:
      "{name} تقدم تذكيرات إسلامية قصيرة، آيات، أدعية ونصوصا نافعة بصيغة هادئة. المواضيع: {sources}. قناة للتأمل اليومي، حفظ الكلمات المهمة، والعودة إلى معان مفيدة خلال اليوم.",
  },
};

function descriptionFor(db, account) {
  const lang = normalizeLang(account.channelLang || account.lang);
  const topic = topicFrom(account, account.sourceDecks, account.longVideoDecks);
  const template = copy[lang]?.[topic] || copy.en[topic] || copy.en.humor;
  const sources = sourceSummary(account, lang, topic) || account.name;
  return template.replaceAll("{name}", String(account.name || account.ytTitle || "Channel").trim()).replaceAll("{sources}", sources);
}

const db = openDb(DB_PATH);
const rows = db.db
  .prepare(
    `SELECT id, user_id, channel_name, yt_channel_title, yt_channel_id, channel_lang, lang,
            source_decks, long_video_decks, yt_refresh_token, oauth_client_id, auth_error
       FROM accounts
      WHERE yt_channel_id IS NOT NULL AND TRIM(yt_channel_id) != ''
      ORDER BY id`,
  )
  .all();

const accounts = rows
  .map((row) => ({
    id: Number(row.id),
    userId: row.user_id == null ? null : Number(row.user_id),
    name: String(row.channel_name || row.yt_channel_title || `#${row.id}`),
    ytTitle: row.yt_channel_title ? String(row.yt_channel_title) : null,
    ytChannelId: String(row.yt_channel_id),
    channelLang: normalizeLang(row.channel_lang || row.lang),
    lang: String(row.lang || ""),
    sourceDecks: cleanArray(row.source_decks, []),
    longVideoDecks: cleanArray(row.long_video_decks, []),
    refreshToken: row.yt_refresh_token ? String(row.yt_refresh_token) : "",
    oauthClientId: row.oauth_client_id == null ? null : Number(row.oauth_client_id),
    authError: row.auth_error ? String(row.auth_error) : null,
  }))
  .filter((account) => ONLY.size === 0 || ONLY.has(account.id));

const results = [];
for (const account of accounts) {
  const description = descriptionFor(db, account);
  const base = {
    accountId: account.id,
    channelId: account.ytChannelId,
    channelName: account.name,
    channelLang: account.channelLang,
    sourceDecks: account.sourceDecks,
    longVideoDecks: account.longVideoDecks,
    description,
    descriptionLength: description.length,
  };

  if (account.authError && !INCLUDE_AUTH_ERROR) {
    results.push({ ...base, status: "skipped", reason: "auth_error" });
    continue;
  }
  if (!account.refreshToken) {
    results.push({ ...base, status: "skipped", reason: "missing_refresh_token" });
    continue;
  }

  const clientJson = db.oauthClientSecretForAccount(db.getAccount(account.id));
  if (!clientJson) {
    results.push({ ...base, status: "skipped", reason: "missing_oauth_client" });
    continue;
  }

  if (!APPLY) {
    results.push({ ...base, status: "dry_run" });
    continue;
  }

  try {
    const updated = await updateChannelDescription(parseCreds(clientJson), process.env.GOOGLE_OAUTH_REDIRECT || "http://localhost:8080/api/youtube/callback", account.refreshToken, description);
    results.push({ ...base, status: "updated", youtubeTitle: updated.title });
  } catch (err) {
    results.push({ ...base, status: "failed", reason: ytErrorReason(err) });
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ apply: APPLY, dbPath: DB_PATH, count: results.length, results }, null, 2)}\n`);

const summary = results.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ apply: APPLY, out: OUT, count: results.length, summary }, null, 2));
if (!APPLY) console.log("Dry-run only. Re-run with --apply to update YouTube descriptions.");
