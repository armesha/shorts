#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE = resolve(ROOT, "data/memes-en/cards.json");
const PER_TEMPLATE = 10;

const common = {
  id: {
    name: "Memes (ID)",
    hashtags: "#meme #humor #lucu #relatable #shorts",
    subjects: [
      "Aku", "Otakku", "Kesabaranku", "Rencanaku", "Produktivitasku", "Dompetku",
      "Tidurku", "Motivasiku", "Grup chat", "Rapat itu", "Hari Senin", "Deadline",
      "Internet", "Aplikasi itu", "Daftar tugasku", "Sisi rajinku", "Sisi impulsifku",
      "Fokusku", "Kopi", "Notifikasi", "Wi-Fi", "Percakapan itu", "Rutinitasku", "Mood-ku",
    ],
    situations: [
      "mencoba terlihat normal", "setelah dengar \"sebentar saja\"", "saat tinggal satu detail",
      "sebelum kopi pertama", "ketika rencana berubah", "membuka jadwal minggu ini",
      "berjanji tidur cepat", "membaca pesan yang sama lagi", "saat panggilan bisa jadi teks",
      "melihat baterai tinggal 1%", "mencoba hemat", "saat halaman akhirnya terbuka",
      "menerima tugas sederhana lagi", "ketika suasana jadi canggung", "mencoba jawab dengan tenang",
      "setelah lima menit fokus", "saat semua tampak selesai", "melihat keranjang belanja",
      "ketika pembaruan muncul", "mencoba tidak buka tab baru", "saat rencana B jadi rencana A",
      "setelah bilang \"biar aku saja\"", "ketika pengingat muncul", "mencoba tetap elegan",
    ],
    outcomes: [
      "tapi di kepala sudah ada 20 tab", "sementara energi pergi istirahat",
      "dengan tenaga Jumat sore", "sambil pura-pura paham", "diam-diam mencari jalan keluar",
      "punya tiga ide dan nol keberanian", "menganggap ini sudah teratur", "saat kekacauan ikut antre",
      "dengan percaya diri pinjaman", "sementara jam berlari", "tapi sofa menang telak",
      "dan sandi lupa lagi", "berwajah seperti punya metode", "padahal metodenya cuma hoki",
      "tapi kulkas memanggil duluan", "dengan damai yang sementara", "sambil menyiapkan alasan baru",
      "dan tidak ada yang perlu tahu", "dengan senyum menerima nasib", "tapi belum benar-benar ikhlas",
      "sel terakhir otak minta libur", "dramanya cukup untuk satu musim", "setidaknya terlihat rapi",
      "sekarang jadi urusan besok",
    ],
    closers: [
      "hidup dewasa dalam satu gambar", "kemenangan kecil, lelah besar", "semua terkendali menurut wajahku",
      "rencananya sederhana sampai dimulai", "ini kusebut seimbang", "berhasil di kepalaku",
      "tidak ada yang bilang hari ini", "teorinya sudah sempurna", "praktiknya izin pulang",
      "kenapa terasa sangat nyata", "satu menit untuk organisasi", "terlihat mudah di tutorial",
      "yang penting tetap bergaya", "fokus, kopi, dan banyak tab", "naskahnya berubah sendiri",
      "tarik napas lalu pura-pura santai", "mode bertahan hidup aktif", "hampir profesional",
      "banyak konsep, baterai sedikit", "pikiran menang, aksi kalah",
    ],
    flavors: [
      "tanpa manual", "di dalam hati", "tetap gaya", "secara teori", "hampir aman", "diam-diam",
      "tanpa penonton", "versi beta", "mode cepat", "tiba-tiba", "agak telat", "tanpa naskah",
      "pelan-pelan", "lumayan rapi", "mode uji coba", "dengan pose", "improvisasi",
      "krisis kecil", "penuh suspense", "cukup halus", "tenang palsu", "setengah resmi",
      "wajah serius", "energi rendah", "nol persiapan", "modal nekat", "mode pesawat",
      "otomatis", "banyak opini", "tanpa garansi", "layar penuh",
    ],
    banned: [/\b(tuhan|allah|agama|dosa|gereja|masjid|neraka)\b/i, /\b(bunuh|mati|darah|perang|bom|senjata|benci|mencuri|curi)\b/i, /\b(seks|telanjang|mabuk|bir|anggur)\b/i, /\b(gila|bodoh|cacat|buta|tuli)\b/i],
  },
  hi: {
    name: "मीम्स (HI)",
    hashtags: "#मीम #हास्य #मजेदार #relatable #shorts",
    subjects: [
      "मैं", "मेरा दिमाग", "मेरा सब्र", "मेरा प्लान", "मेरी मेहनत", "मेरा बजट",
      "मेरी नींद", "मेरा मूड", "ग्रुप चैट", "वह मीटिंग", "सोमवार", "डेडलाइन",
      "इंटरनेट", "वह ऐप", "मेरी टु-डू लिस्ट", "मेरा जिम्मेदार रूप", "मेरा जल्दबाज रूप",
      "मेरा फोकस", "कॉफी", "नोटिफिकेशन", "वाई-फाई", "वह बातचीत", "मेरी रूटीन", "मेरी ऊर्जा",
    ],
    situations: [
      "नॉर्मल दिखने की कोशिश में", "जब कोई कहे \"बस दो मिनट\"", "जब बस एक काम बचा हो",
      "पहली कॉफी से पहले", "जब प्लान बदल जाए", "हफ्ते का कैलेंडर खोलते हुए",
      "जल्दी सोने का वादा करते हुए", "वही मैसेज फिर से पढ़ते हुए", "जब कॉल मैसेज हो सकती थी",
      "बैटरी 1% देखते हुए", "बचत करने की कोशिश में", "जब पेज आखिर खुल जाए",
      "एक और आसान काम लेते हुए", "जब चुप्पी अजीब हो जाए", "शांति से जवाब देने की कोशिश में",
      "पांच मिनट फोकस के बाद", "जब सब ठीक लग रहा था", "कार्ट देखते हुए",
      "जब अपडेट आ जाए", "नई टैब न खोलने की कोशिश में", "जब प्लान बी ही प्लान ए बने",
      "कहने के बाद \"मैं कर लूंगा\"", "जब रिमाइंडर आ जाए", "स्टाइल बनाए रखने की कोशिश में",
    ],
    outcomes: [
      "और दिमाग में 20 टैब खुले हैं", "पर ऊर्जा ब्रेक पर चली गई", "शुक्रवार शाम वाली ताकत के साथ",
      "और चेहरा कहे सब समझ आया", "चुपचाप निकलने का रास्ता ढूंढते हुए", "तीन आइडिया, हिम्मत शून्य",
      "इसे ही मैं व्यवस्था मानता हूं", "जब गड़बड़ लाइन में खड़ी हो", "उधार के आत्मविश्वास के साथ",
      "और घड़ी तेज भाग रही है", "पर सोफा जीत गया", "और पासवर्ड फिर भूल गया",
      "चेहरा ऐसा जैसे तरीका पता हो", "तरीका बस किस्मत था", "पर फ्रिज ने पहले बुला लिया",
      "थोड़ी देर वाली शांति के साथ", "नई वजह तैयार करते हुए", "यह बात किसी को जाननी नहीं थी",
      "नसीब स्वीकार करने वाली मुस्कान", "पर सच में स्वीकार नहीं", "आखिरी सेल छुट्टी मांग रही है",
      "इतना ड्रामा कि सीजन बन जाए", "कम से कम साफ तो दिख रहा है", "अब यह कल की समस्या है",
    ],
    closers: [
      "बड़ों की जिंदगी एक तस्वीर में", "छोटी जीत, बड़ी थकान", "चेहरे के हिसाब से सब कंट्रोल में",
      "प्लान आसान था, शुरू होने तक", "मैं इसे संतुलन कहता हूं", "मेरे दिमाग में तो काम कर गया",
      "किसी ने नहीं बताया कि आज है", "थ्योरी बिल्कुल सही थी", "प्रैक्टिकल ने छुट्टी ले ली",
      "इतना असली क्यों लग रहा है", "व्यवस्था के लिए एक मिनट", "ट्यूटोरियल में आसान था",
      "मुख्य बात है अंदाज बनाए रखना", "फोकस, कॉफी और कई टैब", "स्क्रिप्ट खुद बदल गई",
      "सांस लो और शांत दिखो", "सर्वाइवल मोड चालू", "लगभग प्रोफेशनल",
      "कॉन्सेप्ट ज्यादा, बैटरी कम", "सोच जीत गई, काम हार गया",
    ],
    flavors: [
      "बिना मैनुअल", "अंदर ही अंदर", "स्टाइल में", "थ्योरी में", "लगभग ठीक", "चुपचाप",
      "बिना दर्शक", "बीटा वर्जन", "टर्बो मोड", "अचानक", "थोड़ी देर से", "बिना स्क्रिप्ट",
      "धीरे से", "काफी ठीक", "टेस्ट मोड", "पोज के साथ", "इम्प्रोवाइज",
      "छोटा संकट", "पूरा सस्पेंस", "बहुत चुपचाप", "झूठी शांति", "आधा आधिकारिक",
      "गंभीर चेहरा", "कम ऊर्जा", "तैयारी शून्य", "हिम्मत के भरोसे", "एयरप्लेन मोड",
      "ऑटोमैटिक", "बहुत राय", "गारंटी नहीं", "फुल स्क्रीन",
    ],
    banned: [/भगवान|अल्लाह|धर्म|पाप|मंदिर|मस्जिद|नरक/i, /मार|मर|खून|युद्ध|बम|हथियार|नफरत|चोरी/i, /सेक्स|नंगा|शराब|बीयर/i, /पागल|बेवकूफ|अंधा|बहरा|लंगड़ा/i],
  },
  ar: {
    name: "ميمز (AR)",
    hashtags: "#ميمز #ضحك #كوميديا #relatable #shorts",
    subjects: [
      "أنا", "عقلي", "صبري", "خطتي", "إنتاجيتي", "ميزانيتي",
      "نومي", "طاقتي", "المجموعة", "الاجتماع", "الاثنين", "الموعد النهائي",
      "الإنترنت", "التطبيق", "قائمة المهام", "الجانب المسؤول مني", "الجانب المتسرع مني",
      "تركيزي", "القهوة", "الإشعار", "الواي فاي", "المحادثة", "روتيني", "مزاجي",
    ],
    situations: [
      "أحاول أن أبدو طبيعيًا", "بعد سماع \"دقيقتان فقط\"", "عندما يبقى تفصيل واحد",
      "قبل أول قهوة", "عندما تتغير الخطة", "أفتح جدول الأسبوع",
      "أعد نفسي بالنوم مبكرًا", "أقرأ نفس الرسالة مرة أخرى", "عندما كان الاتصال يكفيه نص",
      "أرى البطارية 1%", "أحاول التوفير", "عندما تفتح الصفحة أخيرًا",
      "أستلم مهمة بسيطة أخرى", "عندما يصبح الصمت غريبًا", "أحاول الرد بهدوء",
      "بعد خمس دقائق من التركيز", "عندما بدا كل شيء منتهيًا", "أرى سلة المشتريات",
      "عندما يظهر التحديث", "أحاول ألا أفتح تبويبًا جديدًا", "عندما تصبح الخطة ب هي الخطة أ",
      "بعد قول \"سأتولى الأمر\"", "عندما يظهر التذكير", "أحاول الحفاظ على الأناقة",
    ],
    outcomes: [
      "وفي الداخل عشرون تبويبًا مفتوحًا", "لكن الطاقة خرجت للاستراحة", "بطاقة مساء الجمعة",
      "وأتظاهر أنني فهمت كل شيء", "وأبحث عن مخرج بهدوء", "ثلاث أفكار وشجاعة صفر",
      "وأعتبر هذا تنظيمًا", "والفوضى تقف في الطابور", "بثقة مستعارة بالكامل",
      "والساعة تركض أسرع", "لكن الأريكة فازت", "وكلمة المرور ضاعت من جديد",
      "بوجه شخص لديه طريقة", "لكن الطريقة كانت حظًا", "والثلاجة نادت أولًا",
      "بسلام مؤقت جدًا", "وأجهز عذرًا جديدًا", "ولا أحد كان يحتاج لمعرفة ذلك",
      "بابتسامة من قبل المصير", "لكنني لم أقبل فعلًا", "آخر خلية طلبت إجازة",
      "دراما تكفي لموسم كامل", "على الأقل يبدو مرتبًا", "والآن صار مشكلة الغد",
    ],
    closers: [
      "حياة الكبار في صورة واحدة", "انتصارات صغيرة وتعب كبير", "كل شيء تحت السيطرة حسب وجهي",
      "كانت الخطة سهلة حتى بدأت", "أسمي هذا توازنًا", "نجحت داخل رأسي",
      "لم يخبرني أحد أن الموعد اليوم", "النظرية كانت ممتازة", "التطبيق طلب استراحة",
      "لماذا يبدو هذا حقيقيًا جدًا", "دقيقة صمت للنظام", "كان سهلًا في الشرح",
      "المهم الحفاظ على المظهر", "تركيز وقهوة وتبويبات كثيرة", "النص تغير وحده",
      "تنفس واظهر هادئًا", "وضع النجاة يعمل", "شبه محترف",
      "أفكار كثيرة وبطارية قليلة", "الفكرة فازت والفعل تأجل",
    ],
    flavors: [
      "بلا دليل", "من الداخل", "بأسلوب", "نظريًا", "تقريبًا", "بهدوء",
      "بلا جمهور", "نسخة تجريبية", "وضع سريع", "فجأة", "متأخر قليلًا", "بلا نص",
      "بخفّة", "شبه مرتب", "وضع اختبار", "مع وقفة", "ارتجال كامل",
      "أزمة صغيرة", "تشويق كامل", "بهدوء شديد", "هدوء مزيف", "نصف رسمي",
      "وجه جاد", "طاقة منخفضة", "بلا تحضير", "بالعناد", "وضع الطيران",
      "تلقائيًا", "آراء كثيرة", "بلا ضمان", "ملء الشاشة",
    ],
    banned: [/الله|دين|خطيئة|كنيسة|مسجد|جحيم/i, /قتل|موت|دماء|الدم|دموي|حرب|قنبلة|سلاح|كره|سرقة/i, /جنس|عاري|سكران|بيرة|نبيذ/i, /مجنون|غبي|أعمى|أصم|معاق/i],
  },
};

const source = JSON.parse(readFileSync(SOURCE, "utf8"));
const templates = [];
const seenPhoto = new Set();
for (const card of source) {
  if (!card?.photoFile || seenPhoto.has(card.photoFile)) continue;
  seenPhoto.add(card.photoFile);
  templates.push({ photoFile: card.photoFile, theme: card.theme || "", srcFile: card.srcFile || "" });
}

function captionFor(cfg, templateIndex, slot) {
  const i = templateIndex + 1;
  const line1 = `${cfg.subjects[(i + slot * 3) % cfg.subjects.length]} ${cfg.situations[(i * 5 + slot) % cfg.situations.length]}`;
  const flavor = cfg.flavors[(i * 19 + slot * 13) % cfg.flavors.length];
  const line2Base = slot % 3 === 0
    ? cfg.closers[(i * 11 + slot * 5) % cfg.closers.length]
    : cfg.outcomes[(i * 7 + slot * 2) % cfg.outcomes.length];
  return `${line1}\n${line2Base} ${flavor}`;
}

function validateCaption(cfg, caption) {
  const lines = caption.split("\n");
  if (lines.length !== 2) return "expected two lines";
  if (caption.length < 12 || caption.length > 145) return "length out of range";
  if (lines.some((line) => line.length > 74)) return "line too long";
  if (cfg.banned.some((rule) => rule.test(caption))) return "banned term";
  return "";
}

for (const [lang, cfg] of Object.entries(common)) {
  const cards = [];
  const seen = new Set();
  for (const [templateIndex, template] of templates.entries()) {
    for (let slot = 0; slot < PER_TEMPLATE; slot++) {
      const caption = captionFor(cfg, templateIndex, slot);
      const error = validateCaption(cfg, caption);
      if (error) throw new Error(`${lang} ${template.photoFile} #${slot}: ${error}: ${caption}`);
      const key = `${template.photoFile}\0${caption}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({
        caption,
        photoFile: template.photoFile,
        format: "board",
        theme: template.theme,
        srcFile: template.srcFile,
      });
    }
  }

  const outDir = resolve(ROOT, `data/memes-${lang}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "cards.json"), `${JSON.stringify(cards, null, 2)}\n`);
  writeFileSync(
    resolve(outDir, "index.json"),
    `${JSON.stringify(
      {
        total: cards.length,
        packs: 1,
        packSize: cards.length,
        withPhoto: cards.length,
        range: [1, templates.length],
        source:
          "Original localized captions over the existing local meme-board template image set. No new external images downloaded.",
        safety: {
          filters: "religion/adult/violence/protected-class blocklist + length checks",
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`memes-${lang}: ${cards.length} cards across ${templates.length} board templates`);
}
