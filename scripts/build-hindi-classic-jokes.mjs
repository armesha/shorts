#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "data/anecdotes-hi");
const PACK_SIZE = 300;

const SOURCES = [
  {
    id: "premchand-bade-bhai-sahab-wikisource",
    title: "बड़े भाई साहब",
    author: "प्रेमचंद",
    authorDied: 1936,
    sourceUrl: "https://hi.wikisource.org/wiki/प्रेमचंद_की_सर्वश्रेष्ठ_कहानियां/_बड़े_भाई_साहब",
    rights:
      "Premchand died in 1936; the work is public-domain by author age. Text is sourced from Hindi Wikisource; keep attribution/source URL.",
  },
  {
    id: "bharatendu-parihasini-wikisource",
    title: "परिहासिनी",
    author: "भारतेंदु हरिश्चंद्र",
    authorDied: 1885,
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११०",
    rights:
      "Bharatendu Harishchandra died in 1885; the underlying text is public-domain by author age. Text is sourced from Hindi Wikisource pages; keep attribution/source URLs.",
  },
];

const CARDS = [
  {
    title: "मजबूत बुनियाद",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "मेरे भाई साहब मुझसे पाँच साल बड़े थे; लेकिन केवल तीन दरजे आगे। तालीम जैसे महत्व के मामले में वह जल्दीबाजी पसंद न करते थे। एक साल का काम दो साल में करते, कभी-कभी तीन साल भी लग जाते। उनका कहना था: बुनियाद ही पुख्ता न हो तो मकान कैसे पायेदार बने!",
  },
  {
    title: "किताब और चित्र",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "भाई साहब हरदम किताब खोले बैठे रहते। दिमाग को आराम देने के लिए कभी कापी पर, कभी किताब के हाशिये पर चिड़ियों, कुत्तों और बिल्लियों की तस्वीरें बना दिया करते। कभी एक ही शब्द दस-बीस बार लिख डालते। पढ़ाई भी चलती रहती और रहस्य भी बना रहता।",
  },
  {
    title: "पहला सवाल",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "मेरा जी पढ़ने में बिल्कुल न लगता। मौका पाते ही मैदान में आ जाता: कभी कंकरियाँ उछालता, कभी कागज की तितलियाँ उड़ाता। कमरे में आते ही भाई साहब का पहला सवाल होता, 'कहाँ थे?' जवाब मेरे पास केवल मौन था। मेरा मौन ही सब अपराध मान लेता था।",
  },
  {
    title: "टाइम-टेबल",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "लताड़ सुनकर मैं तुरंत एक टाइम-टेबल बना डालता। बिना नक्शा बनाए काम कैसे शुरू हो! मगर टाइम-टेबल बना लेना एक बात है, उस पर अमल करना दूसरी बात। पहले ही दिन मैदान की हरियाली, फुटबाल, कबड्डी और वालीबाल मुझे खींच ले जाते।",
  },
  {
    title: "दबके पाँव",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "मैदान में पहुँचते ही किताबें भूल जातीं। फिर भाई साहब को नसीहत और फजीहत का अवसर मिल जाता। मैं उनके साये से भागता, कमरे में दबे पाँव आता कि उन्हें खबर न हो। उनकी नजर उठी और मेरे प्राण जैसे अटक गये।",
  },
  {
    title: "नतीजा",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "सालाना इम्तहान हुआ। मैं पास हो गया और भाई साहब फेल हो गये। जी में आया कह दूँ: इतनी तपस्या कहाँ गयी? मगर वह इतने उदास थे कि मुझे हमदर्दी हो गयी। हाँ, अपने ऊपर थोड़ा अभिमान जरूर आया और खेल-कूद फिर खुलकर शुरू हो गया।",
  },
  {
    title: "फिर वही",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "फिर इम्तहान हुआ। मैं फिर पास हुआ और भाई साहब फिर फेल। मैंने बहुत मेहनत नहीं की थी, फिर भी दरजे में अव्वल आ गया। मुझे खुद अचरज हुआ। भाई साहब कोर्स का एक-एक शब्द चाट गये थे, फिर भी नतीजा उल्टा निकला।",
  },
  {
    title: "तकदीर बलवान",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "अबकी भाई साहब कुछ नर्म पड़ गये। मेरी स्वच्छंदता बढ़ी। मुझे धारणा हो गयी कि मैं तो पास हो ही जाऊँगा, पढ़ूँ या न पढ़ूँ, मेरी तकदीर बलवान है। जो थोड़ा-बहुत पढ़ता था, वह भी बंद हुआ और नया शौक पैदा हो गया: पतंगबाजी।",
  },
  {
    title: "गुप्त तैयारियाँ",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "मैं भाई साहब का अदब करता था, इसलिए पतंग भी उनकी नजर बचाकर उड़ाता। माँझा देना, कन्ने बाँधना, पतंग-टूर्नामेंट की तैयारियाँ - सब गुप्त रूप से हल होतीं। पढ़ाई से ज्यादा योजना पतंग की बनती थी।",
  },
  {
    title: "कनकौआ",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "एक दिन मैं होस्टल से दूर एक कनकौआ लूटने बेतहाशा दौड़ा जा रहा था। आँखें आसमान पर थीं और मन उस झूमते हुए पथिक पर। बालकों की पूरी सेना लग्गे और बाँस लिये दौड़ी आ रही थी। किसी को आगे-पीछे की खबर न थी।",
  },
  {
    title: "भाई साहब की बात",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "भाई साहब ने समझाया कि मैं कनकौए उड़ाने को मना नहीं करता। मेरा जी भी ललचता है, लेकिन करूँ क्या? अगर मैं ही बेराह चलूँ तो तुम्हारी रक्षा कैसे करूँ? यह सुनकर मेरा सिर झुक गया।",
  },
  {
    title: "असली परीक्षा",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "ठीक उसी वक्त एक कटा हुआ कनकौआ हमारे ऊपर से गुजरा। डोर लटक रही थी और लड़कों का झुंड पीछे-पीछे दौड़ रहा था। भाई साहब लम्बे थे। उछलकर डोर पकड़ ली और बेतहाशा होस्टल की ओर दौड़े। मैं भी पीछे-पीछे दौड़ रहा था।",
  },
  {
    title: "हकीम की दवा",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११३",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११३",
    text:
      "किसी अमीर ने छोटी-सी शिकायत पर हकीम को बुलाया। हकीम ने नब्ज देखी और पूछा, 'भूख अच्छी लगती है?' अमीर बोला, 'हाँ।' फिर पूछा, 'नींद भरपूर आती है?' जवाब आया, 'हाँ।' हकीम बोला, 'तो मैं कोई ऐसी दवा लिखता हूँ जिससे ये सब बातें जाती रहें।'",
  },
  {
    title: "तेज़ झूठ",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११३",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११३",
    text:
      "एक शख्स ने पूछा, 'अगर मैं झूठ बोलता हूँ, तो मेरा झूठ कोई पकड़ क्यों नहीं लेता?' जवाब मिला, 'आपके मुँह से झूठ इस कदर जल्दी निकलता है कि कोई उसे पकड़ ही नहीं पाता।'",
  },
  {
    title: "सच्चा घोड़ा",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११५",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११५",
    text:
      "एक सौदागर घोड़ा बेचते हुए बार-बार कहता, 'हुजूर, यह जानवर बड़ा सच्चा है।' खरीदने वाले ने पूछा, 'सच्चा होने से तुम्हारा मतलब?' सौदागर बोला, 'जब भी मैं इस पर सवार हुआ, इसने गिराने का डर दिखाया और आज तक कभी झूठी धमकी नहीं दी।'",
  },
  {
    title: "रिसाले की तारीफ",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११५",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११५",
    text:
      "एक लेखक ने पूछा, 'मेरे रिसाले में तुम्हें क्या अच्छा लगा?' मित्र बोला, 'ऐसी उम्दा चीजें मिलीं जो आज तक किसी रिसाले में न देखीं।' लेखक खुश हुआ। मित्र ने आगे कहा, 'क्योंकि बीच-बीच में खाली जगह बहुत साफ छोड़ी गयी थी।'",
  },
  {
    title: "दस्तरखान",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११५",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११५",
    text:
      "एक मुफ्तखोर खाने की ताक में टहल रहा था। देर हुई तो उसने नौकर से पूछा, 'भाई, दस्तरखान कब बिछेगा?' नौकर ने शांत भाव से जवाब दिया, 'जैसे ही आप चले जाएँगे।'",
  },
  {
    title: "दुशाला",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११५",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११५",
    text:
      "एक बाबू ने मित्र से कहा, 'मेरा दुशाला अपनी गाड़ी पर लेते जाइएगा।' मित्र ने जवाब दिया, 'बड़ी खुशी से।' बाबू बोले, 'फिर उसे वापस कैसे पाऊँगा?' मित्र ने कहा, 'आसानी से, क्योंकि मैं भी उसे देखने साथ चलता हूँ।'",
  },
  {
    title: "घंटी",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/११११",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/११११",
    text:
      "एक घर में कई मेहमान बैठे थे। घंटी बजी तो नौकर भीतर गया और हँसता हुआ लौटा। पूछा गया, 'हँसते क्यों हो?' उसने कहा, 'अंदर इतने हट्टे-कट्टे लोग बैठे हैं, फिर भी किसी से यह काम न हुआ कि दरवाजे तक आकर बुला ले!'",
  },
];

function sourceFor(card) {
  const source = SOURCES.find((item) => item.id === card.sourceId);
  if (!source) throw new Error(`Unknown source ${card.sourceId}`);
  return source;
}

function safetyFlags(card) {
  const text = card.text;
  const rules = [
    ["religion", /ईश्वर|भगवान|मंदिर|मन्दिर|धर्म|ब्राह्मण|मुसलमान|हिन्दू|हिंदू|मौलवी|फकीर|व्रत|ब्रत|एकादशी/u],
    ["politics", /राजनीति|सरकार|मंत्री|मन्त्री|राजा|रानी|अदालत|जज|गवाह/u],
    ["protected_class", /जाति|काने|अंध|लंगड़|पागल|गँवार|गंवार|कायथ|नौजवान लौंडी/u],
    ["adult", /पत्नी|पति|विवाह|व्याह|शराब|नशा|प्रेम|माशूक|आशिक|चूम/u],
    ["violence", /हत्या|खून|युद्ध|मार डाल|मृत्यु|फोड़|बाण|शिकार|मारा गया/u],
    ["coarse_or_insult", /गाली|हराम|नीच|पाजी|नामाकूल|बेवकूफ/u],
  ];
  return rules.filter(([, re]) => re.test(text)).map(([id]) => id);
}

const selected = CARDS.map((card, index) => {
  const source = sourceFor(card);
  const flags = safetyFlags(card);
  if (flags.length) throw new Error(`${card.title}: blocked by ${flags.join(",")}`);
  return {
    id: index + 1,
    pack: Math.floor(index / PACK_SIZE) + 1,
    text: card.text,
    chars: card.text.length,
    title: card.title,
    sourceId: card.sourceId,
    sourcePage: card.sourcePage ?? source.title,
    sourceUrl: card.sourceUrl ?? source.sourceUrl,
    curation: {
      edits:
        "manual excerpt selection and light punctuation cleanup only; unsafe religion/politics/protected-class/adult/violence/coarse jokes excluded",
    },
  };
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "pack-001.json"), `${JSON.stringify(selected, null, 2)}\n`);
writeFileSync(resolve(OUT_DIR, "titled.json"), `${JSON.stringify(selected.map(({ title, text }) => ({ title, text })), null, 2)}\n`);
writeFileSync(
  resolve(OUT_DIR, "index.json"),
  `${JSON.stringify(
    {
      total: selected.length,
      packs: 1,
      packSize: PACK_SIZE,
      range: [Math.min(...selected.map((item) => item.chars)), Math.max(...selected.map((item) => item.chars))],
      safety: {
        filters:
          "Hindi Wikisource public-domain/CC BY-SA source ledger + manual curation + religion/politics/protected-class/adult/violence/coarse blocklist.",
        note:
          "Small starter HI text layer for jokes_memes. It is intentionally labelled as classic humor stories because the safe Hindi source corpus is not yet a large modern joke corpus.",
      },
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  resolve(OUT_DIR, "sources.json"),
  `${JSON.stringify(
    {
      licenseNote:
        "Underlying works are public-domain by author age. Text was sourced from Hindi Wikisource; retain source URLs and attribution in the ledger when publishing outside this app.",
      generatedAt: new Date().toISOString(),
      sourceCounts: SOURCES.map((source) => ({
        id: source.id,
        title: source.title,
        selected: selected.filter((card) => card.sourceId === source.id).length,
      })),
      sources: SOURCES,
      blockedPolicy:
        "Rejected religion, politics/authority-heavy setups, protected-class/caste/disability jokes, adult/family/sexist setups, violence/crime, coarse insults, OCR/navigation noise, and non-standalone excerpts.",
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify({ deck: "hi", total: selected.length, outDir: OUT_DIR }, null, 2));
