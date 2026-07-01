// ============== Runtime renderer для интеграции в сайт ==============
//
// Берёт JSON-шаблон (см. schema.md) и опциональный объект контента
// (карта role → значение) и рисует готовую карточку в указанный контейнер.
//
// 2 способа подключения:
//   1) ES-модуль (через http/https):
//        import { renderTemplate } from "./template-editor/renderer.js";
//   2) Глобально (через <script src=... > даже с file://):
//        <script src="template-editor/renderer.js"></script>
//        <script>renderTemplate(el, tpl, {...});</script>
//
// Контент по role:
//   - строка             → одно значение в килбоксе (как заголовок)
//   - массив строк       → автоматически в список <ul>
//   - undefined          → используется placeholder из шаблона

(function (root) {
function renderTemplate(container, tpl, content, opts) {
  content = content || {};
  opts = opts || {};
  if (!tpl || !tpl.canvas || !Array.isArray(tpl.elements)) {
    throw new Error("renderTemplate: bad template");
  }
  const fit = opts.fit !== false;     // по умолчанию вписываем в ширину контейнера
  const showKillboxOutline = !!opts.showKillboxOutline;

  container.innerHTML = "";
  container.style.position = "relative";

  // обёртка-сцена со скейлом
  const stage = document.createElement("div");
  stage.style.cssText = `
    position:relative;width:${tpl.canvas.w}px;height:${tpl.canvas.h}px;
    background:${tpl.canvas.bg || "#fff"};
    transform-origin:top left;overflow:hidden;
  `;
  container.appendChild(stage);

  function applyFit() {
    if (!fit) return;
    const w = container.clientWidth || tpl.canvas.w;
    const s = Math.min(1, w / tpl.canvas.w);
    stage.style.transform = `scale(${s})`;
    container.style.height = (tpl.canvas.h * s) + "px";
  }
  applyFit();
  new ResizeObserver(applyFit).observe(container);

  // элементы
  tpl.elements.forEach(el => {
    const node = mountElement(el, content, showKillboxOutline);
    stage.appendChild(node);
  });

  // авто-подгон шрифта килбоксов — после монтирования (нужны реальные размеры).
  // Повторяем после загрузки веб-шрифтов: их метрики шире/выше fallback — иначе подгон
  // посчитан по системному шрифту, а реальный текст потом переполняет бокс (и обрезается).
  function fitAllKillboxes() {
    tpl.elements.forEach(el => {
      if (el.type === "killbox") fitKillbox(el, stage);
    });
  }
  requestAnimationFrame(fitAllKillboxes);
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(fitAllKillboxes));
  }
}

function mountElement(el, content, showKillboxOutline) {
  const node = document.createElement("div");
  node.style.cssText = `
    position:absolute;left:0;top:0;width:${el.w}px;height:${el.h}px;
    transform:translate(${el.x}px,${el.y}px) rotate(${el.rot || 0}deg);
  `;
  applyBoxStyle(node, el);
  node.dataset.id = el.id;
  node.dataset.type = el.type;
  if (el.role) node.dataset.role = el.role;

  if (el.type === "killbox") {
    node.style.overflow = "hidden";
    if (showKillboxOutline) {
      node.style.outline = "2px dashed rgba(79,140,255,.7)";
      node.style.outlineOffset = "-2px";
    }
    const inner = document.createElement("div");
    const padX = el.padX || 0, padY = el.padY || 0;
    inner.style.cssText = `
      position:absolute;left:${padX}px;right:${padX}px;top:${padY}px;bottom:${padY}px;
      display:flex;align-items:${valignToFlex(el.valign)};justify-content:${alignToFlex(el.align)};
      text-align:${el.align || "left"};
      font-family:${quoteFont(el.font.family)};
      font-weight:${el.font.weight};
      color:${el.font.color};
      line-height:${el.font.lineHeight};
      text-shadow:${el.textShadow || "none"};
    `;
    // содержимое килбокса
    const val = content[el.role];
    inner.appendChild(killboxContent(val, el));
    node.appendChild(inner);
  } else if (el.type === "text") {
    node.style.display = "flex";
    node.style.alignItems = "center";
    node.style.justifyContent = alignToFlex(el.align);
    const div = document.createElement("div");
    div.style.cssText = `
      width:100%;text-align:${el.align || "left"};
      font-family:${quoteFont(el.font.family)};
      font-size:${el.font.size}px;
      font-weight:${el.font.weight};
      color:${el.font.color};
      line-height:${el.font.lineHeight};
      text-shadow:${el.textShadow || "none"};
    `;
    div.textContent = el.text;
    node.appendChild(div);
  } else if (el.type === "image") {
    node.style.opacity = el.opacity ?? 1;
    const img = document.createElement("img");
    img.src = el.src;
    img.alt = "";
    img.style.cssText = `width:100%;height:100%;object-fit:${el.fit || "contain"};display:block;`;
    node.appendChild(img);
  }
  return node;
}

function applyBoxStyle(node, el) {
  if (el.bg) node.style.background = el.bg;
  if (el.border) node.style.border = el.border;
  if (el.radius != null) node.style.borderRadius = typeof el.radius === "number" ? el.radius + "px" : String(el.radius);
  if (el.shadow) node.style.boxShadow = el.shadow;
  if (el.opacity != null && el.type !== "image") node.style.opacity = el.opacity;
  if (el.clip) node.style.overflow = "hidden";
}

// Текст с опц. «маркером» (подсветка как хайлайтером, box-decoration-break:clone — отдельная плашка
// на каждой строке) и подчёркиванием. el.highlight = цвет плашки, el.underline = bool.
function styledText(text, el) {
  if (el.highlight) {
    const s = document.createElement("span");
    s.textContent = text;
    s.style.cssText =
      `background:${el.highlight};box-decoration-break:clone;-webkit-box-decoration-break:clone;` +
      `padding:.05em .22em;border-radius:2px;` +
      (el.underline ? "text-decoration:underline;text-decoration-thickness:.06em;text-underline-offset:.1em;" : "");
    return s;
  }
  const t = document.createTextNode(text);
  return t;
}

function killboxContent(val, el) {
  const max = effectiveMaxChars(el);  // потолок символов: текст сверх него обрезаем «…»
  // массив → список (el.bullet=true → видимые круглые маркеры)
  if (Array.isArray(val)) {
    const items = clampList(val, max);
    const ul = document.createElement("ul");
    ul.style.cssText = el.bullet
      ? `list-style:disc;margin:0;padding:0 0 0 1.05em;width:100%;box-sizing:border-box;`
      : `list-style:none;margin:0;padding:0;width:100%;box-sizing:border-box;`;
    if (el.underline && !el.highlight) ul.style.textDecoration = "underline";
    items.forEach(item => {
      const li = document.createElement("li");
      li.style.cssText = `margin-bottom:.4em;`;
      li.appendChild(styledText(item, el));
      ul.appendChild(li);
    });
    const wrap = document.createElement("div");
    wrap.style.width = "100%";
    wrap.appendChild(ul);
    return wrap;
  }
  // строка → одна
  if (typeof val === "string") {
    const div = document.createElement("div");
    div.style.cssText = "width:100%;white-space:pre-wrap;overflow-wrap:anywhere;";
    if (el.underline && !el.highlight) div.style.textDecoration = "underline";
    div.appendChild(styledText(clampStr(val, max), el));
    return div;
  }
  // HTML/DOM узел — позволяем сайту передавать готовое содержимое
  if (val instanceof HTMLElement) return val;
  // placeholder (если контента нет)
  if (el.placeholder) {
    const div = document.createElement("div");
    div.style.cssText = "width:100%;color:rgba(0,0,0,.3);font-style:italic;white-space:pre-wrap;";
    div.textContent = clampStr(el.placeholder, max);
    return div;
  }
  return document.createElement("div");
}

// ---- лимит текста: оценка вместимости при fitMin + обрезка «…» (см. editor.js — те же формулы) ----
function estimateCapacity(el) {
  const f = Math.max(8, el.fitMin || 24);
  const lh = (el.font && el.font.lineHeight) || 1.2;
  const padX = el.padX || 0, padY = el.padY || 0;
  const w = Math.max(0, (el.w || 0) - 2 * padX);
  const h = Math.max(0, (el.h || 0) - 2 * padY);
  const lines = Math.max(1, Math.floor(h / (f * lh)));
  const charsPerLine = Math.max(1, Math.floor(w / (0.52 * f)));
  return Math.max(1, Math.floor(lines * charsPerLine * 0.9));
}
function effectiveMaxChars(el) {
  return el.maxChars && el.maxChars > 0 ? el.maxChars : estimateCapacity(el);
}
function clampStr(s, max) {
  s = String(s);
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1).replace(/\s+$/, "") + "…";
}
function clampList(arr, max) {
  const out = []; let used = 0;
  for (const raw of arr) {
    const item = String(raw);
    if (used + item.length <= max) { out.push(item); used += item.length; continue; }
    const left = max - used;
    if (left > 1) out.push(clampStr(item, left));   // последний пункт обрезаем по остатку
    break;                                          // остальные пункты не влезают — отбрасываем
  }
  return out.length ? out : (arr.length ? [clampStr(String(arr[0]), max)] : []);
}

// авто-подгон шрифта килбокса под высоту/ширину
function fitKillbox(el, stage) {
  const node = stage.querySelector(`[data-id="${el.id}"]`);
  if (!node) return;
  const inner = node.firstElementChild;
  if (!inner) return;
  const min = el.fitMin || 24, max = el.fitMax || el.font.size, start = el.font.size || max;
  let s = Math.min(start, max);
  inner.style.fontSize = s + "px";
  // ужать пока выходит
  while (s > min && (inner.scrollHeight > node.clientHeight || inner.scrollWidth > node.clientWidth)) {
    s -= 1; inner.style.fontSize = s + "px";
  }
  // подрасти пока влезает
  while (s < max && inner.scrollHeight <= node.clientHeight && inner.scrollWidth <= node.clientWidth) {
    s += 1; inner.style.fontSize = s + "px";
    if (inner.scrollHeight > node.clientHeight || inner.scrollWidth > node.clientWidth) { s -= 1; inner.style.fontSize = s + "px"; break; }
  }
}

function alignToFlex(a) { return a === "right" ? "flex-end" : a === "center" ? "center" : "flex-start"; }
function valignToFlex(a) { return a === "bottom" ? "flex-end" : a === "center" ? "center" : "flex-start"; }
function quoteFont(f) { return /\s/.test(f) ? `"${f}"` : f; }

  // публикуем
  root.renderTemplate = renderTemplate;
  if (typeof module !== "undefined" && module.exports) module.exports = { renderTemplate };
})(typeof window !== "undefined" ? window : globalThis);
