import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const TARGET_TEMPLATES = 30;
const LONG_BASE_TEMPLATES = 32;
const LONG_SCENE_TEMPLATES = 10;
const LONG_TARGET_TEMPLATES = LONG_BASE_TEMPLATES + LONG_SCENE_TEMPLATES;
const LONG_SCENE_CARDS = LONG_SCENE_TEMPLATES;
const NOW = "2026-06-23T09:20:00.000Z";

const CORPUS_DIR = resolve(ROOT, "local-assets/corpora/spanish-jokes-public-domain");
const RAW_DIR = resolve(CORPUS_DIR, "raw");
const ASSET_DIR = resolve(ROOT, "assets/template-packs/spanish-jokes");
const TEMPLATE_DIR = resolve(ASSET_DIR, "templates");
const BG_DIR = resolve(ASSET_DIR, "backgrounds");
const PACK_FILE = resolve(ROOT, "data/packs/chistes-es-public-domain.json");
const LONG_ASSET_DIR = resolve(ROOT, "assets/template-packs/spanish-jokes-long");
const LONG_TEMPLATE_DIR = resolve(LONG_ASSET_DIR, "templates");
const LONG_BG_DIR = resolve(LONG_ASSET_DIR, "backgrounds");
const RUSSIAN_SCENE_BG_DIR = resolve(ROOT, "assets/backgrounds/russian_jokes");
const LONG_PACK_FILE = resolve(ROOT, "data/packs/chistes-es-long.json");
const LEGACY_PREVIEW_PACK_FILE = resolve(ROOT, "data/packs/chistes-es-preview.json");
const LEGACY_1000_PACK_FILE = resolve(ROOT, "data/packs/chistes-es-1000.json");

const sources = [
  {
    id: "el-tesoro-de-los-chistes-1847",
    title: "El Tesoro de los chistes",
    year: 1847,
    author: "unknown compilation",
    rawFile: "raw/el-tesoro-de-los-chistes-1847.txt",
    sourceUrl: "https://archive.org/details/eltesorodelosch00satogoog",
    fullTextUrl: "https://archive.org/download/eltesorodelosch00satogoog/eltesorodelosch00satogoog_djvu.txt",
    rights: "Internet Archive metadata: possible-copyright-status=NOT_IN_COPYRIGHT",
    useForCards: true,
  },
  {
    id: "museo-comico-tomo-2-1863",
    title: "Museo cómico ó tesoro de los chistes, tomo 2",
    year: 1863,
    author: "Manuel Ossorio y Bernard, Juan Palau y Coll",
    rawFile: "raw/museo-comico-tomo-2-1863.txt",
    sourceUrl: "https://archive.org/details/museocmicote02palauoft",
    fullTextUrl: "https://archive.org/download/museocmicote02palauoft/museocmicote02palauoft_djvu.txt",
    rights: "Public-domain age check: published 1863; verify local jurisdiction before commercial reuse.",
    useForCards: false,
    excludedReason: "OCR quality is lower than the Boira/Tesoro scans; kept in the ledger and raw safety stats only.",
  },
  {
    id: "nueva-floresta-1790",
    title: "Nueva floresta, ó colección de chistes",
    year: 1790,
    author: "Bernardo María de Calzada",
    rawFile: "raw/nuevaflorestac00calz_djvu.txt",
    sourceUrl: "https://archive.org/details/nuevaflorestac00calz",
    fullTextUrl: "https://archive.org/download/nuevaflorestac00calz/nuevaflorestac00calz_djvu.txt",
    rights: "Public-domain age check: published 1790; Internet Archive scan has full OCR text.",
    useForCards: true,
  },
  {
    id: "nueva-floresta-espanola-1853",
    title: "Nueva Floresta Española",
    year: 1853,
    author: "Ignacio Castellar",
    rawFile: "raw/nuevaflorestaesp00cast_djvu.txt",
    sourceUrl: "https://archive.org/details/nuevaflorestaesp00cast",
    fullTextUrl: "https://archive.org/download/nuevaflorestaesp00cast/nuevaflorestaesp00cast_djvu.txt",
    rights: "Public-domain age check: published 1853; Internet Archive scan has full OCR text.",
    useForCards: true,
  },
  {
    id: "floresta-espanola-1790-tomo-1",
    title: "Floresta Española, de apotegmas, tomo 1",
    year: 1790,
    author: "Melchor de Santa Cruz de Dueñas; Francisco Asensio y Mejorado",
    rawFile: "raw/florestaespaola00mejogoog_djvu.txt",
    sourceUrl: "https://archive.org/details/florestaespaola00mejogoog",
    fullTextUrl: "https://archive.org/download/florestaespaola00mejogoog/florestaespaola00mejogoog_djvu.txt",
    rights: "Internet Archive metadata: possible-copyright-status=NOT_IN_COPYRIGHT; published 1790.",
    useForCards: true,
  },
  {
    id: "floresta-espanola-1790-tomo-2",
    title: "Floresta Española, de apotegmas, tomo 2",
    year: 1790,
    author: "Melchor de Santa Cruz de Dueñas; Francisco Asensio y Mejorado",
    rawFile: "raw/florestaespaola01mejogoog_djvu.txt",
    sourceUrl: "https://archive.org/details/florestaespaola01mejogoog",
    fullTextUrl: "https://archive.org/download/florestaespaola01mejogoog/florestaespaola01mejogoog_djvu.txt",
    rights: "Internet Archive metadata: possible-copyright-status=NOT_IN_COPYRIGHT; published 1790.",
    useForCards: true,
  },
  {
    id: "almanaque-de-los-chistes-1866",
    title: "Almanaque de los chistes para 1867",
    year: 1866,
    author: "F. de P. Hidalgo",
    rawFile: "raw/CASGA_380305_007_djvu.txt",
    sourceUrl: "https://archive.org/details/CASGA_380305_007",
    fullTextUrl: "https://archive.org/download/CASGA_380305_007/CASGA_380305_007_djvu.txt",
    rights: "Public-domain age check: published 1866; Internet Archive scan has full OCR text.",
    useForCards: true,
  },
  {
    id: "tirso-cuentos-fabulas-dichos-agudos-1848-tomo-1",
    title: "Cuentos, fábulas, diálogos, máximas, apotegmas, epigramas y dichos agudos, tomo 1",
    year: 1848,
    author: "Tirso de Molina",
    rawFile: "raw/cuentosfabulasd00moligoog_djvu.txt",
    sourceUrl: "https://archive.org/details/cuentosfabulasd00moligoog",
    fullTextUrl: "https://archive.org/download/cuentosfabulasd00moligoog/cuentosfabulasd00moligoog_djvu.txt",
    rights: "Internet Archive metadata: possible-copyright-status=NOT_IN_COPYRIGHT; published 1848.",
    useForCards: true,
  },
  {
    id: "tirso-cuentos-fabulas-dichos-agudos-1848-tomo-2",
    title: "Cuentos, fábulas, diálogos, máximas, apotegmas, epigramas y dichos agudos, tomo 2",
    year: 1848,
    author: "Tirso de Molina",
    rawFile: "raw/cuentosfabulasd01moligoog_djvu.txt",
    sourceUrl: "https://archive.org/details/cuentosfabulasd01moligoog",
    fullTextUrl: "https://archive.org/download/cuentosfabulasd01moligoog/cuentosfabulasd01moligoog_djvu.txt",
    rights: "Internet Archive metadata: possible-copyright-status=NOT_IN_COPYRIGHT; published 1848.",
    useForCards: true,
  },
  {
    id: "sales-espanolas-primera-1890",
    title: "Sales españolas ó agudezas del ingenio nacional, primera serie",
    year: 1890,
    author: "Antonio Paz y Mélia",
    rawFile: "raw/salesespaolas01pazyuoft_djvu.txt",
    sourceUrl: "https://archive.org/details/salesespaolas01pazyuoft",
    fullTextUrl: "https://archive.org/download/salesespaolas01pazyuoft/salesespaolas01pazyuoft_djvu.txt",
    rights: "Public-domain age check: published 1890; author died in 1927, public-domain in Spain and pre-1929 in the US.",
    useForCards: false,
    excludedReason: "After filtering, surviving snippets are often archaic glossary/proverb/social fragments rather than clean short jokes.",
  },
  {
    id: "sales-espanolas-segunda-1890",
    title: "Sales españolas ó agudezas del ingenio nacional, segunda serie",
    year: 1890,
    author: "Antonio Paz y Mélia",
    rawFile: "raw/salesespaolas02pazyuoft_djvu.txt",
    sourceUrl: "https://archive.org/details/salesespaolas02pazyuoft",
    fullTextUrl: "https://archive.org/download/salesespaolas02pazyuoft/salesespaolas02pazyuoft_djvu.txt",
    rights: "Public-domain age check: published 1890; author died in 1927, public-domain in Spain and pre-1929 in the US.",
    useForCards: false,
    excludedReason: "After filtering, surviving snippets are often archaic glossary/proverb/social fragments rather than clean short jokes.",
  },
  {
    id: "cuentos-chascarrillos-1898",
    title: "Cuentos y chascarrillos andaluces",
    year: 1898,
    author: "Fulano, Zutano, Mengano y Perengano",
    rawFile: "raw/cuentosychascar00pseugoog_djvu.txt",
    sourceUrl: "https://archive.org/details/cuentosychascar00pseugoog",
    fullTextUrl: "https://archive.org/download/cuentosychascar00pseugoog/cuentosychascar00pseugoog_djvu.txt",
    rights: "Internet Archive metadata: NOT_IN_COPYRIGHT; published 1898.",
    useForCards: false,
    excludedReason: "Regional/dialect source with a higher protected-class and adult-setup risk; retained in the ledger only.",
  },
  {
    id: "galas-del-ingenio-1879",
    title: "Galas del ingenio, cuentos, pensamientos y agudezas",
    year: 1879,
    author: "Eduardo Bustillo; Eduardo de Lustonó",
    rawFile: "raw/galasdelingenioc00bustuoft_djvu.txt",
    sourceUrl: "https://archive.org/details/galasdelingenioc00bustuoft",
    fullTextUrl: "https://archive.org/download/galasdelingenioc00bustuoft/galasdelingenioc00bustuoft_djvu.txt",
    rights: "Public-domain age check: published 1879; Internet Archive scan has full OCR text.",
    useForCards: false,
    excludedReason: "Mostly verse and literary fragments after filtering; retained in the ledger only.",
  },
  {
    id: "tesoro-de-cuentos-1864",
    title: "Tesoro de cuentos",
    year: 1864,
    author: "Ángel Fernández de los Ríos",
    rawFile: "raw/tesorodecuentos00rogoog_djvu.txt",
    sourceUrl: "https://archive.org/details/tesorodecuentos00rogoog",
    fullTextUrl: "https://archive.org/download/tesorodecuentos00rogoog/tesorodecuentos00rogoog_djvu.txt",
    rights: "Internet Archive metadata: NOT_IN_COPYRIGHT; kept in the ledger but excluded because it is mostly long stories, not short jokes.",
    useForCards: false,
    excludedReason: "Long story collection; not a clean source of short joke cards.",
  },
  {
    id: "tesoro-de-cuentos-1875",
    title: "Tesoro de cuentos, tomo 2",
    year: 1875,
    author: "Ángel Fernández de los Ríos",
    rawFile: "raw/tesorodecuentos01rogoog_djvu.txt",
    sourceUrl: "https://archive.org/details/tesorodecuentos01rogoog",
    fullTextUrl: "https://archive.org/download/tesorodecuentos01rogoog/tesorodecuentos01rogoog_djvu.txt",
    rights: "Internet Archive metadata: NOT_IN_COPYRIGHT; kept in the ledger but excluded because it is mostly long stories, not short jokes.",
    useForCards: false,
    excludedReason: "Long story collection; not a clean source of short joke cards.",
  },
  {
    id: "manojico-de-cuentos-1895",
    title: "Manojico de cuentos",
    year: 1895,
    author: "Manuel Polo y Peyrolón",
    rawFile: "raw/manojicodecuent00peyrgoog_djvu.txt",
    sourceUrl: "https://archive.org/details/manojicodecuent00peyrgoog",
    fullTextUrl: "https://archive.org/download/manojicodecuent00peyrgoog/manojicodecuent00peyrgoog_djvu.txt",
    rights: "Internet Archive metadata: NOT_IN_COPYRIGHT; kept in the ledger but excluded because it is mostly moral stories.",
    useForCards: false,
    excludedReason: "Moral story collection; retained for the source ledger only.",
  },
  {
    id: "epitome-eloquencia-1726",
    title: "Epitome de la eloquencia española",
    year: 1726,
    author: "Francisco Joseph Artiga",
    rawFile: "raw/epitomedelaeloqv00arti_djvu.txt",
    sourceUrl: "https://archive.org/details/epitomedelaeloqv00arti",
    fullTextUrl: "https://archive.org/download/epitomedelaeloqv00arti/epitomedelaeloqv00arti_djvu.txt",
    rights: "Public-domain age check: published 1726; kept in the ledger but excluded because the scan is mostly rhetoric examples, not short jokes.",
    useForCards: false,
    excludedReason: "Rhetoric manual with many religious/political examples and old OCR; retained for source accounting only.",
  },
  {
    id: "satirilla-dos-chistes-1797",
    title: "Nueva y graciosa satirilla en que se explican dos raros chistes",
    year: 1797,
    author: "unknown",
    rawFile: "raw/HCa030172_djvu.txt",
    sourceUrl: "https://archive.org/details/HCa030172",
    fullTextUrl: "https://archive.org/download/HCa030172/HCa030172_djvu.txt",
    rights: "Public-domain age check: published 1797; kept in the ledger but excluded because the OCR text is too short and noisy.",
    useForCards: false,
    excludedReason: "Very short pamphlet with low OCR quality; retained in the source ledger only.",
  },
  {
    id: "venta-de-chistes-1883",
    title: "Venta de chistes y trastes",
    year: 1883,
    author: "Miguel Boada y Balmes",
    rawFile: "raw/ventadechistesyt00boguat_djvu.txt",
    sourceUrl: "https://archive.org/details/ventadechistesyt00boguat",
    fullTextUrl: "https://archive.org/download/ventadechistesyt00boguat/ventadechistesyt00boguat_djvu.txt",
    rights: "Internet Archive metadata: NOT IN COPYRIGHT; kept in the ledger but excluded because the OCR text is too short.",
    useForCards: false,
    excludedReason: "Only 95 OCR lines; catalog/ledger source, not enough clean standalone jokes.",
  },
  {
    id: "el-libro-de-los-cuentos-tomo-1-1862",
    title: "El libro de los cuentos, tomo 1",
    year: 1862,
    author: "Rafael Boira",
    rawFile: "raw/el-libro-de-los-cuentos-tomo-1-1862.txt",
    sourceUrl: "https://archive.org/details/ellibrodeloscuen01boir",
    fullTextUrl: "https://archive.org/download/ellibrodeloscuen01boir/ellibrodeloscuen01boir_djvu.txt",
    rights: "Public-domain age check: Rafael Boira died in 1878; Wikisource/Commons mark the work public domain.",
    useForCards: true,
  },
  {
    id: "el-libro-de-los-cuentos-tomo-2-1862",
    title: "El libro de los cuentos, tomo 2",
    year: 1862,
    author: "Rafael Boira",
    rawFile: "raw/el-libro-de-los-cuentos-tomo-2-1862.txt",
    sourceUrl: "https://archive.org/details/ellibrodeloscuen02boir",
    fullTextUrl: "https://archive.org/download/ellibrodeloscuen02boir/ellibrodeloscuen02boir_djvu.txt",
    rights: "Public-domain age check: Rafael Boira died in 1878; Wikisource/Commons mark the work public domain.",
    useForCards: true,
  },
  {
    id: "el-libro-de-los-cuentos-tomo-3-1862",
    title: "El libro de los cuentos, tomo 3",
    year: 1862,
    author: "Rafael Boira",
    rawFile: "raw/el-libro-de-los-cuentos-tomo-3-1862.txt",
    sourceUrl: "https://archive.org/details/ellibrodeloscue00boirgoog",
    fullTextUrl: "https://archive.org/stream/ellibrodeloscue00boirgoog/ellibrodeloscue00boirgoog_djvu.txt",
    rights: "Internet Archive metadata: possible-copyright-status=NOT_IN_COPYRIGHT; author public-domain by age.",
    useForCards: true,
  },
];

const unsafeRules = [
  ["sexual_or_adult", /\b(puta|puto|sexo|sexual|desnud|amante|adulter|prostitut|burdel|embaraz|parir|violad|seduc|virgin|doncella|besar|beso|tentaci[oó]n|hermosura)\b/i],
  ["violence_or_death", /\b(matar|mat[oó]|mates?|maten|muerto|muerte|morir|muri\w*|cad[aá]ver|sangre|arma|espada|reñir|provocador\w*|pistola|pistolet\w*|soldado|milicia|cuchill|navaj\w*|veneno|venenos\w*|azot\w*|paliza|fusil\w*|suicid\w*|horca|ahorc\w*|ahorq\w*|asesin\w*|golpe|castig\w*|enfurecid\w*|l[aá]tigo|crucific\w*|balazo|herid\w*|caza|venado|quemar|quemad\w*|cenizas)\b/i],
  ["protected_class_or_slur", /\b(jud[ií]o\w*|moro\w*|negr\w*|gitano\w*|cañ[ií]\w*|galleg\w*|franc[eé]s\w*|frances\w*|ingl[eé]s\w*|andaluz\w*|andaluc\w*|cieg\w*|sord\w*|coj\w*|tuert\w*|tullid\w*|loc\w*|idiota\w*|imb[eé]cil\w*|est[uú]pid\w*|tont\w*|asno\w*|bestia\w*|borrico\w*|burro\w*)\b/i],
  ["religion", /\b(dios\w*|virgen|santo|santa|san|cura|fraile|frailes|monja|iglesia|misa|rosario|serm[oó]n\w*|predicador\w*|diabl\w*|demonio|infierno|pecado|cielo|cristo|cristian\w*|religi[oó]n\w*|ermita\w*|ermitañ\w*|devot\w*|penitent\w*|\w*disc[ií]pul\w*|farise\w*|evangelio|evangelista|apocalypsis|apocalipsis|ap[oó]stol|obispo|papa|sacrist[aá]n|sacerdote|confesor\w*|franciscano|dominico|limosna|[aá]ngel\w*|bruja|prodigio|ruegos|orar|oraci[oó]n|f[eé])\b/i],
  ["religious_denominations_or_clergy", /\b(luteran\w*|protestant\w*|cu[aá]quer\w*|kuak\w*|qu[aá]kar\w*|p[aá]rroc\w*|parroc\w*|feligres\w*|feligr[eé]s\w*|vicari\w*|mahometan\w*|merced|abad\w*|capell[aá]n\w*|clerig\w*|cl[eé]rig\w*)\b/i],
  ["drugs_alcohol", /\b(borracho|borrach|emborrach\w*|vino|licor|taberna|aguardiente|beber|bebido|embriag\w*|cerveza|caf[eé])\b/i],
  ["extended_alcohol", /\b(borrach\w*|bebid\w*|beb[eé]r\w*|embriag\w*)\b/i],
  ["politics_crime_or_authority", /\b(rey|reina|reyes|gobierno|pol[ií]tic|ministro|c[aá]rcel|preso|presidio|prisioner\w*|reo\w*|litigante\w*|jurisconsult\w*|rob\w*|hurtad\w*|ladr[oó]n|ladrones|delito|sentencia|juez|tribunal|guardia|polic[ií]a|justicia|conde|duque|marqu[eé]s|pr[ií]ncipe|cromwel\w*|falsari\w*|falsos?|adulador\w*|coronel|capit[aá]n|general|victoria|emperador|vespasiano|impuesto\w*|imperio|sublev\w*|procesab\w*|confiscab\w*|guerra|maestre|sable|pasaporte|soberano|ilustr[ií]simo)\b/i],
  ["extended_authority_or_crime", /\b(virey|virrey|monarca\w*|palacio|militar\w*|armas?|procurador\w*|escriban\w*|embarg\w*|alcibiades|c[eé]sar|augusto)\b/i],
  ["medical_or_body", /\b(m[eé]dico|doctor|enfermo|t[ií]sico|orina|sepulcro|hospital|hambre|tripas?|pantorrilla\w*|calzones|afeitar|barba)\b/i],
  ["extended_medical_or_body", /\b(mu ela\w*|muel\w*|p[ií]ldor\w*|enfermedad\w*|curar\w*|curan|cur[eó]\w*|salud|convulsi\w*|ojos?)\b/i],
  // Family setups are common in public-domain joke books and are not unsafe by themselves.
  // Keep blocking explicit adult, protected-class, violence, religion, politics, alcohol, and coarse insults above.
  ["dependency_or_slavery_risk", /\b(criad[ao]s?|esclav\w*)\b/i],
  ["coarse_or_mean_insult", /\b(miserable|maldit\w*|perverso|canalla|trapacero|picaro|p[ií]caro|tunante|necio|majader|desgraciado|infame|odio|horror|esti[eé]rcol)\b/i],
  ["extended_coarse_or_mean_insult", /\b(insolente\w*|brib[oó]n\w*|pillo\w*|malcarad\w*|malgastador\w*|ignorante\w*|bolsilli[- ]?roto\w*)\b/i],
  ["nationality_or_origin_stereotype", /\b(aragon[eé]s\w*|asturian\w*|catal[aá]n\w*|vasc\w*|portugu[eé]s\w*|alem[aá]n\w*|italian\w*|parisi[eé]n\w*|provincia\w*|african\w*|chin\w*|rus\w*|turc\w*|hidalgo\w*|nobleza)\b/i],
  ["extended_protected_origin_or_group", /\b(indi[oa]s?|mahometan\w*)\b/i],
  ["extended_violence_or_harm", /\b(matar\w*|muert\w*|morir\w*|ahog\w*|rayos?|hendir\w*|armas?|c[oó]lera|conden\w*)\b/i],
];

const qualityRules = [
  ["scan_header", /(MUSEO|BIBLIOTECA|TESORO|CHISTES|CUENTOS|TOMO|CAP[IÍ]TULO|ÍNDICE|\bOCR\b)/i],
  ["bad_symbols", /[{}<>|_*•=^~#[\]&0-9]/],
  ["punct_inside_word", /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][¿¡«»][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/],
  ["common_ocr_noise", /\b(qae|qne|cod|dgo|dyo|haeia|eomo|eon|eiorto|qtt[eé]|pai'a|seBor|sefior|mddlgaie|relien|lajusticia|alcazarian|préstp|fincomodadaj|falcado|rospendió|chíste|t¿tí|mercé|usía|igo|Ijurro|Mft|Lokmanu|Jnrispmdencki|cnanto|medoa|dereir|cuanopor|tunoi|safluó|MtemtafABW|QüALBM|VBUT|Guando|Bable|er&|tienela|veiadevorado|insiga|sumisma|ciudstd|logragrado|agradeizco|cjuerido|h:m|hg|modiñcacion|io|dij os|Y\.|S\.|Google|Digitized|CjOOQIC|GOOQIC)\b|mo;/i],
  ["extended_spanish_ocr_noise", /(T\)e|Tit|T[ií]o hecho|Yd\.?|Vm\.?|Vmd\.?|Cuanfo|Cadamba|colodes|quiede|publicad|pefedente|detidos|tiunfante|cadoza|sade|Od[ií]ente|modtal\w*|Madiquita|figudaba|impimian|neguito|llevadtele|truge|parandose\s+uno\s+do|inoz|maz|rano|dij[oó]le|esplic\w*|estrañ\w*|eycontr[oó]|parec[eé]is|osotr[oó]|mus\s+grande|c[ií]ela)/i],
  ["broken_symbol_word", /Ü\?/],
  ["stray_quote_noise", /["'][,.;]/],
  ["authority_abbreviation", /\bS\.\s*M\.|\busted\s+S\.|\bSr\.\s*D\./],
  ["mixed_case_noise", /\b[a-záéíóúñ]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*\b/],
  ["all_caps_noise", /\b[A-ZÁÉÍÓÚÜÑ]{3,}\b/],
  ["initial_chain", /\b[A-Z]\.\s*[A-Z]\.\s*[A-Z]\./],
  ["broken_spaced_letters", /\b[a-záéíóúñ]\s+[a-záéíóúñ]\s+[a-záéíóúñ]\b/i],
  ["meta_fragment", /\b(otra|variante|capitulo|apéndice|nota|adición|posdata|refranes|pensamientos|adivinanzas|telegrama|hombres esponjas|glosario|la risa|risa en [aeiou])\b/i],
  ["extended_ocr_noise", /(colimllov|Aug;usto|bolsilli-roto|in£alible|chanto\s+maa|cefio|ofeciendo|su-\s*capa)/i],
  ["glossary_definition", /^[A-ZÁÉÍÓÚÜÑ][^.!?]{2,48}\.\s*—\s*[A-ZÁÉÍÓÚÜÑ]/],
  ["proverb_fragment", /^(No hay peor|Atad el|Ni Arag[oó]n|Refranes?|Pensamientos?)\b/i],
  ["starts_mid_fragment", /^(Ech[oó]lo|Dij[oó]le|Contest[oó]le|Respond[ií]ole|H[ií]zolo|D[ií]jome|Llegados|Solo su|Para salir|El prendero|El literato ley[oó]|Francisco Cabreros)\b/i],
];

const seedCards = [
  {
    title: "Chiste clásico 001",
    text:
      "Se imprimieron los carteles de una comedia con tanta prisa que nadie corrigió la prueba.\n\nEl anuncio salió así: «El amor de palo o la pierna filial».",
    source: "Boira, 1862",
    sourceId: "el-libro-de-los-cuentos-tomo-1-1862",
    evidence: "raw/el-libro-de-los-cuentos-tomo-1-1862.txt:519-528",
    score: 999,
  },
  {
    title: "Chiste clásico 002",
    text:
      "Un hombre desconfiaba tanto de su memoria que escribió en su cartera:\n«Para que no se me olvide: tengo que casarme al pasar por Aranjuez».\n\nCuando emprendió el viaje, lo primero que olvidó en casa fue la cartera.",
    source: "Tesoro, 1847",
    sourceId: "el-tesoro-de-los-chistes-1847",
    evidence: "raw/el-tesoro-de-los-chistes-1847.txt:3325-3329",
    score: 999,
  },
  {
    title: "Chiste clásico 003",
    text:
      "—¿Cuándo me paga los cinco duros que me debe?\n—No son cinco, son diez.\n—Se equivoca: quiero que me pague cinco.\n—Es que prefiero deber diez a pagar cinco.",
    source: "Tesoro, 1847",
    sourceId: "el-tesoro-de-los-chistes-1847",
    evidence: "raw/el-tesoro-de-los-chistes-1847.txt:861-865",
    score: 999,
  },
  {
    title: "Chiste clásico 004",
    text:
      "Hay gente que empieza diciendo:\n—Hágame el favor de prestarme atención.\n\nY continúa enseguida:\n—Hágame el favor de prestarme un duro.",
    source: "Boira, 1862",
    sourceId: "el-libro-de-los-cuentos-tomo-3-1862",
    evidence: "raw/el-libro-de-los-cuentos-tomo-3-1862.txt:3972-3975",
    score: 999,
  },
  {
    title: "Chiste clásico 005",
    text:
      "—Mi reloj anda atrasado dos horas —dijo un estudiante.\n\n—El mío anda atrasado doscientos reales —respondió el otro—. Lo tengo en una casa de préstamos.",
    source: "Boira, 1862",
    sourceId: "el-libro-de-los-cuentos-tomo-1-1862",
    evidence: "raw/el-libro-de-los-cuentos-tomo-1-1862.txt:9344-9352",
    score: 999,
  },
];

const sourceShort = new Map([
  ["el-tesoro-de-los-chistes-1847", "Tesoro, 1847"],
  ["nueva-floresta-1790", "Nueva floresta, 1790"],
  ["nueva-floresta-espanola-1853", "Floresta Española, 1853"],
  ["floresta-espanola-1790-tomo-1", "Floresta I, 1790"],
  ["floresta-espanola-1790-tomo-2", "Floresta II, 1790"],
  ["almanaque-de-los-chistes-1866", "Almanaque, 1866"],
  ["tirso-cuentos-fabulas-dichos-agudos-1848-tomo-1", "Tirso I, 1848"],
  ["tirso-cuentos-fabulas-dichos-agudos-1848-tomo-2", "Tirso II, 1848"],
  ["sales-espanolas-primera-1890", "Sales I, 1890"],
  ["sales-espanolas-segunda-1890", "Sales II, 1890"],
  ["cuentos-chascarrillos-1898", "Chascarrillos, 1898"],
  ["galas-del-ingenio-1879", "Galas, 1879"],
  ["el-libro-de-los-cuentos-tomo-1-1862", "Boira I, 1862"],
  ["el-libro-de-los-cuentos-tomo-2-1862", "Boira II, 1862"],
  ["el-libro-de-los-cuentos-tomo-3-1862", "Boira III, 1862"],
]);

function textStats(file) {
  const txt = readFileSync(file, "utf8");
  return {
    bytes: Buffer.byteLength(txt),
    words: txt.trim().split(/\s+/).filter(Boolean).length,
    unsafeHits: unsafeRules.reduce((n, [, re]) => {
      const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
      return n + (txt.match(new RegExp(re.source, flags)) || []).length;
    }, 0),
  };
}

function safetyFlags(text) {
  return unsafeRules.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function qualityFlags(text, raw, opts = {}) {
  const minTextChars = opts.minTextChars ?? 120;
  const maxTextChars = opts.maxTextChars ?? 340;
  const dialogueEarlyLimit = opts.dialogueEarlyLimit ?? 220;
  const flags = qualityRules.filter(([, re]) => re.test(text)).map(([name]) => name);
  if (text.length < minTextChars) flags.push("too_short");
  if (text.length > maxTextChars) flags.push("too_long");
  if (!/[.!»!]$/.test(text)) flags.push("truncated_end");
  if (!/^[A-ZÁÉÍÓÚÜÑ¿¡«—]/.test(text)) flags.push("bad_start");
  if ((text.match(/«/g) || []).length !== (text.match(/»/g) || []).length) flags.push("unbalanced_quotes");
  if ((text.match(/[.!?;:]/g) || []).length < 2) flags.push("too_little_punctuation");
  if (!/[—?¿:«»]/.test(text)) flags.push("not_dialogue_or_punchline_like");
  const dashCount = (text.match(/—/g) || []).length;
  const hasDialogueVerb = /\b(dijo|respond[ií]o|contest[oó]|replic[oó]|pregunt[oó])\b/i.test(text);
  if (dashCount < 2 && !/[«»]/.test(text)) flags.push("not_enough_dialogue");
  const lastDash = text.lastIndexOf("—");
  if (lastDash >= 0 && text.length - lastDash > dialogueEarlyLimit) flags.push("dialogue_too_early");
  if (/\b(pregunt[oó]|dijo|le dijo|respond[ií]o|contest[oó]|replic[oó])\b[^.!?—«»]{0,120}\.$/i.test(text) && text.length - lastDash > 120) {
    flags.push("ends_with_setup_not_punchline");
  }
  if (/[.!?]\s*—?\s*(dijo|pregunt[oó]|respond[ií]o|contest[oó]|replic[oó])\s+(el|la|un|una|otro|otra|aquel|aquella|este|esta)\b[^.!?]{0,48}\.$/i.test(text)) {
    flags.push("ends_with_dialogue_attribution");
  }
  if (/\?\s*—?\s*(le\s+)?(preguntaron|pregunt[oó]|dijo|dijeron|contest[oó])[^.!?]{0,70}\.$/i.test(text)) {
    flags.push("ends_with_question_setup");
  }
  const finalDialogue = lastDash >= 0 ? text.slice(lastDash) : "";
  if (/^—\s*(s[iíÍ]|no|bueno|nada|pues|veamos)[,;.!]?\s+(contest[oó]|respond[ií]o|dijo)[^.!?]{0,42}\.$/i.test(finalDialogue)) {
    flags.push("short_attributed_final_reply");
  }
  if (/^—\s*[^.!?]{1,56}(dijo|contest[oó]|respond[ií]o)[^.!?]{0,48}\.$/i.test(finalDialogue) && !/—\s*[.!]?\s*[A-ZÁÉÍÓÚÜÑ¿¡]/.test(finalDialogue.slice(1))) {
    flags.push("attributed_final_reply_without_punchline_tail");
  }
  if (/\b(quiero saber|por qu[eé] no|cu[aá]nt[oa]s?)\b[^.!?]{0,60}\.$/i.test(finalDialogue)) {
    flags.push("final_setup_question");
  }
  if (dashCount >= 3 && !/[¿?]/.test(text) && !hasDialogueVerb) {
    flags.push("proverb_list");
  }
  if (text.startsWith("—") && !/[¿?]/.test(text) && !hasDialogueVerb) flags.push("not_dialogue");
  if (/^—\s*[a-záéíóúñ]/.test(text)) flags.push("lowercase_after_dash_start");
  if (/—\s*[¡¿]?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,18}[?!¡¿.]*$/.test(text)) flags.push("short_trailing_reaction");
  const letters = text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || [];
  if (letters.length / Math.max(text.length, 1) < 0.7) flags.push("low_letter_ratio");

  const lines = raw.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const veryShort = lines.filter((line) => line.length > 0 && line.length < 38).length;
  if (lines.length >= 7 && veryShort / lines.length > 0.72) flags.push("verse_or_fragment");
  if (hasEmbeddedHeading(text)) flags.push("embedded_heading");
  if (hasDetachedTail(text)) flags.push("detached_tail");
  return flags;
}

function looksLikeHeading(sentence) {
  const clean = sentence.replace(/[.!?]+$/g, "").trim();
  if (clean.length < 8 || clean.length > 74) return false;
  if (!/^[A-ZÁÉÍÓÚÜÑ]/.test(clean)) return false;
  if (/[—:;,¿¡«»]/.test(clean)) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;
  return !/\b(es|son|era|fue|fué|está|estaba|tiene|tengo|hace|dice|dijo|contesta|contest[oó]|pregunt[oó]|quiero|puede|debe|debo|hemos|he|ha|han|hay|voy|va|viene|sale|salió|llama|llam[oó]|brincan|acaba)\b/i.test(clean);
}

function hasEmbeddedHeading(text) {
  const sentences = text.match(/[^.!?]+[.!?]/g) || [];
  if (sentences.length < 3) return false;
  return sentences.slice(1, -1).some((sentence) => looksLikeHeading(sentence));
}

function hasDetachedTail(text) {
  if (!text.includes("—")) return false;
  const sentences = text.match(/[^.!?]+[.!?]/g) || [];
  if (sentences.length < 2) return false;
  const last = sentences[sentences.length - 1].replace(/[.!?]+$/g, "").trim();
  if (!last || last.includes("—") || /[¿¡«»:;]/.test(last)) return false;
  const words = last.split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > 8) return false;
  return /^[A-ZÁÉÍÓÚÜÑ]/.test(last) && !/\b(dijo|respond[ií]o|contest[oó]|replic[oó]|pregunt[oó])\b/i.test(last);
}

function stripTrailingHeadings(text) {
  let current = text;
  for (let i = 0; i < 3; i += 1) {
    const sentences = current.match(/[^.!?]+[.!?]/g) || [];
    if (sentences.length < 2) break;
    const last = sentences[sentences.length - 1];
    if (!looksLikeHeading(last)) break;
    current = current.slice(0, current.length - last.length).trim();
  }
  return current;
}

function stripLeadingHeadings(text) {
  let current = text;
  for (let i = 0; i < 3; i += 1) {
    const sentences = current.match(/[^.!?]+[.!?]/g) || [];
    if (sentences.length < 2) break;
    const first = sentences[0];
    if (!looksLikeHeading(first)) break;
    current = current.slice(first.length).trim();
  }
  return current;
}

function scrubScanNoise(text) {
  return text
    .normalize("NFKC")
    .replace(/\r/g, "")
    .replace(/\b\d{1,4}\s+MUSEO\s+C[ÓO]MICO\.?\s*/gi, "")
    .replace(/\bEL\s+LIBRO\s+DE\s+LOS\s+C[UÜ]ENTOS\b\s*\d*\s*/gi, "")
    .replace(/\bBIBLIOTECA\s+DE\s+LA\s+RISA\.?\s*/gi, "")
    .replace(/\bDE\s+LOS\s+CHISTES\.?\s*/gi, "")
    .replace(/\bEL\s+TESORO\b\s*/gi, "");
}

function normalizeText(raw) {
  return scrubScanNoise(raw)
    .replace(/-\s*\n\s*/g, "")
    .replace(/\n+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\bá\b/g, "a")
    .replace(/\bÁ\b/g, "A")
    .replace(/\bV\.\s*M\./g, "usted")
    .replace(/\bVds\.\s*/g, "ustedes ")
    .replace(/\bVd\.\s*/g, "usted ")
    .replace(/\bYd\.\s*/g, "usted ")
    .replace(/\bVm\.\s*/g, "usted ")
    .replace(/\bVmd\.\s*/g, "usted ")
    .replace(/\bV\.\s*/g, "usted ")
    .replace(/\bY\.\s*/g, "usted ")
    .replace(/\beí\b/g, "el")
    .replace(/\s+([,.;:!?»])/g, "$1")
    .replace(/([¿¡«])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphsWithOffsets(text) {
  const out = [];
  const re = /\n\s*\n+/g;
  let start = 0;
  let match;
  while ((match = re.exec(text))) {
    const raw = text.slice(start, match.index);
    if (raw.trim()) out.push({ raw, start, end: match.index });
    start = match.index + match[0].length;
  }
  const tail = text.slice(start);
  if (tail.trim()) out.push({ raw: tail, start, end: text.length });
  return out;
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function normalizedKey(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 260);
}

function scoreCandidate(candidate) {
  let score = 0;
  if (!candidate.text.startsWith("—")) score += 8;
  if (/[—]/.test(candidate.text)) score += 5;
  if (/[¿?]/.test(candidate.text)) score += 3;
  if (/[«»]/.test(candidate.text)) score += 2;
  if (candidate.text.length >= 155 && candidate.text.length <= 360) score += 5;
  if (candidate.windowSize >= 2) score += 2;
  if (candidate.sourceId.includes("boir")) score += 2;
  if (candidate.text.length > 400) score -= 4;
  return score;
}

function extractCandidates(opts = {}) {
  const qualityOpts = opts.quality ?? {};
  const windowSizes = opts.windowSizes ?? [1, 2, 3, 4];
  const minSelectedChars = opts.minSelectedChars ?? 0;
  const maxSelectedChars = opts.maxSelectedChars ?? Number.POSITIVE_INFINITY;
  const titlePrefix = opts.titlePrefix ?? "Chiste clásico";
  const rejected = {};
  const accepted = [];
  const cleanSeeds = (opts.includeSeeds === false ? [] : seedCards).filter((card) => {
    const flags = [...safetyFlags(card.text), ...qualityFlags(card.text, card.text, qualityOpts)];
    for (const flag of flags) rejected[`seed_${flag}`] = (rejected[`seed_${flag}`] || 0) + 1;
    return flags.length === 0;
  });

  for (const source of sources) {
    if (!source.useForCards) continue;
    const abs = resolve(CORPUS_DIR, source.rawFile);
    const text = readFileSync(abs, "utf8");
    const paras = paragraphsWithOffsets(text);
    for (let i = 0; i < paras.length; i += 1) {
      for (const windowSize of windowSizes) {
        const slice = paras.slice(i, i + windowSize);
        if (slice.length !== windowSize) continue;
        const raw = slice.map((p) => p.raw).join("\n\n");
        const normalized = stripLeadingHeadings(stripTrailingHeadings(normalizeText(raw)));
        const flags = [...safetyFlags(normalized), ...qualityFlags(normalized, raw, qualityOpts)];
        if (flags.length) {
          for (const flag of flags) rejected[flag] = (rejected[flag] || 0) + 1;
          continue;
        }

        const lineStart = lineNumberAt(text, slice[0].start);
        const lineEnd = lineNumberAt(text, slice[slice.length - 1].end);
        accepted.push({
          title: "",
          text: normalized,
          source: sourceShort.get(source.id) || `${source.author}, ${source.year}`,
          sourceId: source.id,
          evidence: `${source.rawFile}:${lineStart}-${lineEnd}`,
          windowSize,
          score: 0,
        });
      }
    }
  }

  const seen = cleanSeeds.map((card) => normalizedKey(card.text));
  const deduped = [];
  const sortedAccepted = accepted.sort((a, b) => scoreCandidate(b) - scoreCandidate(a) || b.text.length - a.text.length);
  for (const candidate of sortedAccepted) {
    const key = normalizedKey(candidate.text);
    if (!key) continue;
    const overlaps = seen.some((existing) => {
      if (!existing) return false;
      if (existing === key) return true;
      const shorter = existing.length < key.length ? existing : key;
      const longer = existing.length < key.length ? key : existing;
      return shorter.length > 90 && longer.includes(shorter);
    });
    if (overlaps) continue;
    seen.push(key);
    candidate.score = scoreCandidate(candidate);
    deduped.push(candidate);
  }
  deduped.sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.evidence.localeCompare(b.evidence));

  const selected = [...cleanSeeds, ...deduped]
    .filter((card) => card.text.length >= minSelectedChars && card.text.length <= maxSelectedChars)
    .map((card, index) => ({
      ...card,
      title: `${titlePrefix} ${String(index + 1).padStart(3, "0")}`,
    }));

  return { selected, candidatePool: deduped, acceptedCount: accepted.length, dedupedCount: deduped.length, rejected };
}

function killbox(id, role, x, y, w, h, font, extra = {}) {
  return {
    id,
    type: "killbox",
    x,
    y,
    w,
    h,
    rot: 0,
    role,
    padX: 0,
    padY: 0,
    align: extra.align || "left",
    valign: extra.valign || "top",
    font,
    fitMin: extra.fitMin,
    fitMax: extra.fitMax,
    maxChars: extra.maxChars,
    placeholder: role,
  };
}

function textEl(id, text, x, y, w, h, font, extra = {}) {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    rot: 0,
    text,
    align: extra.align || "left",
    bg: extra.bg,
    border: extra.border,
    radius: extra.radius,
    shadow: extra.shadow,
    font,
  };
}

function imageEl(src) {
  return { id: "background", type: "image", x: 0, y: 0, w: 1080, h: 1920, rot: 0, src, fit: "cover" };
}

const onePx = { family: "Inter", size: 1, weight: 400, color: "#111111", lineHeight: 1 };
const baseFonts = {
  label: { family: "Inter", size: 29, weight: 900, color: "#b5482f", lineHeight: 1.05 },
  title: { family: "Inter", size: 54, weight: 900, color: "#171717", lineHeight: 1.06 },
  body: { family: "Inter", size: 42, weight: 720, color: "#1b242c", lineHeight: 1.22 },
  source: { family: "Inter", size: 25, weight: 820, color: "#5b4a3d", lineHeight: 1.1 },
};

const palettes = [
  ["marigold", "CHISTE CORTO", "#f7ead3", "#171717", "#b5482f", "#5b4a3d", "rgba(255,250,239,.88)", "2px solid rgba(180,72,47,.32)"],
  ["cobalt", "HUMOR CLÁSICO", "#eef4ff", "#10151c", "#1457c8", "#526070", "rgba(248,251,255,.88)", "2px solid rgba(20,87,200,.30)"],
  ["night", "CHISTE CORTO", "#071626", "#fff7e8", "#f6b84a", "#d8c299", "rgba(2,10,22,.68)", "1px solid rgba(246,184,74,.38)"],
  ["sage", "HUMOR LIMPIO", "#eef7ef", "#12201a", "#2f8f72", "#597466", "rgba(250,255,250,.86)", "2px solid rgba(47,143,114,.30)"],
  ["terracotta", "CHISTE CLÁSICO", "#fff2ea", "#24130c", "#c46639", "#805c4a", "rgba(255,248,242,.88)", "2px solid rgba(196,102,57,.32)"],
  ["ink", "SONRISA RÁPIDA", "#141414", "#fbf8ed", "#f5c84b", "#bdb6a0", "rgba(18,18,18,.66)", "1px solid rgba(245,200,75,.42)"],
  ["teal", "HUMOR CORTO", "#edfafa", "#072b2b", "#148c8c", "#5e7c7c", "rgba(250,255,255,.88)", "2px solid rgba(20,140,140,.32)"],
  ["coral", "CHISTE BREVE", "#fff4f0", "#2b0d08", "#d8422f", "#916257", "rgba(255,249,246,.88)", "2px solid rgba(216,66,47,.32)"],
  ["olive", "RISA CLÁSICA", "#f3f6ea", "#19200f", "#6d8e24", "#6d735a", "rgba(253,255,246,.86)", "2px solid rgba(109,142,36,.30)"],
  ["plum", "HUMOR DE HOY", "#f7f0fb", "#21122d", "#7a3bb8", "#776282", "rgba(253,248,255,.88)", "2px solid rgba(122,59,184,.30)"],
];

const longPalettes = [
  ["paper-sun", "CHISTE LARGO", "#fff4d8", "#151411", "#d45431", "#746351", "rgba(255,252,242,.91)", "2px solid rgba(212,84,49,.28)"],
  ["mint-smile", "HUMOR LARGO", "#eefaf4", "#102019", "#15956f", "#587166", "rgba(251,255,250,.91)", "2px solid rgba(21,149,111,.28)"],
  ["sky-laugh", "RISA LARGA", "#eef7ff", "#101923", "#2570d8", "#5a6878", "rgba(249,253,255,.91)", "2px solid rgba(37,112,216,.26)"],
  ["peach-comic", "CHISTE CLASICO", "#fff0e8", "#23130d", "#d15f3c", "#7b5c50", "rgba(255,250,246,.92)", "2px solid rgba(209,95,60,.28)"],
  ["lilac-grin", "HUMOR LIMPIO", "#f8f1ff", "#21142b", "#7b49b8", "#74627f", "rgba(254,250,255,.92)", "2px solid rgba(123,73,184,.25)"],
];

const longBackgrounds = [
  ["paper-sun", "#fff5dc", "#ffe0a8", "#f6b51c", "#e85d3f", "#51aeb8", "tr", "quotes"],
  ["mint-smile", "#f0fbf3", "#cfeedd", "#ffd24c", "#26a879", "#ef6b51", "bl", "bubble"],
  ["sky-laugh", "#eef7ff", "#d7ebff", "#ffc928", "#2f79d4", "#ed6c5a", "br", "spark"],
  ["peach-comic", "#fff0e8", "#ffd7c7", "#ffcc38", "#df6042", "#41a6aa", "tl", "quotes"],
  ["lilac-grin", "#f8f0ff", "#e8d9fb", "#ffd247", "#8a58c8", "#ee735a", "tr", "bubble"],
  ["butter", "#fff8d9", "#ffe89a", "#f4b622", "#2e9e89", "#e96148", "bl", "spark"],
  ["aqua", "#ebfbfb", "#c7eff0", "#ffd24c", "#1497a3", "#ec6b52", "br", "quotes"],
  ["rose", "#fff1f5", "#ffd4df", "#ffc83f", "#da5474", "#30a3a7", "tl", "bubble"],
  ["leaf", "#f3fae8", "#dbeeb5", "#f6c837", "#6f9f3a", "#e76547", "tr", "spark"],
  ["cream-blue", "#fff7ea", "#dceafe", "#ffc93e", "#3775c8", "#e76a4f", "bl", "quotes"],
  ["paper-coral", "#fff6e6", "#ffd9ba", "#ffd34a", "#e06447", "#45aeb2", "br", "bubble"],
  ["mint-yellow", "#f2fbec", "#ffe9a4", "#f7bd26", "#1f9f80", "#dc6550", "tl", "spark"],
  ["blue-peach", "#eff7ff", "#ffdcca", "#ffc63a", "#347bd4", "#e56b56", "tr", "quotes"],
  ["plum-paper", "#faf2ff", "#f5d5ec", "#ffd04a", "#8a55b7", "#ec7457", "bl", "bubble"],
  ["clean-confetti", "#fffaf0", "#d9f0f0", "#ffc736", "#38a8ae", "#e76149", "br", "spark"],
];

const legacySceneBackgrounds = [
  { key: "apartment", file: "russian_apartment_hallway.jpg", safe: [205, 245, 520, 135] },
  { key: "banya", file: "russian_banya.jpg", safe: [75, 380, 510, 135] },
  { key: "dacha", file: "russian_dacha_porch.jpg", safe: [350, 190, 500, 225] },
  { key: "table", file: "russian_festive_table.jpg", safe: [230, 270, 530, 250] },
  { key: "garage", file: "russian_garage_workshop.jpg", safe: [205, 185, 510, 225] },
  { key: "kitchen", file: "russian_kitchen_table.jpg", safe: [270, 355, 320, 135] },
  { key: "market", file: "russian_market_stall.jpg", safe: [230, 300, 470, 235] },
  { key: "rainy", file: "russian_rainy_window.jpg", safe: [315, 165, 500, 265] },
  { key: "train", file: "russian_train_compartment.jpg", safe: [715, 310, 430, 175] },
  { key: "winter", file: "russian_winter_bus_stop.jpg", safe: [175, 205, 430, 195] },
];

function smiley(cx, cy, r, fill, accent, rot = 0) {
  return `
  <g transform="translate(${cx} ${cy}) rotate(${rot})">
    <circle r="${r}" fill="${fill}" stroke="rgba(122,76,18,.22)" stroke-width="${Math.max(4, r * 0.035)}"/>
    <ellipse cx="${-r * 0.28}" cy="${-r * 0.14}" rx="${r * 0.10}" ry="${r * 0.045}" fill="#221913" transform="rotate(-18 ${-r * 0.28} ${-r * 0.14})"/>
    <ellipse cx="${r * 0.24}" cy="${-r * 0.15}" rx="${r * 0.10}" ry="${r * 0.045}" fill="#221913" transform="rotate(18 ${r * 0.24} ${-r * 0.15})"/>
    <path d="M ${-r * 0.46} ${r * 0.13} Q 0 ${r * 0.58} ${r * 0.48} ${r * 0.11}" fill="none" stroke="#221913" stroke-width="${r * 0.105}" stroke-linecap="round"/>
    <path d="M ${-r * 0.30} ${r * 0.18} Q 0 ${r * 0.38} ${r * 0.31} ${r * 0.17}" fill="none" stroke="#fff7e8" stroke-width="${r * 0.04}" stroke-linecap="round" opacity=".92"/>
    <circle cx="${-r * 0.52}" cy="${r * 0.05}" r="${r * 0.075}" fill="${accent}" opacity=".32"/>
    <circle cx="${r * 0.50}" cy="${r * 0.04}" r="${r * 0.075}" fill="${accent}" opacity=".32"/>
  </g>`;
}

function quoteMark(x, y, color, scale = 1, rot = 0) {
  return `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})" opacity=".74">
    <path d="M0 44c0-25 10-42 32-52l12 18c-12 6-19 14-21 24h25v42H0z" fill="${color}"/>
    <path d="M64 44c0-25 10-42 32-52l12 18c-12 6-19 14-21 24h25v42H64z" fill="${color}"/>
  </g>`;
}

function bubble(x, y, w, h, color, rot = 0) {
  return `
  <g transform="translate(${x} ${y}) rotate(${rot})" opacity=".72">
    <ellipse cx="0" cy="0" rx="${w}" ry="${h}" fill="${color}"/>
    <path d="M ${w * 0.25} ${h * 0.65} l ${w * 0.30} ${h * 0.55} l ${-w * 0.55} ${-h * 0.22} z" fill="${color}"/>
  </g>`;
}

function burst(x, y, color, rot = 0) {
  const rays = Array.from({ length: 6 }, (_, i) => {
    const a = i * 32 - 80;
    return `<line x1="0" y1="-34" x2="0" y2="-64" stroke="${color}" stroke-width="10" stroke-linecap="round" transform="rotate(${a})"/>`;
  }).join("");
  return `<g transform="translate(${x} ${y}) rotate(${rot})" opacity=".75">${rays}</g>`;
}

function confetti(seed, colors) {
  const dots = [];
  let v = seed * 7919 + 17;
  const next = () => {
    v = (v * 48271) % 2147483647;
    return v / 2147483647;
  };
  for (let i = 0; i < 42; i += 1) {
    const topOrBottom = next() > 0.45;
    const side = next() > 0.5;
    const x = side ? 28 + next() * 190 : 860 + next() * 190;
    const y = topOrBottom ? 55 + next() * 250 : 1510 + next() * 330;
    const r = 5 + next() * 12;
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${colors[i % colors.length]}" opacity="${(0.28 + next() * 0.34).toFixed(2)}"/>`);
  }
  return dots.join("\n");
}

function longBackgroundSvg(index) {
  const [, base, wash, yellow, accent, second, corner, motif] = longBackgrounds[index % longBackgrounds.length];
  const mascot = {
    tr: smiley(1050, 205, 160, yellow, accent, 10),
    bl: smiley(34, 1650, 188, yellow, accent, -8),
    br: smiley(1050, 1588, 180, yellow, accent, 7),
    tl: smiley(32, 178, 150, yellow, accent, -12),
  }[corner];
  const opposite =
    corner === "tr"
      ? smiley(62, 1604, 118, yellow, second, -14)
      : corner === "bl"
        ? smiley(1032, 208, 118, yellow, second, 12)
        : corner === "br"
          ? smiley(54, 210, 108, yellow, second, -12)
          : smiley(1032, 1598, 118, yellow, second, 12);
  const motifSvg =
    motif === "quotes"
      ? `${quoteMark(72, 1460, accent, 1.05, -4)}${quoteMark(875, 114, second, 0.72, 6)}`
      : motif === "bubble"
        ? `${bubble(862, 168, 84, 46, second, -8)}${bubble(152, 1508, 72, 40, accent, 10)}`
        : `${burst(874, 148, accent, -8)}${burst(175, 1512, second, 12)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="paper-${index}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${base}"/>
      <stop offset=".54" stop-color="#fffdf5"/>
      <stop offset="1" stop-color="${wash}"/>
    </linearGradient>
    <filter id="grain-${index}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 .045"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="1080" height="1920" fill="url(#paper-${index})"/>
  <rect width="1080" height="1920" filter="url(#grain-${index})" opacity=".55"/>
  <ellipse cx="540" cy="820" rx="430" ry="690" fill="#fffdf7" opacity=".42"/>
  <path d="M-80 1680 C130 1510 260 1760 420 1600 C560 1460 685 1660 850 1535 C960 1450 1040 1500 1160 1410 L1160 1980 L-80 1980 Z" fill="${wash}" opacity=".42"/>
  <path d="M-90 65 C110 180 245 28 405 130 C560 228 700 78 860 142 C990 194 1060 108 1160 160 L1160 -80 L-90 -80 Z" fill="${wash}" opacity=".34"/>
  ${motifSvg}
  ${confetti(index + 1, [yellow, accent, second, "#252525"])}
  ${mascot}
  ${opposite}
</svg>`;
}

function writeLongBackgrounds() {
  mkdirSync(LONG_BG_DIR, { recursive: true });
  for (let i = 0; i < LONG_BASE_TEMPLATES; i += 1) {
    const file = resolve(LONG_BG_DIR, `bg-${String(i + 1).padStart(2, "0")}.svg`);
    writeFileSync(file, longBackgroundSvg(i));
  }
  for (const scene of legacySceneBackgrounds) {
    copyFileSync(resolve(RUSSIAN_SCENE_BG_DIR, scene.file), resolve(LONG_BG_DIR, `scene-${scene.file}`));
  }
}

function longDensityForSlot(index) {
  const slot = index % LONG_TARGET_TEMPLATES;
  if (slot < 21) return "compact";
  if (slot < 28) return "medium";
  if (slot < LONG_BASE_TEMPLATES) return "full";
  return "scene";
}

function longDensityForCard(card) {
  if (card.layout === "scene") return "scene";
  const len = card.text.length;
  if (len < 320) return "compact";
  if (len < 400) return "medium";
  return "full";
}

function arrangeLongCardsForTemplates(cards) {
  const buckets = { compact: [], medium: [], full: [], scene: [] };
  for (const card of cards) buckets[longDensityForCard(card)].push(card);

  const take = (preferred) => {
    const order =
      preferred === "compact" ? ["compact", "medium", "full"]
        : preferred === "medium" ? ["medium", "compact", "full"]
          : preferred === "scene" ? ["scene", "medium", "full", "compact"]
            : ["full", "medium", "compact"];
    for (const key of order) {
      const next = buckets[key].shift();
      if (next) return next;
    }
    throw new Error("Long card arrangement exhausted unexpectedly");
  };

  return cards.map((_, index) => take(longDensityForSlot(index))).map((card, index) => ({
    ...card,
    title: `Chiste largo ${String(index + 1).padStart(3, "0")}`,
  }));
}

function overlapsAnyCandidate(card, existingKeys) {
  const key = normalizedKey(card.text);
  if (!key) return true;
  return existingKeys.some((existing) => {
    if (!existing) return false;
    if (existing === key) return true;
    const shorter = existing.length < key.length ? existing : key;
    const longer = existing.length < key.length ? key : existing;
    return shorter.length > 90 && longer.includes(shorter);
  });
}

function selectUnusedSceneCandidates(candidatePool, usedCards, count, qualityOpts) {
  const usedKeys = usedCards.map((card) => normalizedKey(card.text)).filter(Boolean);
  const out = [];
  const minTextChars = qualityOpts.minTextChars ?? 120;
  const maxTextChars = qualityOpts.maxTextChars ?? 360;
  for (const candidate of candidatePool) {
    if (candidate.text.length < minTextChars || candidate.text.length > maxTextChars) continue;
    if ([...safetyFlags(candidate.text), ...qualityFlags(candidate.text, candidate.text, qualityOpts)].length) continue;
    if (overlapsAnyCandidate(candidate, usedKeys)) continue;
    usedKeys.push(normalizedKey(candidate.text));
    out.push(candidate.text.length >= 180 ? { ...candidate, layout: "scene" } : candidate);
    if (out.length >= count) break;
  }
  return out;
}

function templateFor(index) {
  const bgNo = String(index + 1).padStart(2, "0");
  const [key, label, canvasBg, ink, accent, muted, panelBg, border] = palettes[index % palettes.length];
  const dark = key === "night" || key === "ink";
  const variant = index % 6;
  const src = `assets/template-packs/spanish-jokes/backgrounds/bg-${bgNo}.jpg`;
  const titleFont = { ...baseFonts.title, color: ink, size: variant === 3 ? 50 : 54 };
  const bodyFont = { ...baseFonts.body, color: ink, size: variant === 4 ? 40 : 42 };
  const sourceFont = { ...baseFonts.source, color: muted };
  const labelFont = { ...baseFonts.label, color: accent };

  const panel = [
    { x: 84, y: 270, w: 912, h: 1124, radius: 6 },
    { x: 100, y: 300, w: 880, h: 1068, radius: 8 },
    { x: 72, y: 246, w: 936, h: 1184, radius: 4 },
    { x: 118, y: 278, w: 844, h: 1120, radius: 8 },
    { x: 88, y: 314, w: 904, h: 1032, radius: 6 },
    { x: 70, y: 286, w: 940, h: 1092, radius: 8 },
  ][variant];

  const left = panel.x + 58;
  const width = panel.w - 116;
  const titleY = panel.y + 150;
  const bodyY = titleY + 160;
  const bodyH = panel.y + panel.h - bodyY - 156;

  return {
    version: 1,
    name: `chistes-es-${bgNo}-${key}`,
    canvas: { w: 1080, h: 1920, bg: canvasBg },
    elements: [
      imageEl(src),
      textEl("text-panel", "", panel.x, panel.y, panel.w, panel.h, onePx, {
        bg: panelBg,
        border,
        radius: panel.radius,
        shadow: dark ? "0 34px 90px rgba(0,0,0,.34)" : "0 24px 70px rgba(17,17,17,.15)",
      }),
      textEl("label", label, left, panel.y + 72, width, 44, labelFont),
      killbox("title", "title", left, titleY, width, 116, titleFont, { fitMin: 34, fitMax: titleFont.size, maxChars: 46 }),
      killbox("body", "text", left, bodyY, width, bodyH, bodyFont, { fitMin: 28, fitMax: bodyFont.size, maxChars: 430, valign: "center" }),
      killbox("source", "source", left, panel.y + panel.h - 94, width, 40, sourceFont, { fitMin: 20, fitMax: 25, maxChars: 42 }),
    ],
  };
}

function templateForLong(index) {
  const bgNo = String(index + 1).padStart(2, "0");
  const [key, label, canvasBg, ink, accent, muted, panelBg, border] = longPalettes[index % longPalettes.length];
  const variant = index % 5;
  const density = longDensityForSlot(index);
  const src = `assets/template-packs/spanish-jokes-long/backgrounds/bg-${bgNo}.svg`;
  const titleFont = { ...baseFonts.title, color: ink, size: 38, lineHeight: 1.04 };
  const bodyFont = {
    ...baseFonts.body,
    color: ink,
    size: density === "compact" ? 54 : density === "medium" ? 51 : 48,
    lineHeight: density === "compact" ? 1.05 : 1.04,
  };
  const sourceFont = { ...baseFonts.source, color: muted, size: 23 };
  const labelFont = { ...baseFonts.label, color: accent, size: 22 };

  const panels = {
    compact: [
      { x: 52, y: 198, w: 976, h: 910, radius: 6 },
      { x: 60, y: 214, w: 960, h: 906, radius: 8 },
      { x: 44, y: 190, w: 992, h: 938, radius: 5 },
      { x: 68, y: 206, w: 944, h: 916, radius: 8 },
      { x: 56, y: 226, w: 968, h: 900, radius: 6 },
    ],
    medium: [
      { x: 52, y: 192, w: 976, h: 1128, radius: 6 },
      { x: 60, y: 204, w: 960, h: 1110, radius: 8 },
      { x: 44, y: 184, w: 992, h: 1140, radius: 5 },
      { x: 68, y: 196, w: 944, h: 1122, radius: 8 },
      { x: 56, y: 214, w: 968, h: 1098, radius: 6 },
    ],
    full: [
      { x: 52, y: 190, w: 976, h: 1262, radius: 6 },
      { x: 60, y: 198, w: 960, h: 1248, radius: 8 },
      { x: 44, y: 184, w: 992, h: 1272, radius: 5 },
      { x: 68, y: 190, w: 944, h: 1260, radius: 8 },
      { x: 56, y: 206, w: 968, h: 1238, radius: 6 },
    ],
  };
  const panel = panels[density][variant];

  const left = panel.x + 38;
  const width = Math.min(panel.w - 76, 960 - left);
  const labelY = panel.y + 34;
  const titleY = labelY + 38;
  const bodyY = titleY + 68;
  const sourceY = Math.min(panel.y + panel.h - 62, density === "full" ? 1410 : density === "medium" ? 1318 : 1218);
  const bodyH = sourceY - bodyY - 34;

  return {
    version: 1,
    name: `chistes-es-long-${String(index + 1).padStart(2, "0")}-${key}`,
    canvas: { w: 1080, h: 1920, bg: canvasBg },
    elements: [
      imageEl(src),
      textEl("long-panel", "", panel.x, panel.y, panel.w, panel.h, onePx, {
        bg: panelBg,
        border,
        radius: panel.radius,
        shadow: "0 22px 68px rgba(91,67,43,.15)",
      }),
      textEl("label", label, left, labelY, width, 40, labelFont),
      killbox("title", "title", left, titleY, width, 62, titleFont, { fitMin: 28, fitMax: titleFont.size, maxChars: 46 }),
      killbox("body", "text", left, bodyY, width, bodyH, bodyFont, { fitMin: 32, fitMax: bodyFont.size, maxChars: 650, valign: "top" }),
      killbox("source", "source", left, sourceY, width, 34, sourceFont, { fitMin: 18, fitMax: 23, maxChars: 42 }),
    ],
  };
}

function templateForLegacyScene(index) {
  const scene = legacySceneBackgrounds[index % legacySceneBackgrounds.length];
  const [safeTop, safeRight, safeBottom, safeLeft] = scene.safe;
  const slotNo = LONG_BASE_TEMPLATES + index + 1;
  const src = `assets/template-packs/spanish-jokes-long/backgrounds/scene-${scene.file}`;
  const panelX = safeLeft;
  const panelY = safeTop;
  const panelW = Math.min(1080 - safeLeft - safeRight, 960 - safeLeft);
  const panelBottom = Math.min(1920 - safeBottom, 1450);
  const panelH = Math.max(520, Math.min(panelBottom - panelY, panelW < 590 ? 660 : 700));
  const inner = panelW < 590 ? 24 : 30;
  const left = panelX + inner;
  const width = panelW - inner * 2;
  const labelY = panelY + 24;
  const titleY = labelY + 34;
  const bodyY = titleY + 58;
  const sourceY = panelY + panelH - 50;
  const bodyH = sourceY - bodyY - 24;
  const fontSize = panelW < 590 ? 40 : panelW < 650 ? 42 : 44;
  const accent = ["#b23b2e", "#186a6d", "#8a5d1c", "#315f9b", "#6d6830"][index % 5];
  const ink = "#20160f";

  return {
    version: 1,
    name: `chistes-es-long-${String(slotNo).padStart(2, "0")}-scene-${scene.key}`,
    canvas: { w: 1080, h: 1920, bg: "#f4ecdd" },
    elements: [
      imageEl(src),
      textEl("scene-panel", "", panelX, panelY, panelW, panelH, onePx, {
        bg: "rgba(255,252,243,.76)",
        border: "1px solid rgba(99,72,43,.22)",
        radius: 3,
        shadow: "0 12px 36px rgba(36,24,14,.13)",
      }),
      textEl("label", "CHISTE ESCENA", left, labelY, width, 34, { ...baseFonts.label, color: accent, size: 19, lineHeight: 1.05 }),
      killbox("title", "title", left, titleY, width, 52, { ...baseFonts.title, color: ink, size: 32, lineHeight: 1.05 }, { fitMin: 24, fitMax: 32, maxChars: 46 }),
      killbox(
        "body",
        "text",
        left,
        bodyY,
        width,
        bodyH,
        { ...baseFonts.body, color: ink, size: fontSize, lineHeight: 1.07 },
        { fitMin: 30, fitMax: fontSize, maxChars: 380, valign: "top" },
      ),
      killbox("source", "source", left, sourceY, width, 30, { ...baseFonts.source, color: "#6f5b48", size: 19, lineHeight: 1.1 }, { fitMin: 16, fitMax: 19, maxChars: 42 }),
    ],
  };
}

function buildTemplates() {
  const templates = [];
  for (let i = 0; i < TARGET_TEMPLATES; i += 1) {
    const file = resolve(BG_DIR, `bg-${String(i + 1).padStart(2, "0")}.jpg`);
    if (!existsSync(file)) throw new Error(`Missing background: ${file}`);
    templates.push(templateFor(i));
  }
  return templates;
}

function buildLongTemplates() {
  const templates = [];
  for (let i = 0; i < LONG_TARGET_TEMPLATES; i += 1) {
    if (i < LONG_BASE_TEMPLATES) {
      const file = resolve(LONG_BG_DIR, `bg-${String(i + 1).padStart(2, "0")}.svg`);
      if (!existsSync(file)) throw new Error(`Missing background: ${file}`);
      templates.push(templateForLong(i));
    } else {
      const scene = legacySceneBackgrounds[i - LONG_BASE_TEMPLATES];
      const file = resolve(LONG_BG_DIR, `scene-${scene.file}`);
      if (!existsSync(file)) throw new Error(`Missing background: ${file}`);
      templates.push(templateForLegacyScene(i - LONG_BASE_TEMPLATES));
    }
  }
  return templates;
}

function selectedWithFlags(selected, qualityOpts = {}) {
  return selected.map((card) => ({
    title: card.title,
    sourceId: card.sourceId,
    evidence: card.evidence,
    textChars: card.text.length,
    score: card.score,
    safetyFlags: safetyFlags(`${card.title}\n${card.text}`),
    qualityFlags: qualityFlags(card.text, card.text, qualityOpts),
  }));
}

function assertCleanSelection(selectedFlags) {
  const failed = selectedFlags.filter((card) => card.safetyFlags.length || card.qualityFlags.length);
  if (failed.length) {
    throw new Error(`Selected cards failed final filters: ${failed.slice(0, 5).map((card) => `${card.title}:${card.safetyFlags.concat(card.qualityFlags).join(",")}`).join("; ")}`);
  }
}

function packCards(selected) {
  return selected.map((card) => ({
    values: { title: card.title, text: card.text, source: card.source },
    addedAt: NOW,
  }));
}

function buildReport({ selected, targetTemplates, acceptedCount, dedupedCount, rejected, selectedFlags, profile }) {
  return {
    generatedAt: NOW,
    profile,
    selectedCardsCount: selected.length,
    targetTemplates,
    policy:
      "Local deterministic extraction from public-domain Spanish books. The filter rejects adult/sexual, violence/death, protected-class or nationality stereotypes, religion, alcohol/drugs, politics/crime/authority, medical/body, dependency/slavery-risk setups, coarse insults, scan headers, OCR artifacts, verse fragments, and truncated snippets. Family setups are allowed when they do not trip those safety rules. No LLM text cleanup/adaptation was used for this production pass.",
    unsafeRules: unsafeRules.map(([name, re]) => ({ name, pattern: re.source })),
    qualityRules: qualityRules.map(([name, re]) => ({ name, pattern: re.source })),
    rawStats: sources.map((source) => ({ sourceId: source.id, useForCards: source.useForCards, excludedReason: source.excludedReason, ...textStats(resolve(CORPUS_DIR, source.rawFile)) })),
    acceptedCandidateWindows: acceptedCount,
    dedupedCandidateWindows: dedupedCount,
    rejectedByReason: rejected,
    selectedCards: selectedFlags,
  };
}

function main() {
  for (const dir of [CORPUS_DIR, TEMPLATE_DIR, LONG_TEMPLATE_DIR, LONG_BG_DIR, resolve(ROOT, "data/packs")]) mkdirSync(dir, { recursive: true });
  const missing = sources.filter((source) => !existsSync(resolve(CORPUS_DIR, source.rawFile)));
  if (missing.length) {
    throw new Error(
      `Missing raw files. Download first:\n${missing.map((source) => `curl -L -o ${resolve(CORPUS_DIR, source.rawFile)} ${source.fullTextUrl}`).join("\n")}`,
    );
  }

  rmSync(TEMPLATE_DIR, { recursive: true, force: true });
  rmSync(LONG_TEMPLATE_DIR, { recursive: true, force: true });
  mkdirSync(TEMPLATE_DIR, { recursive: true });
  mkdirSync(LONG_TEMPLATE_DIR, { recursive: true });
  writeLongBackgrounds();

  const standardQuality = { maxTextChars: 340, dialogueEarlyLimit: 170 };
  const standard = extractCandidates({
    titlePrefix: "Chiste clásico",
    windowSizes: [1, 2, 3, 4],
    includeSeeds: true,
    quality: standardQuality,
  });
  const standardFlags = selectedWithFlags(standard.selected, standardQuality);
  assertCleanSelection(standardFlags);

  const templates = buildTemplates();
  const pack = {
    id: "chistes-es-public-domain",
    owners: [1, 2],
    name: `Chistes ES ${standard.selected.length}`,
    lang: "es",
    templates,
    cards: packCards(standard.selected),
    createdAt: NOW,
    grants: [3, 4, 5, 7],
  };
  const report = buildReport({
    selected: standard.selected,
    targetTemplates: TARGET_TEMPLATES,
    acceptedCount: standard.acceptedCount,
    dedupedCount: standard.dedupedCount,
    rejected: standard.rejected,
    selectedFlags: standardFlags,
    profile: "standard-short-120-340-chars",
  });

  const longQuality = { maxTextChars: 620, dialogueEarlyLimit: 420 };
  const long = extractCandidates({
    titlePrefix: "Chiste largo",
    windowSizes: [2, 3, 4, 5, 6],
    includeSeeds: false,
    minSelectedChars: 260,
    maxSelectedChars: 620,
    quality: longQuality,
  });
  const sceneQuality = { maxTextChars: 380, dialogueEarlyLimit: 260 };
  const sceneCandidates = selectUnusedSceneCandidates(long.candidatePool, [...standard.selected, ...long.selected], LONG_SCENE_CARDS, sceneQuality);
  if (sceneCandidates.length < LONG_SCENE_CARDS) {
    console.warn(`unused extra candidates: ${sceneCandidates.length}/${LONG_SCENE_CARDS}; using all safe unique candidates found`);
  }
  const longSelected = arrangeLongCardsForTemplates([...long.selected, ...sceneCandidates]);
  const longFlags = selectedWithFlags(longSelected, longQuality);
  assertCleanSelection(longFlags);
  const longTemplates = buildLongTemplates();
  const longPack = {
    id: "chistes-es-long",
    owners: [1, 2],
    name: `Chistes ES Long ${longSelected.length}`,
    lang: "es",
    templates: longTemplates,
    cards: packCards(longSelected),
    createdAt: NOW,
    grants: [3, 4, 5, 7],
  };
  const combinedSelected = [...standard.selected, ...longSelected];
  const combinedPack = {
    ...pack,
    name: `Chistes ES ${combinedSelected.length}`,
    // Custom packs render card i with template i % templates.length. Use only the roomier
    // base long templates for the combined pack so former long jokes never land on a compact
    // scene layout.
    templates: longTemplates.slice(0, LONG_BASE_TEMPLATES),
    cards: packCards(combinedSelected),
  };
  const longReport = buildReport({
    selected: longSelected,
    targetTemplates: LONG_TARGET_TEMPLATES,
    acceptedCount: long.acceptedCount,
    dedupedCount: long.dedupedCount,
    rejected: long.rejected,
    selectedFlags: longFlags,
    profile: "long-260-620-chars",
  });

  writeFileSync(resolve(CORPUS_DIR, "sources.json"), JSON.stringify(sources, null, 2));
  writeFileSync(resolve(CORPUS_DIR, "safety-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(CORPUS_DIR, "safety-report-long.json"), JSON.stringify(longReport, null, 2));
  writeFileSync(resolve(ASSET_DIR, "selected-cards.json"), JSON.stringify(standard.selected, null, 2));
  writeFileSync(resolve(LONG_ASSET_DIR, "selected-cards.json"), JSON.stringify(longSelected, null, 2));
  templates.forEach((tpl, i) => writeFileSync(resolve(TEMPLATE_DIR, `${String(i + 1).padStart(2, "0")}-${tpl.name}.json`), JSON.stringify(tpl, null, 2)));
  longTemplates.forEach((tpl, i) => writeFileSync(resolve(LONG_TEMPLATE_DIR, `${String(i + 1).padStart(2, "0")}-${tpl.name}.json`), JSON.stringify(tpl, null, 2)));
  writeFileSync(PACK_FILE, JSON.stringify(combinedPack, null, 2));
  writeFileSync(LONG_PACK_FILE, JSON.stringify(longPack, null, 2));
  if (existsSync(LEGACY_PREVIEW_PACK_FILE)) unlinkSync(LEGACY_PREVIEW_PACK_FILE);
  if (existsSync(LEGACY_1000_PACK_FILE)) unlinkSync(LEGACY_1000_PACK_FILE);

  console.log(`sources: ${sources.length}`);
  console.log(`raw words: ${report.rawStats.reduce((n, source) => n + source.words, 0)}`);
  console.log(`raw unsafe hits: ${report.rawStats.reduce((n, source) => n + source.unsafeHits, 0)}`);
  console.log(`accepted candidate windows: ${standard.acceptedCount}`);
  console.log(`deduped candidate windows: ${standard.dedupedCount}`);
  console.log(`cards: ${combinedPack.cards.length}`);
  console.log(`templates: ${combinedPack.templates.length}`);
  console.log(`pack: ${PACK_FILE}`);
  console.log(`long accepted candidate windows: ${long.acceptedCount}`);
  console.log(`long deduped candidate windows: ${long.dedupedCount}`);
  console.log(`long cards: ${longPack.cards.length}`);
  console.log(`long templates: ${longPack.templates.length}`);
  console.log(`long pack: ${LONG_PACK_FILE}`);
}

main();
