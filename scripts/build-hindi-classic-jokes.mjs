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
  {
    id: "panchtantra-1952-hindi-wikisource",
    title: "पंचतन्त्र",
    author: "विष्णुशर्मा",
    translator: "सत्यकाम विद्यालंकार",
    sourceUrl: "https://hi.wikisource.org/wiki/पंचतन्त्र",
    rights:
      "Hindi Wikisource marks this 1952 text with public-domain notices in India and the USA. Use only short, standalone witty-story excerpts and keep attribution/source URLs.",
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
  {
    title: "भेद की रखवाली",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११०",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११०",
    text:
      "एक मित्र ने पूछा, 'तुमने हमारा भेद क्यों खोल दिया?' जवाब मिला, 'जब मैंने देखा कि मैं उसे छिपा नहीं सकता, तो ऐसे आदमी से कह दिया जो उसे छिपा सकता था।'",
  },
  {
    title: "बुरी आदतें",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/११११",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/११११",
    text:
      "एक ने कहा, 'न जाने इस लड़की में इतनी बुरी आदतें कहाँ से आईं; हमसे तो उसने कोई बुरी बात नहीं सीखी।' लड़के ने झट कहा, 'ठीक है, अगर उसने आपसे बुरी आदतें ली होतीं तो आपमें कुछ कम भी हो जातीं।'",
  },
  {
    title: "एक घंटा आगे",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/११११",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/११११",
    text:
      "मालिक ने नौकर से कहा, 'आज तू इतनी देर से आया कि बाकी नौकरों को काम शुरू किये एक घंटा हो गया।' नौकर बोला, 'तो आज शाम हम उनसे एक घंटा आगे चल देंगे, बराबर हो जाएगा।'",
  },
  {
    title: "घोड़ा पकड़ना",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/११११",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/११११",
    text:
      "'जरा मेरा घोड़ा पकड़े रहो।' 'यह कूदेगा तो नहीं?' 'नहीं।' 'काटेगा?' 'नहीं।' 'दो आदमी पकड़ें तभी संभलता है?' 'नहीं।' जवाब आया, 'फिर मुझे क्यों तकलीफ देते हैं, आप तो हैं ही।'",
  },
  {
    title: "उस्ताद की फीस",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११४",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११४",
    text:
      "एक उस्ताद ने शागिर्द से कहा, 'मुकदमा जीतने पर रुपये देने का वादा किया था, अब शर्त पूरी करो।' शागिर्द बोला, 'मैं जीता तो अदालत नहीं दिलवाएगी, और हारा तो शर्त के मुताबिक दूँगा ही नहीं।'",
  },
  {
    title: "दुनिया के बाहर",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११५",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११५",
    text:
      "एक वकील अपनी बहस में जमीन छोड़कर आसमान की बातें करने लगा। जज ने कहा, 'बस साहब, अब आप हमारी हुकूमत के बाहर हो गये। इस दुनिया से बाहर की बात सुनने का हमें अधिकार नहीं।'",
  },
  {
    title: "भाग्यवान मेहमान",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११५",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११५",
    text:
      "एक मेहमान ऐसे घर पहुँचे जहाँ बैठने को चटाई भी न थी। मेजबान ने बड़े चाव से कहा, 'आप तो भाग्यवान हैं; जहाँ जाते हैं, वहाँ बैठने की जगह ही नहीं मिलती।'",
  },
  {
    title: "रास्ते का पक्का पता",
    sourceId: "bharatendu-parihasini-wikisource",
    sourcePage: "पृष्ठ:भारतेंदु समग्र.pdf/१११६",
    sourceUrl: "https://hi.wikisource.org/wiki/पृष्ठ:भारतेंदु_समग्र.pdf/१११६",
    text:
      "एक यात्री रास्ता भूल गया। सामने मिले आदमी ने कहा, 'हजूर, मुझे नहीं पहचाना? मैं वही जान हूँ जो एक बार आपके सामने बकरी चुराने के मामले में पेश हुआ था।' यात्री बोला, 'अहा जान, अब याद आया!'",
  },
  {
    title: "टाइम-टेबल का हिसाब",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "टाइम-टेबल में सुबह छह से आठ अंग्रेजी, फिर हिसाब, इतिहास, भूगोल, ग्रामर, अनुवाद और विविध विषय रखे गये। खेल-कूद की मद बिल्कुल उड़ गई। मगर टाइम-टेबल बना लेना एक बात है, उस पर अमल करना दूसरी बात।",
  },
  {
    title: "हेनरी और जेम्स",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "भाई साहब कहते, 'इतिहास में आठ-आठ हेनरी हुए हैं। कौन-सा कांड किस हेनरी के समय हुआ, याद रखना आसान समझते हो? हेनरी सातवें की जगह आठवाँ लिखा और सारे नंबर साफ। जेम्स, विलियम और चार्ल्स तो गिनते-गिनते दिमाग चकरा जाए।'",
  },
  {
    title: "ज्यामिति का डर",
    sourceId: "premchand-bade-bhai-sahab-wikisource",
    text:
      "भाई साहब का दावा था कि ज्यामिति में 'अ ब ज' की जगह 'अ ज ब' लिख दिया तो सारे नंबर कट जाते हैं। कोई पूछे, बात वही है या नहीं; लेकिन परीक्षक को क्रम चाहिए। पढ़ाई में यही छोटी बात पहाड़ बन जाती है।",
  },
  {
    title: "ढोल की पोल",
    sourceId: "panchtantra-1952-hindi-wikisource",
    sourcePage: "पंचतन्त्र/प्रथम तन्त्र",
    sourceUrl: "https://hi.wikisource.org/wiki/पंचतन्त्र/प्रथम_तन्त्र",
    text:
      "दूर से ढोल की बहुत ऊँची आवाज़ सुनकर गोमायु डर गया। पास पहुँचा तो देखा कि बेलों की शाखाएँ ढोल पर चोट कर रही थीं। शोर बड़ा था, पर बात खाली निकली; केवल शब्द से डरना ठीक नहीं।",
  },
  {
    title: "गीत का समय",
    sourceId: "panchtantra-1952-hindi-wikisource",
    sourcePage: "पंचतन्त्र/पंचम तन्त्र",
    sourceUrl: "https://hi.wikisource.org/wiki/पंचतन्त्र/पंचम_तन्त्र",
    text:
      "चाँदनी रात में गधे ने कहा, 'मित्र, आज जी चाहता है खूब गीत गाऊँ। मुझे सब राग-रागनियाँ आती हैं।' गीदड़ ने समझाया, 'मामा, हम चोरी से खेत में आये हैं; चोर को खाँसना भी मना है, और तुम राग छेड़ना चाहते हो।'",
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
    ["modern_politics", /राजनीति|सरकार|चुनाव|राष्ट्रपति|प्रधानमंत्री|विधानसभा|संसद/u],
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
