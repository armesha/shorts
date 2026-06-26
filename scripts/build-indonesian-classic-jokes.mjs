#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "data/anecdotes-id");
const PACK_SIZE = 300;

const SOURCES = [
  {
    id: "wikibooks-humor-id",
    title: "Humor",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor",
    rights:
      "Indonesian Wikibooks footer marks text as Creative Commons Attribution-ShareAlike; keep page URLs and attribution.",
  },
  {
    id: "tjerita-aboe-nawas-wikisource-commons",
    title: "Tjerita Aboe Nawas dengan Radja Haroenarrasid di Negri Bagdad",
    sourceUrl: "https://id.wikisource.org/wiki/Indeks:Tjerita_Aboe_Nawas_dengan_Radja_Haroenarrasid_di_Negri_Bagdad.pdf",
    commonsUrl:
      "https://commons.wikimedia.org/wiki/File:Tjerita_Aboe_Nawas_dengan_Radja_Haroenarrasid_di_Negri_Bagdad.pdf",
    rights:
      "Wikimedia Commons marks the PDF public-domain in Indonesia; Indonesian Wikisource index text is under CC BY-SA. Keep both URLs and attribution.",
    metadataNote:
      "The Commons file page and Indonesian Wikisource index disagree on author/year metadata. Treat this deck as source-backed adapted excerpts from the linked PDF/index, not as definitive bibliographic metadata.",
  },
];

const CARDS = [
  {
    title: "Sapi Hitam dan Sapi Putih",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Gembala sapi",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Gembala_sapi",
    text:
      "Seorang turis bertanya kepada gembala sapi, 'Sapi yang hitam diberi makan apa?' Gembala menjawab, 'Rumput basah.'\n\n'Kalau yang putih?' tanya turis.\n\n'Sama,' jawab gembala.",
  },
  {
    title: "Pertanyaan yang Sama",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Gembala sapi",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Gembala_sapi",
    text:
      "Turis itu bertanya lagi, 'Sapi hitam menghasilkan susu berapa liter sehari?'\n\n'Satu liter,' jawab gembala.\n\n'Kalau yang putih?'\n\n'Sama,' jawab gembala lagi. Turis mulai merasa seperti sedang ikut ujian yang soalnya berulang.",
  },
  {
    title: "Milik Saya",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Gembala sapi",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Gembala_sapi",
    text:
      "Turis akhirnya kesal. 'Kenapa selalu dibedakan, hitam dulu atau putih dulu?'\n\nGembala menjawab santai, 'Soalnya yang hitam itu milik saya.'\n\n'Kalau yang putih?'\n\n'Sama.'",
  },
  {
    title: "Makanan Sapi",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Cari makan sendiri",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Cari_makan_sendiri",
    text:
      "Seorang peternak ditanya, 'Sapi-sapi ini setiap hari diberi makan apa?'\n\nIa menjawab, 'Rumput biasa.'\n\nOrang itu berkata, 'Terlalu sederhana.' Peternak pun bingung. Beberapa hari kemudian, ia ditanya lagi dan menjawab, 'Keju, roti, dan susu.'\n\n'Terlalu mewah,' kata orang itu.",
  },
  {
    title: "Uang Saku Sapi",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Cari makan sendiri",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Cari_makan_sendiri",
    text:
      "Karena dua jawaban sebelumnya selalu salah, peternak menyiapkan jawaban baru.\n\nSaat ditanya lagi, ia berkata, 'Sekarang saya beri uang saku saja. Jadi sapi-sapi itu bisa cari makan sendiri sesuai selera.'",
  },
  {
    title: "Dua Lutut",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Lutut sakit",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Lutut_sakit",
    text:
      "Seorang kakek datang ke dokter. 'Dok, lutut kanan saya sakit sekali.'\n\nDokter berkata, 'Kakek sudah hampir seratus tahun. Wajar kalau lutut sakit.'\n\nKakek menjawab, 'Tapi lutut kiri saya umurnya sama, dan dia tidak protes.'",
  },
  {
    title: "Pelajaran Cepat",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Cape Deh",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Cape_Deh",
    text:
      "Di kelas, guru bertanya, 'Lima puluh ditambah lima puluh berapa?'\n\nMurid menjawab, 'Seratus, Bu.'\n\nGuru tersenyum. 'Bagus. Sekarang kalau belajar terlalu lama rasanya apa?'\n\nMurid menjawab, 'Capek, Bu. Itu juga hasil hitungan.'",
  },
  {
    title: "Bahasa Inggris",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Cape Deh",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Cape_Deh",
    text:
      "Guru bertanya, 'Bahasa Inggrisnya bentuk apa?'\n\nMurid menjawab, 'Shape, Bu.'\n\n'Ejaannya?'\n\n'S-H-A-P-E.'\n\nGuru mengangguk. Murid menambahkan pelan, 'Kalau pelajarannya panjang sekali, jadinya capek deh.'",
  },
  {
    title: "Kolam Dingin",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-06-excerpt-01", "abunawas-id-06-excerpt-03"],
    text:
      "Seorang pedagang membuat tantangan: siapa yang tahan berendam semalam di kolam yang sangat dingin akan mendapat hadiah. Seorang pria miskin mencoba. Ia menggigil sampai pagi, tetapi berhasil keluar hidup-hidup.",
  },
  {
    title: "Alasan Pedagang",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-06-excerpt-03", "abunawas-id-06-excerpt-09"],
    text:
      "Ketika pria itu meminta hadiah, pedagang menolak. 'Semalam anakmu menyalakan api di tepi kolam. Itu pasti membuatmu hangat.'\n\nPria itu heran. Api itu jauh sekali, bahkan air kolam tetap sedingin semula.",
  },
  {
    title: "Dapur Abu Nawas",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-06-excerpt-07", "abunawas-id-06-excerpt-09"],
    text:
      "Abu Nawas mengundang semua orang makan. Di halaman, ia menggantung panci tinggi-tinggi, sementara api kecil menyala jauh di bawahnya.\n\nTamu menunggu lama, tetapi masakan tidak juga matang.",
  },
  {
    title: "Api yang Terlalu Jauh",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-06-excerpt-07", "abunawas-id-06-excerpt-09"],
    text:
      "Para tamu bertanya, 'Bagaimana panci setinggi itu bisa matang dengan api sejauh itu?'\n\nAbu Nawas menjawab, 'Kalau api jauh bisa menghangatkan orang di kolam, tentu api jauh juga bisa memasak nasi.' Semua orang langsung paham maksudnya.",
  },
  {
    title: "Janji Kambing",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-05-excerpt-02", "abunawas-id-05-excerpt-08"],
    text:
      "Seorang saudagar pernah berjanji akan memberi kambing bertanduk selebar satu jengkal jika keinginannya terkabul. Saat waktunya tiba, ia bingung: kambing seperti itu tidak mudah ditemukan.",
  },
  {
    title: "Ukuran yang Tepat",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-05-excerpt-08", "abunawas-id-05-excerpt-12"],
    text:
      "Abu Nawas melihat anak kecil saudagar itu dan berkata, 'Jengkal siapa yang dipakai waktu berjanji?'\n\nSaudagar terdiam. Abu Nawas lalu mengukur tanduk kambing dengan jengkal anak kecil itu. Ukurannya pas.",
  },
  {
    title: "Janji Selesai",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-05-excerpt-12"],
    text:
      "Orang-orang tertawa karena jawabannya sederhana. Janji saudagar terpenuhi, kambingnya tidak perlu dicari sampai ke seluruh negeri, dan Abu Nawas pulang dengan tenang seolah semuanya memang mudah sejak awal.",
  },
  {
    title: "Sapi Pusaka",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-09-excerpt-04", "abunawas-id-09-excerpt-05"],
    text:
      "Seorang pejabat melihat sapi yang disebut sebagai sapi pusaka. Penjual memasang harga tinggi. Setelah tawar-menawar selesai, tali sapi diberikan kepada pembeli, tetapi sapinya sudah tidak ada di tempat.",
  },
  {
    title: "Yang Dibeli",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-09-excerpt-05"],
    text:
      "Pembeli marah. 'Di mana sapinya?'\n\nPenjual menjawab, 'Yang Tuan pegang itu talinya.'\n\nAbu Nawas tersenyum dari jauh. Kadang orang terlalu sibuk menawar sampai lupa memastikan apa sebenarnya yang sedang dibeli.",
  },
  {
    title: "Tamu yang Lama",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-05-excerpt-07"],
    text:
      "Abu Nawas dipanggil berkali-kali, tetapi ia tidak segera datang. Ketika akhirnya ditanya, ia menjawab dengan tenang, 'Saya sedang mencari alasan yang cukup kuat agar perjalanan saya terdengar penting.'",
  },
  {
    title: "Jawaban Ringan",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-05-excerpt-08"],
    text:
      "Saat orang-orang mengira persoalannya rumit, Abu Nawas berkata, 'Jangan dibuat berat dulu. Kadang masalah besar hanya butuh pertanyaan kecil yang tepat.' Setelah itu ia bertanya satu hal sederhana, dan semua orang berhenti berdebat.",
  },
  {
    title: "Pekerjaan Mudah",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-06-excerpt-06", "abunawas-id-06-excerpt-07"],
    text:
      "Abu Nawas berkata ingin mengundang tamu. Orang-orang mengira ia menyiapkan hidangan besar. Ternyata yang ia siapkan justru pertanyaan besar: bagaimana mungkin sesuatu yang jauh sekali bisa memberi panas yang cukup?",
  },
  {
    title: "Akal di Halaman",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-06-excerpt-07", "abunawas-id-06-excerpt-09"],
    text:
      "Di halaman rumah, Abu Nawas tidak banyak bicara. Ia hanya menunjuk panci yang jauh dari api. Semua orang melihat sendiri: bila panas tidak sampai ke panci, tentu api kecil di tepi kolam juga tidak sampai menghangatkan orang yang berendam.",
  },
  {
    title: "Tali Tanpa Sapi",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-09-excerpt-04", "abunawas-id-09-excerpt-05"],
    text:
      "Ada orang yang pulang membawa tali dan merasa sudah membeli sapi. Abu Nawas menjadikan kisah itu bahan pelajaran: kalau yang dilihat hanya talinya, jangan heran kalau yang terbawa pulang juga hanya tali.",
  },
  {
    title: "Jengkal Kecil",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-05-excerpt-02", "abunawas-id-05-excerpt-12"],
    text:
      "Semua orang mencari kambing bertanduk lebar. Abu Nawas justru mencari tangan kecil. Ia berkata, 'Ukuran selalu bergantung pada siapa yang mengukur.' Setelah itu masalah yang berhari-hari dibicarakan selesai dalam sebentar.",
  },
  {
    title: "Hadiah yang Adil",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-06-excerpt-01", "abunawas-id-06-excerpt-09"],
    text:
      "Pria yang berendam semalam tidak meminta lebih dari janji awal. Abu Nawas pun tidak perlu marah. Ia cukup membuat contoh yang lucu, lalu membiarkan semua orang sampai pada kesimpulan yang sama: janji harus dibayar.",
  },
  {
    title: "Salam dari Echa",
    sourceId: "wikibooks-humor-id",
    sourcePage: "Humor/Cape Deh",
    sourceUrl: "https://id.wikibooks.org/wiki/Humor/Cape_Deh",
    text:
      "Guru berkata, 'Bu Guru dapat salam dari Echa.'\n\nMurid-murid menunggu sebentar, lalu ada yang menyambung, 'E-Chape deh.'\n\nPelajaran selesai, tetapi permainan katanya masih ikut pulang.",
  },
  {
    title: "Batu yang Retak",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-02-excerpt-01"],
    text:
      "Raja menunjukkan lumpang batu yang retak dan meminta Abu Nawas menjahitnya kembali. Semua orang menunggu jawaban, sebab batu sebesar itu tentu bukan kain yang bisa disulam begitu saja.",
  },
  {
    title: "Benang dari Batu",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-02-excerpt-02"],
    text:
      "Abu Nawas datang membawa sekeranjang batu kecil. Ia berkata, 'Kalau batu besar harus dijahit, batu kecil ini tolong dipintal dulu menjadi benang.' Raja terdiam; syaratnya berbalik kepada pemberi perintah.",
  },
  {
    title: "Tukang Jahit Batu",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-02-excerpt-01", "abunawas-id-02-excerpt-02"],
    text:
      "Orang bisa menjahit kain karena ada benangnya. Abu Nawas membuat perkara itu tampak sederhana: sebelum ia menjahit lumpang, istana harus menyediakan benang batu. Permintaan yang mustahil dijawab dengan bahan yang sama mustahilnya.",
  },
  {
    title: "Suara Pipa Air",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-15-excerpt-01"],
    text:
      "Raja bertanya kepada para pembesar, 'Apa arti bunyi air dalam pipa ini?' Tidak ada yang menjawab. Abu Nawas dipanggil, mendengar suaranya, lalu berkata bahwa air itu sedang bertanya kabar kepada api di atasnya.",
  },
  {
    title: "Air Menyapa Api",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-15-excerpt-01"],
    text:
      "Jawaban Abu Nawas ringan sekali: bunyi pipa bukan rahasia besar, melainkan percakapan kecil antara air dan api. Setelah itu raja masuk ke istana tanpa membantah, dan orang-orang bubar sambil menyimpan senyum.",
  },
  {
    title: "Perintah yang Aneh",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-16-excerpt-01"],
    text:
      "Abu Nawas mendapat pesan: datanglah, tetapi jangan berjalan di tanah, jangan naik kendaraan, jangan kepanasan, dan jangan pula berteduh. Perintahnya terdengar seperti teka-teki yang sengaja dibuat tanpa jalan keluar.",
  },
  {
    title: "Kuda dan Payung",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-16-excerpt-01"],
    text:
      "Abu Nawas mengikat kudanya erat-erat, membawa payung, lalu duduk dengan satu kaki tergantung. Ia tidak berjalan di tanah, tidak benar-benar naik kendaraan, tidak kena panas, dan juga tidak sepenuhnya berteduh.",
  },
  {
    title: "Tidak Melanggar",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-16-excerpt-01"],
    text:
      "Ketika Abu Nawas tiba, raja melihat tingkahnya dan heran. Semua larangan telah dipatuhi dengan cara yang tidak terpikirkan sebelumnya. Kadang jawaban paling rapi muncul dari membaca perintah terlalu harfiah.",
  },
  {
    title: "Teka-teki Istana",
    sourceId: "tjerita-aboe-nawas-wikisource-commons",
    evidenceIds: ["abunawas-id-16-excerpt-01"],
    text:
      "Perintah istana bermaksud menjebak Abu Nawas. Ia justru mengubahnya menjadi teka-teki gerak: separuh naik, separuh tidak, separuh berteduh, separuh tidak. Raja akhirnya hanya bisa mengakui kecerdikannya.",
  },
];

function sourceFor(card) {
  const source = SOURCES.find((item) => item.id === card.sourceId);
  if (!source) throw new Error(`Unknown source ${card.sourceId}`);
  return source;
}

function safetyFlags(text) {
  const rules = [
    ["religion", /\b(Allah|Tuhan|Rasul|Nabi|imam|masjid|mesjid|syara|dosa|halal|haram|sembahyang|Jumat|tahlil|jenazah)\b/i],
    ["protected_class", /\b(Cina|Tjina|Arab|Jawa|Djawa|Yahudi|Jahudi|buta|tuli|toeli|gila|cacat|idiot)\b/i],
    ["modern_politics", /\b(DPR|pemilu|partai|presiden|menteri|polisi|hakim|pengadilan|terdakwa|sidang)\b/i],
    ["adult", /\b(bercinta|seks|selingkuh|birahi|kawin|nikah|hamil|istri|suami|bini|telanjang)\b/i],
    ["violence", /\b(bunuh|membunuh|mati|darah|pedang|senjata|pukul|potong|hukuman|penjara|perang|tenggelam)\b/i],
    ["gross", /\b(buang gas|tahi|kencing|berak|najis|muntah|busuk)\b/i],
    ["coarse", /\b(goblok|bajingan|keparat|tolol|bodoh)\b/i],
  ];
  return rules.filter(([, re]) => re.test(text)).map(([id]) => id);
}

const selected = CARDS.map((card, index) => {
  const source = sourceFor(card);
  const flags = safetyFlags(card.text);
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
    evidenceIds: card.evidenceIds ?? [],
    curation: {
      edits:
        card.sourceId === "wikibooks-humor-id"
          ? "trimmed and lightly rewritten from Wikibooks CC BY-SA page; unsafe punchlines removed"
          : "manual cleanup/adaptation from Abu Nawas OCR excerpts; old spelling normalized; unsafe religious/violence/adult/protected-class material excluded",
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
          "Indonesian Wikibooks/Abu Nawas source ledger + manual curation + religion/protected-class/modern-politics/adult/violence/gross/coarse blocklist.",
        note:
          "Small starter ID text layer for jokes_memes. It is intentionally source-backed and conservative; it is not a large modern joke corpus.",
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
        "Wikibooks text is CC BY-SA. Abu Nawas PDF/index is tracked through Commons public-domain notice and Indonesian Wikisource CC BY-SA text. Retain source URLs and attribution when publishing outside this app.",
      generatedAt: new Date().toISOString(),
      sourceCounts: SOURCES.map((source) => ({
        id: source.id,
        title: source.title,
        selected: selected.filter((card) => card.sourceId === source.id).length,
      })),
      sources: SOURCES,
      blockedPolicy:
        "Rejected religion, protected-class/ethnicity/disability jokes, modern political/legal setups, adult/family-bedroom setups, violence/death/punishment, gross-out, coarse insults, OCR noise, and non-standalone excerpts.",
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify({ deck: "id", total: selected.length, outDir: OUT_DIR }, null, 2));
