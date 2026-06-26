import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = 1000;

function fill(template, values) {
  return template.replace(/\{([a-z])\}/g, (_, key) => values[key] ?? "");
}

function itemKey(lang, index) {
  return `funny-quote:${lang}:${String(index).padStart(4, "0")}`;
}

const DATA = {
  ru: {
    dir: "data/funny-quotes-ru",
    language: "ru",
    authors: ["Офисный философ", "Кухонная мудрость", "Домашний стратег", "Эксперт по понедельникам", "Анонимный оптимист"],
    a: ["кофе", "будильник", "диван", "план", "холодильник", "носки", "дедлайн", "зарядка", "чай", "пульт", "список дел", "понедельник", "пятница", "Wi-Fi", "зонт", "обед", "календарь", "кроссовки", "чемодан", "таймер"],
    b: ["терпение", "улыбку", "паузу", "ещё один чай", "режим экономии", "план Б", "спокойный вид", "лишнюю минуту", "маленькую победу", "гениальную отговорку"],
    c: ["на кухне", "в понедельник", "после обеда", "до кофе", "в групповом чате", "перед дедлайном", "после будильника", "в очереди", "на диване", "у холодильника"],
    tails: ["Так и живём.", "Проверено практикой.", "Звучит почти научно.", "Главное — уверенный вид.", "Записываю в стратегию."],
    templates: [
      "Если {a} не помогает, добавь {b}. Хуже не станет, зато появится стратегия.",
      "Мой главный талант {c}: выглядеть занятым, пока {a} решает всё само.",
      "{a} учит простому: иногда лучший план — это {b} и не паниковать.",
      "Я не ленюсь. Я просто даю {a} время понять свою ошибку.",
      "Серьёзный человек делает выводы. Умный человек сначала ищет {b}.",
      "{c} любая проблема выглядит меньше, если рядом есть {a}.",
      "Опыт — это когда {a} уже падал, а ты всё равно называешь это экспериментом.",
      "Если день начался странно, значит {a} решил добавить сюжета.",
      "Взрослая жизнь — это когда {b} звучит как настоящий план.",
      "Не откладывай на завтра то, что {a} может забыть уже сегодня.",
    ],
  },
  en: {
    dir: "data/funny-quotes-en",
    language: "en",
    authors: ["Office Philosopher", "Kitchen Wisdom", "Couch Strategist", "Monday Expert", "Anonymous Optimist"],
    a: ["coffee", "the alarm", "the couch", "the plan", "the fridge", "socks", "the deadline", "the charger", "tea", "the remote", "the to-do list", "Monday", "Friday", "Wi-Fi", "the umbrella", "lunch", "the calendar", "sneakers", "the suitcase", "the timer"],
    b: ["patience", "a smile", "a pause", "one more coffee", "economy mode", "plan B", "a calm face", "one extra minute", "a small win", "a brilliant excuse"],
    c: ["in the kitchen", "on Monday", "after lunch", "before coffee", "in the group chat", "before a deadline", "after the alarm", "in a queue", "on the couch", "near the fridge"],
    tails: ["That is the strategy.", "Tested by real life.", "It sounds almost scientific.", "Confidence is half the plan.", "Put it in the manual."],
    templates: [
      "If {a} does not help, add {b}. It may not solve anything, but it looks strategic.",
      "My main talent {c}: looking busy while {a} solves itself.",
      "{a} teaches one thing: sometimes the best plan is {b} and no panic.",
      "I am not procrastinating. I am giving {a} time to understand its mistake.",
      "A serious person makes conclusions. A smart person first looks for {b}.",
      "{c}, every problem feels smaller when {a} is nearby.",
      "Experience is when {a} has failed before and you still call it research.",
      "If the day starts weird, {a} probably added a plot twist.",
      "Adulthood is when {b} sounds like a real plan.",
      "Never postpone until tomorrow what {a} can forget today.",
    ],
  },
  de: {
    dir: "data/funny-quotes-de",
    language: "de",
    authors: ["Bürophilosoph", "Küchenweisheit", "Sofa-Stratege", "Montagsexperte", "Anonymer Optimist"],
    a: ["Kaffee", "der Wecker", "das Sofa", "der Plan", "der Kühlschrank", "Socken", "die Deadline", "das Ladekabel", "Tee", "die Fernbedienung", "die To-do-Liste", "der Montag", "der Freitag", "das WLAN", "der Regenschirm", "das Mittagessen", "der Kalender", "Turnschuhe", "der Koffer", "der Timer"],
    b: ["Geduld", "ein Lächeln", "eine Pause", "noch einen Kaffee", "Sparmodus", "Plan B", "ein ruhiges Gesicht", "eine extra Minute", "einen kleinen Sieg", "eine brillante Ausrede"],
    c: ["in der Küche", "am Montag", "nach dem Mittagessen", "vor dem Kaffee", "im Gruppenchat", "kurz vor der Deadline", "nach dem Wecker", "in der Warteschlange", "auf dem Sofa", "am Kühlschrank"],
    tails: ["Das ist die Strategie.", "Vom Alltag geprüft.", "Klingt fast wissenschaftlich.", "Hauptsache, der Blick stimmt.", "Kommt ins Handbuch."],
    templates: [
      "Wenn {a} nicht hilft, füge {b} hinzu. Es wirkt wenigstens strategisch.",
      "Mein größtes Talent {c}: beschäftigt aussehen, während {a} sich selbst löst.",
      "{a} lehrt: Manchmal ist der beste Plan einfach {b} und keine Panik.",
      "Ich schiebe nichts auf. Ich gebe {a} nur Zeit, den Fehler zu verstehen.",
      "Ein ernster Mensch zieht Schlüsse. Ein kluger Mensch sucht zuerst {b}.",
      "{c} wirkt jedes Problem kleiner, wenn {a} in der Nähe ist.",
      "Erfahrung ist, wenn {a} schon gescheitert ist und man es trotzdem Forschung nennt.",
      "Wenn der Tag seltsam beginnt, hat {a} wohl eine Wendung eingebaut.",
      "Erwachsensein ist, wenn {b} wie ein echter Plan klingt.",
      "Verschiebe nie auf morgen, was {a} heute schon vergessen kann.",
    ],
  },
  it: {
    dir: "data/funny-quotes-it",
    language: "it",
    authors: ["Filosofo d'ufficio", "Saggezza da cucina", "Stratega del divano", "Esperto del lunedì", "Ottimista anonimo"],
    a: ["il caffè", "la sveglia", "il divano", "il piano", "il frigorifero", "i calzini", "la scadenza", "il caricatore", "il tè", "il telecomando", "la lista delle cose", "il lunedì", "il venerdì", "il Wi-Fi", "l'ombrello", "il pranzo", "il calendario", "le scarpe", "la valigia", "il timer"],
    b: ["pazienza", "un sorriso", "una pausa", "un altro caffè", "modalità risparmio", "piano B", "una faccia calma", "un minuto in più", "una piccola vittoria", "una scusa brillante"],
    c: ["in cucina", "di lunedì", "dopo pranzo", "prima del caffè", "nella chat di gruppo", "prima della scadenza", "dopo la sveglia", "in fila", "sul divano", "davanti al frigo"],
    tails: ["Questa è strategia.", "Testato dalla vita.", "Sembra quasi scientifico.", "L'importante è sembrare sicuri.", "Lo metto nel manuale."],
    templates: [
      "Se {a} non aiuta, aggiungi {b}. Almeno sembrerà una strategia.",
      "Il mio talento {c}: sembrare occupato mentre {a} si risolve da solo.",
      "{a} insegna una cosa: a volte il piano migliore è {b} e niente panico.",
      "Non sto rimandando. Sto dando a {a} il tempo di capire l'errore.",
      "Una persona seria trae conclusioni. Una furba cerca prima {b}.",
      "{c} ogni problema sembra più piccolo se c'è {a} vicino.",
      "L'esperienza è quando {a} è già fallito e lo chiami ancora ricerca.",
      "Se la giornata inizia strana, {a} ha aggiunto un colpo di scena.",
      "Essere adulti è quando {b} sembra un vero piano.",
      "Non rimandare a domani quello che {a} può dimenticare oggi.",
    ],
  },
  es: {
    dir: "data/funny-quotes-es",
    language: "es",
    authors: ["Filósofo de oficina", "Sabiduría de cocina", "Estratega del sofá", "Experto en lunes", "Optimista anónimo"],
    a: ["el café", "la alarma", "el sofá", "el plan", "la nevera", "los calcetines", "la fecha límite", "el cargador", "el té", "el mando", "la lista de tareas", "el lunes", "el viernes", "el Wi-Fi", "el paraguas", "la comida", "el calendario", "las zapatillas", "la maleta", "el temporizador"],
    b: ["paciencia", "una sonrisa", "una pausa", "otro café", "modo ahorro", "plan B", "cara tranquila", "un minuto extra", "una pequeña victoria", "una excusa brillante"],
    c: ["en la cocina", "un lunes", "después de comer", "antes del café", "en el chat del grupo", "antes de la fecha límite", "después de la alarma", "en la fila", "en el sofá", "junto a la nevera"],
    tails: ["Eso ya es estrategia.", "Probado por la vida real.", "Suena casi científico.", "La clave es parecer seguro.", "Va directo al manual."],
    templates: [
      "Si {a} no ayuda, añade {b}. Quizá no resuelva nada, pero parece estrategia.",
      "Mi gran talento {c}: parecer ocupado mientras {a} se arregla solo.",
      "{a} enseña algo: a veces el mejor plan es {b} y no entrar en pánico.",
      "No estoy procrastinando. Le doy a {a} tiempo para entender su error.",
      "Una persona seria saca conclusiones. Una lista busca primero {b}.",
      "{c}, cualquier problema parece menor si {a} está cerca.",
      "La experiencia es cuando {a} ya falló y aun así lo llamas investigación.",
      "Si el día empieza raro, {a} añadió un giro de guion.",
      "Ser adulto es cuando {b} suena como un plan real.",
      "No dejes para mañana lo que {a} puede olvidar hoy.",
    ],
  },
  fr: {
    dir: "data/funny-quotes-fr",
    language: "fr",
    authors: ["Philosophe de bureau", "Sagesse de cuisine", "Stratège du canapé", "Expert du lundi", "Optimiste anonyme"],
    a: ["le café", "le réveil", "le canapé", "le plan", "le frigo", "les chaussettes", "la deadline", "le chargeur", "le thé", "la télécommande", "la liste des tâches", "le lundi", "le vendredi", "le Wi-Fi", "le parapluie", "le déjeuner", "le calendrier", "les baskets", "la valise", "le minuteur"],
    b: ["de la patience", "un sourire", "une pause", "un autre café", "le mode économie", "un plan B", "un air calme", "une minute de plus", "une petite victoire", "une excuse brillante"],
    c: ["dans la cuisine", "le lundi", "après le déjeuner", "avant le café", "dans le groupe", "avant la deadline", "après le réveil", "dans la file", "sur le canapé", "près du frigo"],
    tails: ["C'est déjà une stratégie.", "Testé par la vraie vie.", "Ça sonne presque scientifique.", "L'important, c'est l'air sûr.", "À mettre dans le manuel."],
    templates: [
      "Si {a} n'aide pas, ajoute {b}. Au moins, ça ressemble à une stratégie.",
      "Mon grand talent {c}: avoir l'air occupé pendant que {a} se règle tout seul.",
      "{a} enseigne ceci: parfois le meilleur plan, c'est {b} et pas de panique.",
      "Je ne procrastine pas. Je laisse à {a} le temps de comprendre son erreur.",
      "Une personne sérieuse tire des conclusions. Une maligne cherche d'abord {b}.",
      "{c}, tout problème semble plus petit quand {a} est proche.",
      "L'expérience, c'est quand {a} a déjà échoué et qu'on appelle encore ça recherche.",
      "Si la journée commence bizarrement, {a} a ajouté un rebondissement.",
      "Être adulte, c'est quand {b} ressemble à un vrai plan.",
      "Ne remets pas à demain ce que {a} peut oublier aujourd'hui.",
    ],
  },
  pt: {
    dir: "data/funny-quotes-pt",
    language: "pt",
    authors: ["Filósofo de escritório", "Sabedoria da cozinha", "Estrategista do sofá", "Especialista em segunda", "Otimista anônimo"],
    a: ["o café", "o alarme", "o sofá", "o plano", "a geladeira", "as meias", "o prazo", "o carregador", "o chá", "o controle remoto", "a lista de tarefas", "a segunda-feira", "a sexta-feira", "o Wi-Fi", "o guarda-chuva", "o almoço", "o calendário", "os tênis", "a mala", "o temporizador"],
    b: ["paciência", "um sorriso", "uma pausa", "mais um café", "modo economia", "plano B", "uma cara tranquila", "um minuto extra", "uma pequena vitória", "uma desculpa brilhante"],
    c: ["na cozinha", "na segunda-feira", "depois do almoço", "antes do café", "no grupo", "antes do prazo", "depois do alarme", "na fila", "no sofá", "perto da geladeira"],
    tails: ["Isso já é estratégia.", "Testado pela vida real.", "Parece quase científico.", "O segredo é parecer confiante.", "Vai para o manual."],
    templates: [
      "Se {a} não ajuda, acrescente {b}. Talvez não resolva, mas parece estratégia.",
      "Meu talento {c}: parecer ocupado enquanto {a} se resolve sozinho.",
      "{a} ensina uma coisa: às vezes o melhor plano é {b} e nada de pânico.",
      "Não estou procrastinando. Estou dando a {a} tempo para entender o erro.",
      "Uma pessoa séria tira conclusões. Uma esperta procura primeiro {b}.",
      "{c}, todo problema parece menor quando {a} está por perto.",
      "Experiência é quando {a} já falhou e você ainda chama de pesquisa.",
      "Se o dia começa estranho, {a} colocou uma reviravolta na história.",
      "Ser adulto é quando {b} soa como um plano de verdade.",
      "Não deixe para amanhã o que {a} pode esquecer hoje.",
    ],
  },
};

function build(lang, cfg) {
  const out = [];
  const seen = new Set();
  for (const template of cfg.templates) {
    for (const a of cfg.a) {
      for (const b of cfg.b) {
        for (const c of cfg.c) {
          for (const tail of cfg.tails) {
            const text = `${fill(template, { a, b, c })} ${tail}`.replace(/\s+/g, " ").trim();
            if (seen.has(text)) continue;
            seen.add(text);
            const id = out.length + 1;
            out.push({
              id,
              pack: Math.ceil(id / 100),
              itemKey: itemKey(lang, id),
              title: cfg.authors[(id - 1) % cfg.authors.length],
              text,
              chars: text.length,
              source: "original-safe-funny-quote-template",
            });
            if (out.length >= TARGET) return out;
          }
        }
      }
    }
  }
  throw new Error(`${lang}: generated only ${out.length}`);
}

for (const [lang, cfg] of Object.entries(DATA)) {
  const dir = resolve(process.cwd(), cfg.dir);
  mkdirSync(dir, { recursive: true });
  const items = build(lang, cfg);
  writeFileSync(resolve(dir, "titled.json"), `${JSON.stringify(items, null, 2)}\n`);
  writeFileSync(
    resolve(dir, "index.json"),
    `${JSON.stringify(
      {
        language: cfg.language,
        total: items.length,
        packs: Math.ceil(items.length / 100),
        packSize: 100,
        range: [Math.min(...items.map((x) => x.chars)), Math.max(...items.map((x) => x.chars))],
        target: TARGET,
        source: "Original safe humorous aphorism templates",
        generator: "src/scripts/build-funny-quotes-decks.mjs",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    resolve(dir, "sources.json"),
    `${JSON.stringify(
      {
        language: cfg.language,
        generator: "src/scripts/build-funny-quotes-decks.mjs",
        license: {
          quoteSource: "Original generated template corpus in this repository",
          quoteSpdx: "CC0-1.0 project-owned corpus",
          note:
            "Cards are neutral original humorous aphorisms and are not attributed to real people. No AP/news images or unclear third-party portraits are used.",
        },
        safety: {
          policy:
            "Avoids protected-class insults, politics, religion, sexual content, violence, drugs/alcohol, and real-person attribution. Still suitable for random spot-check before very large publication.",
        },
        target: TARGET,
        count: items.length,
        authors: cfg.authors,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${lang}: ${items.length} -> ${cfg.dir}`);
}
