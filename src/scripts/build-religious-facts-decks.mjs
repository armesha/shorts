import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = 500;

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function packNo(id) {
  return Math.ceil(id / 100);
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const islamicSeeds = [
  {
    title: "معلومة عن القرآن",
    text: "يُنظَّم القرآن الكريم في 114 سورة، وتُستخدم أسماء السور والمراجع لمساعدة القارئ على الرجوع إلى النص مباشرة.",
    theme: "quran",
  },
  {
    title: "الفاتحة",
    text: "سورة الفاتحة تفتتح المصحف، ولذلك تُعرف عند كثير من المسلمين بأنها مدخل القراءة والصلاة اليومية.",
    theme: "quran",
  },
  {
    title: "البقرة",
    text: "سورة البقرة هي أطول سور القرآن، وكثرة موضوعاتها تجعلها مثالاً واضحاً على تنوع الخطاب القرآني.",
    theme: "quran",
  },
  {
    title: "الكوثر",
    text: "سورة الكوثر من أقصر سور القرآن، ومع ذلك تحمل معنى مكثفاً عن العطاء والشكر والعبادة.",
    theme: "quran",
  },
  {
    title: "الحديث",
    text: "الحديث في التراث الإسلامي يُنقل مع إسناد ومتن، ولهذا نشأت علوم دقيقة لتمييز الروايات وفهم سياقها.",
    theme: "hadith",
  },
  {
    title: "الإسناد",
    text: "الإسناد هو سلسلة نقل الخبر في كتب الحديث، وكان الاهتمام به وسيلة لحفظ النصوص ومراجعة مصادرها.",
    theme: "hadith",
  },
  {
    title: "الدعاء",
    text: "الدعاء في الإسلام ليس مقصوراً على وقت واحد؛ فهو حاضر في العبادة اليومية، وفي السفر، والعمل، والبيت.",
    theme: "dua",
  },
  {
    title: "الأذكار",
    text: "الأذكار القصيرة تحفظ بسهولة، ولذلك تُستخدم كثيراً في تذكير النفس بالشكر والصبر وحسن النية.",
    theme: "dua",
  },
  {
    title: "أركان الإسلام",
    text: "تُذكر أركان الإسلام الخمسة عادةً كإطار تعليمي مختصر: الشهادة، الصلاة، الزكاة، الصوم، والحج.",
    theme: "practice",
  },
  {
    title: "الصلاة",
    text: "ترتبط الصلاة اليومية بمواقيت معروفة، وهذا يجعل الزمن جزءاً واضحاً من النظام التعبدي في حياة المسلم.",
    theme: "practice",
  },
  {
    title: "رمضان",
    text: "رمضان شهر قمري، لذلك ينتقل موعده عبر الفصول بمرور السنين ولا يثبت في موسم واحد من السنة الشمسية.",
    theme: "calendar",
  },
  {
    title: "الزكاة",
    text: "الزكاة تربط العبادة بالمسؤولية الاجتماعية، فهي ليست مجرد رقم مالي بل تذكير بحق المحتاج.",
    theme: "practice",
  },
  {
    title: "الحج",
    text: "الحج يجمع المسلمين من لغات وبلدان مختلفة في شعائر واحدة، وهذا يظهر عالمية التجربة الدينية.",
    theme: "practice",
  },
  {
    title: "عرفة",
    text: "يوم عرفة من أهم أيام الحج، ويُذكر كثيراً في التعليم الإسلامي بوصفه يوم وقوف ودعاء وتوبة.",
    theme: "practice",
  },
  {
    title: "التقويم الهجري",
    text: "التقويم الهجري قمري، ولذلك تكون الشهور 29 أو 30 يوماً بحسب رؤية الهلال والحسابات المحلية.",
    theme: "calendar",
  },
  {
    title: "العربية",
    text: "العربية هي لغة القرآن، لكن المسلمين في العالم يتحدثون لغات كثيرة ويستخدمون الترجمات للفهم والدراسة.",
    theme: "culture",
  },
  {
    title: "الخط",
    text: "ازدهر الخط العربي في الفنون الإسلامية لأنه يجمع الجمال البصري بالنصوص الدينية والأدبية.",
    theme: "culture",
  },
  {
    title: "الزخرفة",
    text: "تظهر الزخارف الهندسية والنباتية كثيراً في العمارة الإسلامية، خصوصاً حين يُراد تجنب تصوير الأشخاص.",
    theme: "culture",
  },
  {
    title: "المحراب",
    text: "المحراب في المسجد يدل على اتجاه القبلة، وهو عنصر معماري يساعد المصلين على تنظيم الصفوف.",
    theme: "architecture",
  },
  {
    title: "المئذنة",
    text: "المئذنة أصبحت علامة معمارية للمساجد في مناطق كثيرة، مع أن أشكالها تختلف باختلاف البلاد والعصور.",
    theme: "architecture",
  },
  {
    title: "القبلة",
    text: "القبلة توحّد اتجاه الصلاة، ولهذا يهتم المسلمون بمعرفتها في البيوت والمساجد وأثناء السفر.",
    theme: "practice",
  },
  {
    title: "العيد",
    text: "للمسلمين عيدان رئيسيان: عيد الفطر بعد رمضان، وعيد الأضحى المرتبط بموسم الحج.",
    theme: "calendar",
  },
  {
    title: "السلام",
    text: "تحية السلام تحمل معنى الدعاء بالأمان والرحمة، ولذلك تُستخدم كبداية اجتماعية وروحية في الوقت نفسه.",
    theme: "culture",
  },
  {
    title: "العلم",
    text: "طلب العلم قيمة مركزية في التراث الإسلامي، وتشمل علوم الدين واللغة والمعرفة النافعة للناس.",
    theme: "culture",
  },
  {
    title: "النية",
    text: "النية في الإسلام تُذكّر بأن قيمة العمل لا تنفصل عن المقصد الداخلي وطريقة التعامل مع الناس.",
    theme: "practice",
  },
];

const islamicSuffixes = [
  "هذه الفكرة تظهر كيف يجمع التعليم الإسلامي بين النص والمعنى والعمل اليومي.",
  "ولهذا يُذكر الموضوع كثيراً في الدروس المختصرة والبطاقات التعليمية.",
  "وتختلف التفاصيل بين البلدان، لكن المعنى العام يبقى معروفاً عند المسلمين.",
  "يرتبط هذا المعنى بالتذكير الهادئ لا بالجدل أو المبالغة.",
  "ومن المفيد عرضه بلغة بسيطة حتى يصل إلى المشاهد بسرعة.",
  "هذا النوع من المعلومات يفتح باب البحث في المصادر لا يغلقه.",
  "تظهر قيمته عندما يُقدَّم مع احترام النصوص والسياق.",
  "ويمكن فهمه كمدخل صغير إلى ثقافة إسلامية واسعة ومتنوعة.",
  "الهدف هنا تبسيط الفكرة لا إصدار حكم تفصيلي.",
  "كلما بقيت العبارة قصيرة وواضحة كان التذكير أقرب إلى الفهم.",
  "وتساعد الإشارة إلى العنوان أو المصطلح على تذكر الفكرة لاحقاً.",
  "هذه المعلومة مناسبة للتأمل السريع من دون إساءة أو مقارنة جارحة.",
  "وهي تذكّر بأن المعرفة الدينية تحتاج دائماً إلى أدب وسياق.",
  "يمكن أن تقرأها كلمحة ثقافية قبل الرجوع إلى المصادر المفصلة.",
  "المعنى الأساسي فيها هو الربط بين العبادة والأخلاق والوعي.",
  "وهي تصلح كبداية حوار هادئ عن المصطلح أو الشعيرة.",
  "تكرار مثل هذه اللمحات يساعد على ترسيخ المفردات الدينية الأساسية.",
  "لا تحتاج الفكرة إلى صورة شخص؛ يكفي رمز هادئ أو زخرفة واضحة.",
  "وتبقى القراءة أسهل عندما يكون النص كبيراً والخلفية بسيطة.",
  "هذا الأسلوب يجعل المعلومة قريبة من المشاهد من دون إثقال.",
];

const christianSeeds = [
  {
    title: "King James Bible",
    text: "The King James Version was first published in 1611 and became one of the most influential English Bible translations.",
    theme: "bible",
  },
  {
    title: "Bible Books",
    text: "Most Protestant English Bibles contain 66 books: 39 in the Old Testament and 27 in the New Testament.",
    theme: "bible",
  },
  {
    title: "Psalms",
    text: "Psalms is the longest book in the Bible and includes songs, laments, thanksgiving, and prayers.",
    theme: "bible",
  },
  {
    title: "Proverbs",
    text: "The book of Proverbs is known for short wisdom sayings about speech, discipline, work, justice, and humility.",
    theme: "wisdom",
  },
  {
    title: "The Gospels",
    text: "Matthew, Mark, Luke, and John are called the Gospels because they narrate the life, teaching, death, and resurrection of Jesus.",
    theme: "gospels",
  },
  {
    title: "Sermon on the Mount",
    text: "The Sermon on the Mount appears in Matthew 5-7 and contains the Beatitudes, the Lord's Prayer, and many ethical teachings.",
    theme: "gospels",
  },
  {
    title: "The Lord's Prayer",
    text: "The Lord's Prayer is recorded in Matthew 6 and Luke 11, and many Christian traditions use it in worship.",
    theme: "prayer",
  },
  {
    title: "Amen",
    text: "Amen is a Hebrew word often used to close prayers, carrying the sense of agreement, trust, or 'so be it.'",
    theme: "prayer",
  },
  {
    title: "Parables",
    text: "Jesus often taught through parables: short stories that invite listeners to think about mercy, repentance, and the kingdom of God.",
    theme: "gospels",
  },
  {
    title: "Epistles",
    text: "The New Testament epistles are letters written to churches or individuals, addressing faith, practice, and community life.",
    theme: "bible",
  },
  {
    title: "Old Testament",
    text: "The Old Testament includes law, history, poetry, wisdom literature, and prophetic books.",
    theme: "bible",
  },
  {
    title: "New Testament",
    text: "The New Testament includes the Gospels, Acts, letters, and Revelation, all centered on early Christian faith.",
    theme: "bible",
  },
  {
    title: "Stained Glass",
    text: "Stained glass windows became a visual teaching tool in many churches, especially when many people could not read.",
    theme: "culture",
  },
  {
    title: "The Cross",
    text: "The cross is one of the most recognizable Christian symbols, pointing to sacrifice, redemption, and hope.",
    theme: "symbol",
  },
  {
    title: "Baptism",
    text: "Baptism is practiced across Christian traditions, though the form and theology differ between churches.",
    theme: "practice",
  },
  {
    title: "Communion",
    text: "Communion, also called the Lord's Supper or Eucharist, remembers the Last Supper of Jesus with his disciples.",
    theme: "practice",
  },
  {
    title: "Advent",
    text: "Advent is a season of preparation before Christmas in many Christian calendars.",
    theme: "calendar",
  },
  {
    title: "Lent",
    text: "Lent is observed by many Christians as a period of reflection and repentance before Easter.",
    theme: "calendar",
  },
  {
    title: "Easter",
    text: "Easter is the central Christian celebration of the resurrection of Jesus.",
    theme: "calendar",
  },
  {
    title: "Pentecost",
    text: "Pentecost remembers the coming of the Holy Spirit in Acts 2 and is often linked to the mission of the church.",
    theme: "calendar",
  },
  {
    title: "Prayer",
    text: "Christian prayer may include praise, confession, thanksgiving, intercession, and silent reflection.",
    theme: "prayer",
  },
  {
    title: "Hymns",
    text: "Hymns have carried Christian teaching through music for centuries, combining memory, worship, and poetry.",
    theme: "culture",
  },
  {
    title: "Icons and Art",
    text: "Christian art often uses symbols, saints, biblical scenes, and light to teach or invite reflection.",
    theme: "culture",
  },
  {
    title: "The Early Church",
    text: "The book of Acts describes the early church's preaching, community life, journeys, conflicts, and growth.",
    theme: "history",
  },
  {
    title: "Bible References",
    text: "A Bible reference usually names the book, chapter, and verse, making it easier to verify the passage.",
    theme: "bible",
  },
];

const christianSuffixes = [
  "It is a small context note that helps viewers read the Bible, prayer, and church traditions with more awareness.",
  "Different churches may explain details differently, but the broad idea is useful for basic Christian literacy.",
  "A simple Bible, cross, candle, chapel, or stained-glass visual fits this kind of fact.",
  "The point is educational context, not a replacement for Scripture or a pastor's detailed teaching.",
  "When a passage is mentioned, the reference helps viewers verify it and keep the context clear.",
  "This kind of card works best with respectful wording and a calm reading pace.",
  "It can sit beside Bible verses and prayers because it explains background in plain language.",
  "The idea is easier to remember when the text stays short and the design stays uncluttered.",
  "Christian traditions are diverse, so the wording should stay general unless a tradition is named.",
  "The fact invites reflection without turning the card into a theological debate.",
  "It is useful as a quick doorway into a larger topic of worship, history, or Scripture.",
  "A viewer can treat it as a starting point for checking a Bible reference or church source.",
  "The best version keeps the tone peaceful, accurate, and easy to read.",
  "Short context cards are helpful because many biblical terms are old, layered, or unfamiliar.",
  "This fact should support curiosity and reverence rather than sensational claims.",
  "The visual should make the words clearer, not compete with them.",
  "A calm background and strong contrast make the card easier to watch on a phone.",
  "The topic connects faith, memory, and practice in a compact way.",
  "It connects the topic to everyday reading, worship, memory, or church history in a compact way.",
  "Good context makes the next Bible or prayer card easier to understand.",
];

function buildItems(deckId, seeds, suffixes, language) {
  const items = [];
  let cursor = 0;
  while (items.length < TARGET) {
    const seed = seeds[cursor % seeds.length];
    const suffix = suffixes[Math.floor(cursor / seeds.length) % suffixes.length];
    const id = items.length + 1;
    const text = normalize(`${seed.text} ${suffix}`);
    items.push({
      id,
      pack: packNo(id),
      itemKey: `religious-fact:${deckId}:${String(id).padStart(4, "0")}`,
      title: seed.title,
      text,
      chars: text.length,
      source:
        language === "ar"
          ? "Curated general Islamic education fact; manually review before broad reuse"
          : "Curated general Christian education fact; manually review before broad reuse",
      theme: seed.theme,
    });
    cursor += 1;
  }
  return items;
}

function buildDeck({ deckId, language, sourceDeck, seeds, suffixes, licenseNote, safety }) {
  const dir = resolve(process.cwd(), `data/${deckId}`);
  mkdirSync(dir, { recursive: true });
  const items = buildItems(deckId, seeds, suffixes, language);
  writeJson(resolve(dir, "titled.json"), items);
  writeJson(resolve(dir, "index.json"), {
    deckId,
    language,
    total: items.length,
    packs: packNo(items.length),
    packSize: 100,
    range: [Math.min(...items.map((item) => item.chars)), Math.max(...items.map((item) => item.chars))],
    sourceDeck,
    generator: "src/scripts/build-religious-facts-decks.mjs",
    themes: [...new Set(items.map((item) => item.theme))].sort(),
    visualPolicy: language === "ar" ? "No faces or portraits; use calligraphy, mosques, books, lanterns, ornaments." : "Use public-domain/clearly licensed Christian artwork or symbolic backgrounds.",
  });
  writeJson(resolve(dir, "sources.json"), {
    deckId,
    language,
    generator: "src/scripts/build-religious-facts-decks.mjs",
    status: "manual_review_required",
    licenseNote,
    safety,
    count: items.length,
  });
  return { deckId, count: items.length };
}

console.log(
  buildDeck({
    deckId: "islamic-facts-ar",
    language: "ar",
    sourceDeck: "islamic",
    seeds: islamicSeeds,
    suffixes: islamicSuffixes,
    licenseNote:
      "Original short educational prose generated for this project from stable general Islamic literacy topics. No portraits or modern copyrighted source text are copied.",
    safety: [
      "No human faces, prophets, companions, scholars, or modern people in visuals.",
      "No extremist, sectarian, anti-protected-class, political, medical, or miracle-claim framing.",
      "Use as educational facts only; detailed rulings require qualified human review.",
    ],
  }),
);

console.log(
  buildDeck({
    deckId: "christian-facts-en",
    language: "en",
    sourceDeck: "christian",
    seeds: christianSeeds,
    suffixes: christianSuffixes,
    licenseNote:
      "Original short educational prose generated for this project from stable general Christian/Bible literacy topics. Do not add modern copyrighted commentary without a source/license note.",
    safety: [
      "No attacks on other religions or protected classes.",
      "No guaranteed healing, medical, legal, or political claims.",
      "Use public-domain or clearly licensed Christian artworks only when adding portraits/art backgrounds.",
    ],
  }),
);
