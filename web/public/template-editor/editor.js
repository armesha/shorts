// ============== Template Editor — ядро ==============
// Vanilla JS, без зависимостей. Состояние одно (state.tpl) — рендер пересоздаёт DOM по нему.

// ---------- константы ----------
const STORAGE_KEY = "templateEditor:v1";
const DEFAULT_CANVAS = { w: 1080, h: 1920, bg: "#FFFFF7" };
const GRID = 5;          // шаг привязки в px холста
const MIN_SIZE = 12;     // мин. размер элемента
const FONTS = [          // web-шрифты грузятся в index.html (Google Fonts); системные — без загрузки
  // — без засечек —
  "Inter", "Montserrat", "Poppins", "Roboto", "Open Sans", "Lato",
  "Raleway", "Nunito", "Work Sans", "Oswald", "Bebas Neue",
  // — с засечками —
  "Lora", "Playfair Display", "Merriweather", "PT Serif", "EB Garamond",
  "Cormorant Garamond", "Libre Baskerville", "Bitter", "Source Serif 4", "Linden Hill",
  // — рукописные / акцидентные —
  "Kolker Brush", "Pacifico", "Caveat", "Dancing Script", "Lobster", "Comfortaa",
  // — моноширинные —
  "JetBrains Mono", "Roboto Mono", "Courier New",
  // — системные (без загрузки) —
  "system-ui", "Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS",
];

// ---------- состояние ----------
const state = {
  tpl: null,             // текущий шаблон (см. schema.md)
  selectedId: null,
  zoom: 1,
  manualZoom: false,     // true = пользователь задал масштаб сам (auto-fit отключён)
  showGuides: true,
  snap: true,
};
const ZOOM_MIN = 0.05, ZOOM_MAX = 4;

// ---------- утилиты ----------
const uid = () => "el_" + Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = v => (state.snap ? Math.round(v / GRID) * GRID : Math.round(v));
const $ = sel => document.querySelector(sel);

const I18N = {
  ru: {
    title: "Редактор шаблона",
    brand: "Редактор шаблона",
    brandSub: "Соберите макет карточки и скачайте JSON для пака.",
    stepsAria: "Шаги редактора",
    stepBlocks: "Блоки",
    stepBlocksSub: "текст и картинки",
    stepEdit: "Настройка",
    stepEditSub: "шрифт и лимиты",
    stepExport: "Экспорт",
    stepExportSub: "JSON для пака",
    templateName: "Название шаблона",
    newTemplate: "Новый",
    newTitle: "Новый чистый шаблон",
    import: "Импорт",
    importTitle: "Загрузить JSON",
    export: "Скачать JSON",
    exportTitle: "Скачать JSON",
    toolsTitle: "Блоки",
    addField: "Поле текста",
    addFieldSub: "для данных карточки",
    addFieldTitle: "Добавить поле текста",
    addText: "Надпись",
    addTextSub: "статичный текст",
    addTextTitle: "Добавить обычную надпись",
    addImage: "Картинка",
    addImageSub: "SVG, PNG или JPG",
    addImageTitle: "Загрузить картинку",
    viewTitle: "Вид",
    snap: "Привязка к сетке",
    guides: "Показывать поля",
    zoomTitle: "Масштаб",
    zoomOutTitle: "Уменьшить",
    zoomResetTitle: "Сбросить к 100%",
    zoomInTitle: "Увеличить",
    zoomFitTitle: "Вписать",
    zoomFit: "Вписать",
    toolsHint: "Начните с поля текста: оно станет переменной карточки в паке.",
    layersTitle: "Слои",
    layersHint: "Перетащите слой выше или ниже, чтобы изменить порядок.",
    zoomLabel: "масштаб",
    propsTitle: "Настройки",
    emptyProps: "Выберите блок на холсте, чтобы настроить текст, размер и лимиты.",
    layerField: "поле",
    layerText: "текст",
    layerImage: "картинка",
    lockTitle: "заблокировать / разблокировать",
    fieldPlaceholder: "Поле · title",
    staticText: "Статичный текст",
    untitled: "untitled",
    defaultTitle: "Заголовок",
    defaultBody: "Текст",
    geometry: "Геометрия",
    rotation: "Поворот",
    fieldSection: "Поле текста",
    role: "Роль",
    padding: "Отступ X / Y",
    align: "Горизонталь",
    valign: "Вертикаль",
    sampleText: "Пример текста",
    font: "Шрифт",
    fitRange: "Авторазмер",
    fontFamily: "Шрифт",
    fontSize: "Размер",
    fontWeight: "Жирность",
    lineHeight: "Строка",
    color: "Цвет",
    textLimit: "Лимит текста",
    minMaxChars: "Мин / Макс симв.",
    limitHint: "Макс 0 = авто (вместимость при минимальном шрифте {fitMin}px примерно {capacity} симв.). Мин — нижняя граница карточки пака. Сверх максимума текст обрежется.",
    style: "Оформление",
    marker: "Маркер",
    markerColor: "Цвет маркера",
    underline: "Подчёркивание",
    bullets: "Список",
    textSection: "Надпись",
    textValue: "Текст",
    imageSection: "Картинка",
    fit: "Заполнение",
    opacity: "Прозрачность",
    duplicate: "Дублировать",
    delete: "Удалить",
    tooLong: "не влезет",
    newConfirm: "Создать новый чистый шаблон? Текущий autosave будет очищен.",
    imported: "Импортировано",
    importFailed: "Импорт не удался",
    badFormat: "плохой формат",
    jsonSaved: "JSON сохранён",
  },
  en: {
    title: "Template editor",
    brand: "Template editor",
    brandSub: "Build a card layout and download JSON for a pack.",
    stepsAria: "Editor steps",
    stepBlocks: "Blocks",
    stepBlocksSub: "text and images",
    stepEdit: "Settings",
    stepEditSub: "font and limits",
    stepExport: "Export",
    stepExportSub: "JSON for pack",
    templateName: "Template name",
    newTemplate: "New",
    newTitle: "New blank template",
    import: "Import",
    importTitle: "Load JSON",
    export: "Download JSON",
    exportTitle: "Download JSON",
    toolsTitle: "Blocks",
    addField: "Text field",
    addFieldSub: "for card data",
    addFieldTitle: "Add text field",
    addText: "Label",
    addTextSub: "static text",
    addTextTitle: "Add static label",
    addImage: "Image",
    addImageSub: "SVG, PNG or JPG",
    addImageTitle: "Upload image",
    viewTitle: "View",
    snap: "Snap to grid",
    guides: "Show fields",
    zoomTitle: "Zoom",
    zoomOutTitle: "Zoom out",
    zoomResetTitle: "Reset to 100%",
    zoomInTitle: "Zoom in",
    zoomFitTitle: "Fit",
    zoomFit: "Fit",
    toolsHint: "Start with a text field: it becomes a pack card variable.",
    layersTitle: "Layers",
    layersHint: "Drag a layer up or down to change the order.",
    zoomLabel: "zoom",
    propsTitle: "Settings",
    emptyProps: "Select a block on the canvas to adjust text, size and limits.",
    layerField: "field",
    layerText: "text",
    layerImage: "image",
    lockTitle: "lock / unlock",
    fieldPlaceholder: "Field · title",
    staticText: "Static text",
    untitled: "untitled",
    defaultTitle: "Title",
    defaultBody: "Text",
    geometry: "Geometry",
    rotation: "Rotation",
    fieldSection: "Text field",
    role: "Role",
    padding: "Padding X / Y",
    align: "Horizontal",
    valign: "Vertical",
    sampleText: "Sample text",
    font: "Font",
    fitRange: "Auto size",
    fontFamily: "Font",
    fontSize: "Size",
    fontWeight: "Weight",
    lineHeight: "Line",
    color: "Color",
    textLimit: "Text limit",
    minMaxChars: "Min / Max chars",
    limitHint: "Max 0 = auto (capacity at minimum font {fitMin}px is about {capacity} chars). Min is the lower bound for pack cards. Text above max is clipped.",
    style: "Style",
    marker: "Marker",
    markerColor: "Marker color",
    underline: "Underline",
    bullets: "List",
    textSection: "Label",
    textValue: "Text",
    imageSection: "Image",
    fit: "Fit",
    opacity: "Opacity",
    duplicate: "Duplicate",
    delete: "Delete",
    tooLong: "will not fit",
    newConfirm: "Create a new blank template? Current autosave will be cleared.",
    imported: "Imported",
    importFailed: "Import failed",
    badFormat: "bad format",
    jsonSaved: "JSON saved",
  },
};

function editorLang() {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (fromUrl === "en" || fromUrl === "ru") return fromUrl;
  try {
    const saved = localStorage.getItem("uiLang");
    if (saved === "en" || saved === "ru") return saved;
  } catch {}
  return "ru";
}
const LANG = editorLang();
function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) || I18N.ru[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}
function applyI18n() {
  document.documentElement.lang = LANG;
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
}

function toast(msg, isErr) {
  const t = document.createElement("div");
  t.className = "toast" + (isErr ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function findEl(id) { return state.tpl.elements.find(e => e.id === id); }

// Оценка вместимости килбокса в символах ПРИ нижнем шрифте (fitMin) — это «потолок» контента:
// столько текста ещё влезает, когда шрифт уже сжался до читаемого минимума. Больше — текст не
// поместится (обрежется), меньше — шрифт подрастёт. Так текст никогда не становится «совсем мелким».
function estimateCapacity(el) {
  const f = Math.max(8, el.fitMin || 24);
  const lh = (el.font && el.font.lineHeight) || 1.2;
  const padX = el.padX || 0, padY = el.padY || 0;
  const w = Math.max(0, (el.w || 0) - 2 * padX);
  const h = Math.max(0, (el.h || 0) - 2 * padY);
  const lines = Math.max(1, Math.floor(h / (f * lh)));
  const charsPerLine = Math.max(1, Math.floor(w / (0.52 * f))); // ~0.52·кегль — средняя ширина глифа
  return Math.max(1, Math.floor(lines * charsPerLine * 0.9));   // 0.9 — запас на переносы по словам
}
// Эффективный лимит: явный maxChars, либо авто-оценка если не задан (0/пусто).
function effectiveMaxChars(el) {
  return el.maxChars && el.maxChars > 0 ? el.maxChars : estimateCapacity(el);
}

// ---------- дефолтные элементы ----------
function defaultKillbox() {
  return {
    id: uid(), type: "killbox",
    x: 120, y: 120, w: 840, h: 240, rot: 0, locked: false,
    role: "title",
    padX: 16, padY: 0,
    align: "center", valign: "center",
    font: { family: "Inter", size: 72, weight: 700, color: "#111111", lineHeight: 1.1 },
    fitMin: 28, fitMax: 110,
    minChars: 0,            // нижняя граница для валидации карточек пака (0 = без минимума)
    maxChars: 0,            // 0 = авто-лимит (estimateCapacity по геометрии и fitMin)
    highlight: "", underline: false, bullet: false, // маркер-фон / подчёркивание / список-буллеты
    placeholder: t("fieldPlaceholder"),
  };
}
function defaultText() {
  return {
    id: uid(), type: "text",
    x: 140, y: 1700, w: 800, h: 80, rot: 0, locked: false,
    text: t("staticText"),
    font: { family: "Inter", size: 40, weight: 500, color: "#111111", lineHeight: 1.2 },
    align: "left",
  };
}
function defaultImage(src, w, h) {
  return {
    id: uid(), type: "image",
    x: 80, y: 80, w: w || 240, h: h || 240, rot: 0, locked: false,
    src, fit: "contain", opacity: 1,
  };
}
function blankTemplate(name) {
  return {
    version: 1, name: name || t("untitled"),
    canvas: { ...DEFAULT_CANVAS },
    elements: [
      // дефолтные килбоксы — как в primer/template.html
      { ...defaultKillbox(), id: uid(), role: "title",
        x: 65, y: 61, w: 950, h: 235, placeholder: t("defaultTitle") },
      { ...defaultKillbox(), id: uid(), role: "text",
        x: 67, y: 316, w: 946, h: 1424, placeholder: t("defaultBody"),
        font: { family: "Lora", size: 49, weight: 400, color: "#111111", lineHeight: 1.27 },
        fitMin: 26, fitMax: 66, align: "left", valign: "top" },
    ],
  };
}

// ---------- сохранение / загрузка ----------
function autosave() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tpl)); } catch {}
}
function autoload() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

// ---------- рендер ----------
function applyZoom() {
  const stage = $("#stage");
  stage.style.transform = `scale(${state.zoom})`;
  stage.style.width = state.tpl.canvas.w + "px";
  stage.style.height = state.tpl.canvas.h + "px";

  // footprint обёртки = масштабированные габариты, чтобы скролл/центрирование были верными
  const sizer = $("#stageSizer");
  sizer.style.width = (state.tpl.canvas.w * state.zoom) + "px";
  sizer.style.height = (state.tpl.canvas.h * state.zoom) + "px";
  // при ручном зуме не центрируем по горизонтали — иначе «прыгает» при скролле
  sizer.style.margin = state.manualZoom ? "0" : "0 auto";

  $("#canvasInfo").textContent = `${state.tpl.canvas.w} × ${state.tpl.canvas.h}`;
  const pct = Math.round(state.zoom * 100) + "%";
  $("#zoomVal").textContent = pct;
  const zb = $("#zoomBtn"); if (zb) zb.textContent = pct;
}

// авто-вписывание (Fit). Вызывается на старте, ресайзе и по кнопке Fit.
function fitZoom() {
  const stageWrap = $("#stageWrap");
  const pad = 48;
  const sx = (stageWrap.clientWidth - pad) / state.tpl.canvas.w;
  const sy = (stageWrap.clientHeight - pad) / state.tpl.canvas.h;
  state.zoom = Math.max(ZOOM_MIN, Math.min(1, sx, sy));
  state.manualZoom = false;
  applyZoom();
}

// установить масштаб, сохраняя точку (cx,cy в координатах stage-wrap) под курсором
function setZoom(z, cx, cy) {
  const wrap = $("#stageWrap");
  z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  // если центр не задан — берём центр видимой области
  if (cx == null) cx = wrap.clientWidth / 2;
  if (cy == null) cy = wrap.clientHeight / 2;
  // позиция точки на холсте (в координатах холста) ДО зума
  const beforeX = (wrap.scrollLeft + cx) / state.zoom;
  const beforeY = (wrap.scrollTop + cy) / state.zoom;

  state.zoom = z;
  state.manualZoom = true;
  applyZoom();

  // вернуть ту же точку холста под курсор
  wrap.scrollLeft = beforeX * state.zoom - cx;
  wrap.scrollTop  = beforeY * state.zoom - cy;
}

function zoomStep(factor) {
  setZoom(state.zoom * factor);
}

function renderCanvas() {
  const canvas = $("#canvas");
  canvas.style.width = state.tpl.canvas.w + "px";
  canvas.style.height = state.tpl.canvas.h + "px";
  canvas.style.background = state.tpl.canvas.bg;
  canvas.innerHTML = "";

  state.tpl.elements.forEach(el => canvas.appendChild(renderElement(el)));
}

function renderElement(el) {
  const node = document.createElement("div");
  node.className = "el " + el.type + (state.selectedId === el.id ? " selected" : "");
  if (el.type === "killbox" && !state.showGuides) node.classList.add("guides-off");
  node.dataset.id = el.id;
  node.style.transform = `translate(${el.x}px,${el.y}px) rotate(${el.rot || 0}deg)`;
  node.style.width = el.w + "px";
  node.style.height = el.h + "px";

  if (el.type === "killbox") {
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = el.role || t("layerField");
    node.appendChild(label);

    const content = document.createElement("div");
    content.className = "content";
    // превью килбокса = placeholder, отрисованный РЕАЛЬНЫМИ настройками шрифта/выравнивания
    content.style.alignItems = el.valign === "bottom" ? "flex-end" : el.valign === "center" ? "center" : "flex-start";
    content.style.justifyContent = el.align === "right" ? "flex-end" : el.align === "center" ? "center" : "flex-start";
    const padX = el.padX || 0, padY = el.padY || 0;
    const ph = document.createElement("div");
    ph.className = "placeholder";
    ph.style.cssText = `
      padding:${padY}px ${padX}px;width:100%;white-space:pre-wrap;
      font-family:${/\s/.test(el.font.family) ? `"${el.font.family}"` : el.font.family};
      font-size:${el.font.size}px;font-weight:${el.font.weight};
      color:${el.font.color};line-height:${el.font.lineHeight};
      text-align:${el.align || "left"};font-style:normal;opacity:.55;
    `;
    const phText = el.placeholder || el.role || t("layerField");
    if (el.bullet) {
      const ul = document.createElement("ul");
      ul.style.cssText = "list-style:disc;margin:0;padding:0 0 0 1.05em;width:100%;box-sizing:border-box;";
      phText.split("\n").forEach(line => { const li = document.createElement("li"); li.style.marginBottom = ".4em"; appendStyledPreview(li, line, el); ul.appendChild(li); });
      ph.appendChild(ul);
    } else {
      appendStyledPreview(ph, phText, el);
    }
    content.appendChild(ph);
    node.appendChild(content);
  } else if (el.type === "text") {
    const content = document.createElement("div");
    content.className = "content";
    const runtime = document.createElement("div");
    runtime.className = "runtime";
    const div = document.createElement("div");
    div.style.fontFamily = el.font.family;
    div.style.fontSize = el.font.size + "px";
    div.style.fontWeight = el.font.weight;
    div.style.color = el.font.color;
    div.style.lineHeight = el.font.lineHeight;
    div.style.textAlign = el.align;
    div.textContent = el.text;
    runtime.appendChild(div);
    content.appendChild(runtime);
    node.appendChild(content);
  } else if (el.type === "image") {
    const content = document.createElement("div");
    content.className = "content";
    const img = document.createElement("img");
    img.src = el.src;
    img.alt = "";
    img.style.objectFit = el.fit || "contain";
    img.style.opacity = el.opacity ?? 1;
    content.appendChild(img);
    node.appendChild(content);
  }

  // ручки на выделенном — только если не залочен
  if (state.selectedId === el.id && !el.locked) {
    ["nw","n","ne","e","se","s","sw","w"].forEach(pos => {
      const h = document.createElement("div");
      h.className = "handle " + pos;
      h.dataset.handle = pos;
      node.appendChild(h);
    });
  }

  // drag start
  node.addEventListener("pointerdown", onElementPointerDown);
  return node;
}

function renderLayers() {
  const ul = $("#layers");
  ul.innerHTML = "";
  // сверху списка — верхние z-index. Поэтому идём с конца.
  for (let i = state.tpl.elements.length - 1; i >= 0; i--) {
    const el = state.tpl.elements[i];
    const li = document.createElement("li");
    li.dataset.id = el.id;
    li.draggable = true;
    if (state.selectedId === el.id) li.classList.add("selected");

    const ic = document.createElement("span"); ic.className = "ic";
    ic.textContent = el.type === "killbox" ? "▣" : el.type === "text" ? "T" : "▦";
    const name = document.createElement("span"); name.className = "name";
    name.textContent = el.type === "killbox" ? `${el.role || t("layerField")}` :
                      el.type === "text"     ? (el.text || t("layerText")).slice(0, 28) :
                      t("layerImage");
    const lock = document.createElement("span"); lock.className = "lock";
    lock.textContent = el.locked ? "🔒" : "🔓";
    lock.title = t("lockTitle");
    lock.addEventListener("click", e => { e.stopPropagation(); el.locked = !el.locked; render(); autosave(); });

    li.append(ic, name, lock);
    li.addEventListener("click", () => select(el.id));

    // drag-n-drop для z-index
    li.addEventListener("dragstart", e => { li.classList.add("dragging"); e.dataTransfer.setData("text/id", el.id); });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragover", e => { e.preventDefault(); li.classList.add("drop-target"); });
    li.addEventListener("dragleave", () => li.classList.remove("drop-target"));
    li.addEventListener("drop", e => {
      e.preventDefault();
      li.classList.remove("drop-target");
      const fromId = e.dataTransfer.getData("text/id");
      if (!fromId || fromId === el.id) return;
      const arr = state.tpl.elements;
      const fromIdx = arr.findIndex(x => x.id === fromId);
      const toIdx = arr.findIndex(x => x.id === el.id);
      const [m] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, m);
      render(); autosave();
    });

    ul.appendChild(li);
  }
}

function renderProps(force) {
  const root = $("#props");
  // не пересоздавать панель, пока пользователь печатает в её поле (иначе слетает фокус)
  if (!force && root.contains(document.activeElement) &&
      document.activeElement.matches("input,textarea,select")) return;
  const el = findEl(state.selectedId);
  if (!el) {
    root.innerHTML = `<div class="empty">${t("emptyProps")}</div>`;
    return;
  }
  root.innerHTML = "";

  // --- секция: позиция/размер ---
  root.appendChild(section(t("geometry")));
  root.appendChild(rowPair("X / Y", "number", el.x, el.y, (vx, vy) => { el.x = vx; el.y = vy; render(); autosave(); }));
  root.appendChild(rowPair("W / H", "number", el.w, el.h, (vw, vh) => { el.w = Math.max(MIN_SIZE, vw); el.h = Math.max(MIN_SIZE, vh); render(); autosave(); }, MIN_SIZE));
  root.appendChild(row(t("rotation"), "number", el.rot || 0, v => { el.rot = v; render(); autosave(); }));

  if (el.type === "killbox") {
    root.appendChild(section(t("fieldSection")));
    root.appendChild(row(t("role"), "text", el.role, v => { el.role = v; render(); autosave(); }));
    root.appendChild(rowPair(t("padding"), "number", el.padX, el.padY, (a, b) => { el.padX = a; el.padY = b; render(); autosave(); }));
    root.appendChild(rowSelect(t("align"), el.align, ["left","center","right"], v => { el.align = v; render(); autosave(); }));
    root.appendChild(rowSelect(t("valign"), el.valign, ["top","center","bottom"], v => { el.valign = v; render(); autosave(); }));
    root.appendChild(rowTextareaCounted(t("sampleText"), el.placeholder || "", () => effectiveMaxChars(el), v => { el.placeholder = v; render(); autosave(); }));

    root.appendChild(section(t("font")));
    fontRows(root, el);
    root.appendChild(rowPair(t("fitRange"), "number", el.fitMin, el.fitMax, (a, b) => { el.fitMin = a; el.fitMax = b; render(); autosave(); }));

    // --- лимит текста: пол шрифта (fitMin) + потолок символов, чтобы текст не мельчал и не обрезался ---
    root.appendChild(section(t("textLimit")));
    root.appendChild(rowPair(t("minMaxChars"), "number", el.minChars || 0, el.maxChars || 0, (a, b) => { el.minChars = Math.max(0, Math.round(a) || 0); el.maxChars = Math.max(0, Math.round(b) || 0); render(); autosave(); }, 0));
    root.appendChild(hint(t("limitHint", { fitMin: el.fitMin || 24, capacity: estimateCapacity(el) })));

    root.appendChild(section(t("style")));
    root.appendChild(rowCheck(t("marker"), !!el.highlight, on => { el.highlight = on ? (el.highlight || "#aaff00") : ""; renderCanvas(); autosave(); }));
    root.appendChild(rowColor(t("markerColor"), el.highlight || "#aaff00", v => { el.highlight = v; renderCanvas(); autosave(); }));
    root.appendChild(rowCheck(t("underline"), !!el.underline, on => { el.underline = on; renderCanvas(); autosave(); }));
    root.appendChild(rowCheck(t("bullets"), !!el.bullet, on => { el.bullet = on; renderCanvas(); autosave(); }));
  }

  if (el.type === "text") {
    root.appendChild(section(t("textSection")));
    root.appendChild(rowTextarea(t("textValue"), el.text, v => { el.text = v; render(); autosave(); }));
    root.appendChild(rowSelect(t("align"), el.align, ["left","center","right"], v => { el.align = v; render(); autosave(); }));

    root.appendChild(section(t("font")));
    fontRows(root, el);
  }

  if (el.type === "image") {
    root.appendChild(section(t("imageSection")));
    root.appendChild(rowSelect(t("fit"), el.fit || "contain", ["contain","cover","fill"], v => { el.fit = v; render(); autosave(); }));
    root.appendChild(row(t("opacity"), "number", el.opacity ?? 1, v => { el.opacity = clamp(+v, 0, 1); render(); autosave(); }, 0));
  }

  // --- кнопки ---
  const actions = document.createElement("div"); actions.className = "btn-row";
  const dup = btn(t("duplicate"), () => { duplicate(el.id); });
  const del = btn(t("delete"), () => { remove(el.id); }, "danger");
  actions.append(dup, del); root.appendChild(actions);
}

// helpers для props
function section(txt){ const s=document.createElement("div"); s.className="sec"; s.textContent=txt; return s; }
function row(label, type, val, onChange, min){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("label"); l.textContent=label;
  const i=document.createElement("input"); i.type=type; i.value=val; if(min!=null) i.min=min;
  i.addEventListener("change", () => onChange(type==="number"? +i.value : i.value));
  r.append(l,i); return r;
}
function rowPair(label, type, vA, vB, onChange, min){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("label"); l.textContent=label;
  const wrap=document.createElement("div"); wrap.className="pair";
  const a=document.createElement("input"); a.type=type; a.value=vA;
  const b=document.createElement("input"); b.type=type; b.value=vB;
  if(min!=null){ a.min=min; b.min=min; }
  const fire=()=>onChange(type==="number"? +a.value : a.value, type==="number"? +b.value : b.value);
  a.addEventListener("change", fire); b.addEventListener("change", fire);
  wrap.append(a,b); r.append(l,wrap); return r;
}
function rowCheck(label, checked, onChange){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("label"); l.textContent=label;
  const i=document.createElement("input"); i.type="checkbox"; i.checked=!!checked;
  i.addEventListener("change", () => onChange(i.checked));
  r.append(l,i); return r;
}
// превью текста килбокса с маркером/подчёркиванием — как styledText в renderer.js
function appendStyledPreview(parent, text, el){
  if (el.highlight){
    const s=document.createElement("span");
    s.textContent=text;
    s.style.cssText=`background:${el.highlight};box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:.05em .22em;border-radius:2px;`+(el.underline?"text-decoration:underline;":"");
    parent.appendChild(s);
  } else {
    parent.appendChild(document.createTextNode(text));
    if (el.underline) parent.style.textDecoration="underline";
  }
}
function rowSelect(label, val, opts, onChange){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("label"); l.textContent=label;
  const s=document.createElement("select");
  opts.forEach(o => { const opt=document.createElement("option"); opt.value=o; opt.textContent=o; if(o===val) opt.selected=true; s.appendChild(opt); });
  s.addEventListener("change", () => onChange(s.value));
  r.append(l,s); return r;
}
function rowTextarea(label, val, onChange){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("label"); l.textContent=label;
  const t=document.createElement("textarea"); t.value=val;
  t.addEventListener("input", () => onChange(t.value));
  r.append(l,t); return r;
}
// textarea + живой счётчик «длина / лимит»; краснеет, когда текст превышает лимит (не влезет при fitMin)
function rowTextareaCounted(label, val, getMax, onChange){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("label"); l.textContent=label;
  const box=document.createElement("div"); box.style.cssText="display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;";
  const t=document.createElement("textarea"); t.value=val; t.style.width="100%";
  const cnt=document.createElement("div"); cnt.style.cssText="font-size:11px;line-height:1;text-align:right;";
  const paint=()=>{
    const max=getMax(), len=t.value.length, over=len>max;
    cnt.textContent = `${len} / ${max}` + (over ? ` · ${t("tooLong")}` : "");
    cnt.style.color = over ? "#e5484d" : "#8a8f98";
  };
  t.addEventListener("input", () => { onChange(t.value); paint(); });
  paint();
  box.append(t,cnt); r.append(l,box); return r;
}
// строка-подсказка на всю ширину панели (мелкий приглушённый текст)
function hint(text){
  const d=document.createElement("div");
  d.style.cssText="font-size:11px;line-height:1.35;color:#8a8f98;padding:2px 2px 6px;";
  d.textContent=text; return d;
}
function rowColor(label, val, onChange){
  const r=document.createElement("div"); r.className="row";
  const l=document.createElement("label"); l.textContent=label;
  const wrap=document.createElement("div"); wrap.className="pair";
  const c=document.createElement("input"); c.type="color"; c.value=val;
  const tx=document.createElement("input"); tx.type="text"; tx.value=val;
  c.addEventListener("input", () => { tx.value=c.value; onChange(c.value); });
  tx.addEventListener("change", () => { c.value=tx.value; onChange(tx.value); });
  wrap.append(c,tx); r.append(l,wrap); return r;
}
function btn(label, fn, cls){
  const b=document.createElement("button"); b.textContent=label; if(cls) b.className=cls;
  b.addEventListener("click", fn); return b;
}
function fontRows(root, el){
  root.appendChild(rowSelect(t("fontFamily"), el.font.family, FONTS, v => { el.font.family=v; render(); autosave(); }));
  root.appendChild(row(t("fontSize"), "number", el.font.size, v => { el.font.size=+v; render(); autosave(); }));
  root.appendChild(rowSelect(t("fontWeight"), String(el.font.weight), ["400","500","600","700","800"], v => { el.font.weight=+v; render(); autosave(); }));
  root.appendChild(row(t("lineHeight"), "number", el.font.lineHeight, v => { el.font.lineHeight=+v; render(); autosave(); }));
  root.appendChild(rowColor(t("color"), el.font.color, v => { el.font.color=v; render(); autosave(); }));
}

// ---------- действия ----------
function select(id) {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  state.selectedId = id;
  applyZoom(); renderCanvas(); renderLayers(); renderProps(true);   // принудительно пересобрать свойства
}
function duplicate(id) {
  const el = findEl(id); if (!el) return;
  const copy = JSON.parse(JSON.stringify(el));
  copy.id = uid(); copy.x = el.x + 20; copy.y = el.y + 20;
  state.tpl.elements.push(copy); state.selectedId = copy.id;
  render(); autosave();
}
function remove(id) {
  const i = state.tpl.elements.findIndex(e => e.id === id); if (i < 0) return;
  state.tpl.elements.splice(i, 1);
  if (state.selectedId === id) state.selectedId = null;
  render(); autosave();
}

// ---------- drag & resize ----------
let drag = null;

function onElementPointerDown(e) {
  if (e.target.classList.contains("handle")) return startResize(e);
  // ищем верхний .el
  const node = e.currentTarget;
  const id = node.dataset.id;
  const el = findEl(id);
  if (!el || el.locked) return;
  state.selectedId = id; render();
  e.preventDefault(); e.stopPropagation();
  const startX = e.clientX, startY = e.clientY;
  const ox = el.x, oy = el.y;
  drag = {
    move: ev => {
      const dx = (ev.clientX - startX) / state.zoom;
      const dy = (ev.clientY - startY) / state.zoom;
      el.x = snap(ox + dx); el.y = snap(oy + dy);
      render();
    },
    up: () => { autosave(); drag = null; window.removeEventListener("pointermove", drag2.move); window.removeEventListener("pointerup", drag2.up); }
  };
  const drag2 = drag;
  window.addEventListener("pointermove", drag.move);
  window.addEventListener("pointerup", drag.up);
}

function startResize(e) {
  e.preventDefault(); e.stopPropagation();
  const handle = e.target.dataset.handle;
  const node = e.target.closest(".el");
  const el = findEl(node.dataset.id); if (!el) return;
  const startX = e.clientX, startY = e.clientY;
  const ox = el.x, oy = el.y, ow = el.w, oh = el.h;

  const rad = (el.rot || 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // поворот вектора (учёт системы координат)
  const rot = (px, py) => ({ x: px * cos - py * sin, y: px * sin + py * cos });

  // какой угол/край ФИКСИРУЕМ (знаки полу-габаритов противоположной стороны)
  const sx = handle.includes("w") ? 1 : handle.includes("e") ? -1 : 0;
  const sy = handle.includes("n") ? 1 : handle.includes("s") ? -1 : 0;

  // центр (инвариантен относительно поворота, т.к. transform-origin = center)
  const cx0 = ox + ow / 2, cy0 = oy + oh / 2;
  // экранная позиция фиксируемой точки (по старым габаритам)
  const fOff = rot(sx * ow / 2, sy * oh / 2);
  const fx = cx0 + fOff.x, fy = cy0 + fOff.y;

  const move = ev => {
    const dx = (ev.clientX - startX) / state.zoom;
    const dy = (ev.clientY - startY) / state.zoom;
    // смещение курсора в ЛОКАЛЬНЫХ осях элемента
    const lx =  dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;

    let w = ow, h = oh;
    if (handle.includes("e")) w = ow + lx;
    if (handle.includes("w")) w = ow - lx;
    if (handle.includes("s")) h = oh + ly;
    if (handle.includes("n")) h = oh - ly;
    w = Math.max(MIN_SIZE, w);
    h = Math.max(MIN_SIZE, h);

    // новый центр так, чтобы фиксируемая точка осталась на месте
    const aOff = rot(sx * w / 2, sy * h / 2);
    const cx = fx - aOff.x, cy = fy - aOff.y;

    el.w = snap(w); el.h = snap(h);
    el.x = snap(cx - el.w / 2);
    el.y = snap(cy - el.h / 2);
    applyZoom(); renderCanvas(); renderLayers();
  };
  const up = () => { autosave(); renderProps(true); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// клик по пустому холсту — снять выделение
$("#canvas")?.addEventListener("pointerdown", e => { if (e.target.id === "canvas") { state.selectedId = null; render(); } });

// ---------- клавиатура ----------
window.addEventListener("keydown", e => {
  if (e.target.matches("input,textarea,select")) return;

  // зум с клавиатуры
  if (e.ctrlKey && (e.key === "=" || e.key === "+")) { zoomStep(1.2); e.preventDefault(); return; }
  if (e.ctrlKey && e.key === "-")                    { zoomStep(1/1.2); e.preventDefault(); return; }
  if (e.ctrlKey && e.key === "0")                    { fitZoom(); e.preventDefault(); return; }

  const el = findEl(state.selectedId);
  if (!el || el.locked) {
    if (e.key === "Escape") { state.selectedId = null; render(); }
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(el.id); return; }
  if (e.key === "Escape") { state.selectedId = null; render(); return; }
  const step = e.shiftKey ? 10 : 1;
  if (e.key === "ArrowLeft")  { el.x -= step; render(); autosave(); e.preventDefault(); }
  if (e.key === "ArrowRight") { el.x += step; render(); autosave(); e.preventDefault(); }
  if (e.key === "ArrowUp")    { el.y -= step; render(); autosave(); e.preventDefault(); }
  if (e.key === "ArrowDown")  { el.y += step; render(); autosave(); e.preventDefault(); }
});

// ---------- тулбар ----------
document.addEventListener("click", e => {
  const step = e.target.closest("[data-step]");
  if (step) {
    activateStep(step.dataset.step);
    return;
  }
  const a = e.target.closest("[data-action]"); if (!a) return;
  const act = a.dataset.action;
  if (act === "add-killbox") { state.tpl.elements.push(defaultKillbox()); state.selectedId = state.tpl.elements.at(-1).id; render(); autosave(); }
  if (act === "add-text")    { state.tpl.elements.push(defaultText());    state.selectedId = state.tpl.elements.at(-1).id; render(); autosave(); }
  if (act === "new")         { if (confirm(t("newConfirm"))) { state.tpl = blankTemplate(); state.selectedId = null; $("#tplName").value = state.tpl.name; render(); autosave(); } }
  if (act === "export")      exportJson();
  if (act === "import")      $("#importInput").click();
  if (act === "zoom-in")     zoomStep(1.2);
  if (act === "zoom-out")    zoomStep(1 / 1.2);
  if (act === "zoom-fit")    fitZoom();
  if (act === "zoom-pct")    setZoom(1);   // 100%
});

function activateStep(step) {
  document.querySelectorAll("[data-step]").forEach(el => el.classList.toggle("is-active", el.dataset.step === step));
  const target =
    step === "blocks" ? $("#toolsPanel") :
    step === "edit" ? $("#propsPanel") :
    step === "export" ? $(".top-actions") :
    null;
  if (target) target.classList.add("pulse");
  window.setTimeout(() => target && target.classList.remove("pulse"), 520);
}

// ---------- зум колесом (Ctrl + wheel) к точке курсора ----------
$("#stageWrap").addEventListener("wheel", e => {
  if (!e.ctrlKey) return;            // обычный скролл оставляем как есть
  e.preventDefault();
  const wrap = $("#stageWrap");
  const r = wrap.getBoundingClientRect();
  const cx = e.clientX - r.left, cy = e.clientY - r.top;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  setZoom(state.zoom * factor, cx, cy);
}, { passive: false });

// ---------- панорамирование: пробел + перетаскивание (или средняя кнопка) ----------
let spaceDown = false, panning = null;
window.addEventListener("keydown", e => {
  if (e.code === "Space" && !e.target.matches("input,textarea,select")) {
    spaceDown = true; $("#stageWrap").classList.add("panning"); e.preventDefault();
  }
});
window.addEventListener("keyup", e => {
  if (e.code === "Space") { spaceDown = false; $("#stageWrap").classList.remove("panning","grabbing"); }
});
$("#stageWrap").addEventListener("pointerdown", e => {
  const isMiddle = e.button === 1;
  if (!spaceDown && !isMiddle) return;
  e.preventDefault(); e.stopPropagation();   // не запускаем drag элемента
  const wrap = $("#stageWrap");
  wrap.classList.add("grabbing");
  const sl = wrap.scrollLeft, st = wrap.scrollTop, sx = e.clientX, sy = e.clientY;
  panning = ev => { wrap.scrollLeft = sl - (ev.clientX - sx); wrap.scrollTop = st - (ev.clientY - sy); };
  const up = () => { wrap.classList.remove("grabbing"); window.removeEventListener("pointermove", panning); window.removeEventListener("pointerup", up); panning = null; };
  window.addEventListener("pointermove", panning);
  window.addEventListener("pointerup", up);
}, true);  // capture: перехватываем раньше drag элемента

$("#imageInput").addEventListener("change", async e => {
  const f = e.target.files?.[0]; if (!f) return;
  const dataUrl = await fileToDataUrl(f);
  // попытаемся определить натуральные размеры
  const dims = await imageDims(dataUrl);
  const w = Math.min(600, dims?.w || 300);
  const ratio = dims ? dims.h / dims.w : 1;
  const h = Math.round(w * ratio);
  state.tpl.elements.push(defaultImage(dataUrl, w, h));
  state.selectedId = state.tpl.elements.at(-1).id;
  e.target.value = "";
  render(); autosave();
});

$("#importInput").addEventListener("change", async e => {
  const f = e.target.files?.[0]; if (!f) return;
  try {
    const json = JSON.parse(await f.text());
    if (!json || !json.canvas || !Array.isArray(json.elements)) throw new Error("плохой формат");
    state.tpl = json; state.selectedId = null;
    $("#tplName").value = json.name || "imported";
    render(); autosave();
    toast(t("imported"));
  } catch (err) { toast(t("importFailed") + ": " + (err.message === "плохой формат" ? t("badFormat") : err.message), true); }
  e.target.value = "";
});

$("#tplName").addEventListener("input", e => { state.tpl.name = e.target.value.trim() || "untitled"; autosave(); });
$("#snapToggle").addEventListener("change", e => { state.snap = e.target.checked; });
$("#guidesToggle").addEventListener("change", e => { state.showGuides = e.target.checked; render(); });

function exportJson() {
  const blob = new Blob([JSON.stringify(state.tpl, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (state.tpl.name || "template") + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(t("jsonSaved"));
}

function fileToDataUrl(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}
function imageDims(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => res(null);
    img.src = src;
  });
}

// ---------- глобальный рендер ----------
function render() {
  applyZoom();          // сохраняет текущий масштаб (ручной или авто)
  renderCanvas();
  renderLayers();
  renderProps();
}

// ресайз окна: пере-вписываем только если пользователь не зумил вручную
window.addEventListener("resize", () => { if (!state.manualZoom) fitZoom(); });

// ---------- старт ----------
function start() {
  applyI18n();
  state.tpl = autoload() || blankTemplate();
  $("#tplName").value = state.tpl.name || "untitled";
  $("#snapToggle").checked = state.snap;
  $("#guidesToggle").checked = state.showGuides;
  fitZoom();     // стартовое авто-вписывание
  render();
}
start();
