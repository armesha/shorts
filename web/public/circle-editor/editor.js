(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const scene = $("#scene");
  const viewport = $("#stageViewport");
  const shell = $("#sceneShell");
  const props = $("#props");
  const sourceSelect = $("#sourceSelect");
  const gameplaySelect = $("#gameplaySelect");
  const templateNameInput = $("#templateName");
  const elements = { puzzle: $("#puzzle"), circle: $("#circle"), banner: $("#banner") };
  let scale = 0.35;
  let selected = "puzzle";
  let sourceFiles = [];
  let layout = {
    circle: { x: 130, y: 300, size: 820 },
    puzzle: { x: 90, y: 92, width: 900, labelSize: 30, puzzleSize: 68, gap: 14 },
    banner: { x: 90, y: 830, width: 900, height: 260 },
  };
  let gesture = null;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, Math.round(Number(n) || 0)));
  const mediaUrl = (kind, file) => `/api/circle-editor/media/${kind}/${encodeURIComponent(file)}`;

  function setStatus(title, text, type = "") {
    $("#statusTitle").textContent = title;
    $("#statusText").textContent = text;
    const card = $(".status-card");
    card.className = `status-card ${type}`.trim();
  }

  function fit() {
    const rect = viewport.getBoundingClientRect();
    scale = Math.min((rect.width - 34) / 1080, (rect.height - 34) / 1920, 0.62);
    shell.style.width = `${1080 * scale}px`;
    shell.style.height = `${1920 * scale}px`;
    scene.style.transform = `scale(${scale})`;
    $("#zoomValue").textContent = `${Math.round(scale * 100)}%`;
  }

  function render() {
    const c = layout.circle;
    Object.assign(elements.circle.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.size}px`, height: `${c.size}px` });
    const p = layout.puzzle;
    const puzzleHeight = p.labelSize + p.gap + p.puzzleSize * 1.1;
    Object.assign(elements.puzzle.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${puzzleHeight}px` });
    elements.puzzle.querySelector(".puzzle-label").style.fontSize = `${p.labelSize}px`;
    const example = elements.puzzle.querySelector(".puzzle-example");
    example.style.fontSize = `${p.puzzleSize}px`;
    example.style.marginTop = `${p.gap}px`;
    const b = layout.banner;
    Object.assign(elements.banner.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px` });
    renderProps();
  }

  function fieldsFor(kind) {
    if (kind === "circle") return [
      ["x", "X", -1000, 2080], ["y", "Y", -1000, 2920], ["size", "Диаметр", 160, 1400],
    ];
    if (kind === "banner") return [
      ["x", "X", -1000, 2080], ["y", "Y", -500, 3000], ["width", "Ширина", 160, 2160], ["height", "Высота", 60, 1080],
    ];
    return [
      ["x", "X", -1000, 2080], ["y", "Y", 0, 1800], ["width", "Ширина", 160, 2160],
      ["labelSize", "Подпись", 16, 120], ["puzzleSize", "Пример", 24, 180], ["gap", "Отступ", 0, 100],
    ];
  }

  function renderProps() {
    if (!layout) return;
    const names = { circle: "Кружок", puzzle: "Загадка", banner: "Баннер" };
    props.innerHTML = `<div class="selection-name">${names[selected]}</div><div class="form-grid">${fieldsFor(selected).map(([key, label, min, max]) => `<label class="field"><span>${label}</span><input type="number" data-field="${key}" min="${min}" max="${max}" value="${layout[selected][key]}"></label>`).join("")}</div>`;
    props.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => {
      const spec = fieldsFor(selected).find(([key]) => key === input.dataset.field);
      if (!spec) return;
      layout[selected][input.dataset.field] = clamp(input.value, spec[2], spec[3]);
      render();
    }));
  }

  function select(kind) {
    selected = kind;
    Object.entries(elements).forEach(([key, el]) => el.classList.toggle("selected", key === kind));
    document.querySelectorAll(".layer").forEach((button) => button.classList.toggle("active", button.dataset.select === kind));
    renderProps();
  }

  function beginGesture(event, kind, resize) {
    if (!layout || !layout[kind]) return;
    if (event.button !== 0) return;
    event.preventDefault();
    select(kind);
    const value = { ...layout[kind] };
    gesture = { kind, resize, startX: event.clientX, startY: event.clientY, value, pointerId: event.pointerId };
    elements[kind].setPointerCapture(event.pointerId);
  }

  function moveGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = (event.clientX - gesture.startX) / scale;
    const dy = (event.clientY - gesture.startY) / scale;
    const value = gesture.value;
    if (!gesture.resize) {
      layout[gesture.kind].x = Math.round(value.x + dx);
      layout[gesture.kind].y = Math.round(value.y + dy);
    } else if (gesture.kind === "circle") {
      layout.circle.size = clamp(value.size + Math.max(dx, dy), 160, 1400);
    } else if (gesture.kind === "banner") {
      layout.banner.width = clamp(value.width + dx, 160, 2160);
      layout.banner.height = clamp(value.height + dy, 60, 1080);
    } else {
      const ratio = Math.max(0.25, (value.width + dx) / value.width);
      layout.puzzle.width = clamp(value.width + dx, 160, 2160);
      layout.puzzle.labelSize = clamp(value.labelSize * ratio, 16, 120);
      layout.puzzle.puzzleSize = clamp(value.puzzleSize * ratio, 24, 180);
    }
    render();
  }

  function endGesture(event) {
    if (gesture && event.pointerId === gesture.pointerId) gesture = null;
  }

  Object.entries(elements).forEach(([kind, el]) => {
    el.addEventListener("pointerdown", (event) => beginGesture(event, kind, event.target.classList.contains("resize-handle")));
    el.addEventListener("pointermove", moveGesture);
    el.addEventListener("pointerup", endGesture);
    el.addEventListener("pointercancel", endGesture);
  });
  document.querySelectorAll(".layer").forEach((button) => button.addEventListener("click", () => select(button.dataset.select)));

  function fillSelect(select, values, withRandom = false) {
    const random = withRandom ? '<option value="__telegram__">Прямо из Telegram — без повторов</option><option value="__random__">Из скачанных — без повторов</option>' : "";
    select.innerHTML = random + values.map((value) => `<option value="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${value}</option>`).join("");
  }

  function updateMedia() {
    if (gameplaySelect.value) $("#gameplayVideo").src = mediaUrl("gameplay", gameplaySelect.value);
    const previewSource = sourceSelect.value === "__random__" || sourceSelect.value === "__telegram__"
      ? sourceFiles[Math.floor(Math.random() * sourceFiles.length)]
      : sourceSelect.value;
    if (previewSource) $("#circleVideo").src = mediaUrl("source", previewSource);
  }

  async function api(path, options) {
    const response = await fetch(`/api${path}`, { credentials: "include", ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
    return body;
  }

  async function save() {
    if (!layout) return setStatus("Редактор не загружен", "Обновите страницу после запуска backend.", "error");
    setStatus("Сохраняю", "Записываю раскладку в config.json…", "busy");
    const name = templateNameInput.value.trim();
    if (!name) throw new Error("Введите имя шаблона");
    await api("/circle-editor/layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout, name }) });
    setStatus("Шаблон сохранён", "Telegram-кружочки теперь видны в библиотеке источников Студии и используют эту раскладку.");
  }

  async function generate() {
    if (!layout) return setStatus("Редактор не загружен", "Обновите страницу после запуска backend.", "error");
    const button = $("#renderButton");
    button.disabled = true;
    $("#result").hidden = true;
    setStatus("Генерация видео", "FFmpeg собирает ролик. Обычно это занимает 1–3 минуты.", "busy");
    try {
      const result = await api("/circle-editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout, source: sourceSelect.value, gameplay: gameplaySelect.value }),
      });
      const url = `${result.url}?v=${Date.now()}`;
      $("#resultVideo").src = url;
      $("#resultLink").href = url;
      $("#result").hidden = false;
      setStatus("Видео готово", `${result.file} · кружок: ${result.sourceFile}`);
    } catch (error) {
      setStatus("Не удалось сгенерировать", error.message || String(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  sourceSelect.addEventListener("change", updateMedia);
  gameplaySelect.addEventListener("change", updateMedia);
  $("#saveButton").addEventListener("click", () => save().catch((error) => setStatus("Ошибка сохранения", error.message, "error")));
  $("#renderButton").addEventListener("click", generate);
  window.addEventListener("resize", fit);

  (async () => {
    try {
      const data = await api("/circle-editor");
      layout = data.layout;
      templateNameInput.value = data.template?.name || "Telegram-кружочки";
      sourceFiles = data.sources;
      fillSelect(sourceSelect, data.sources, true);
      fillSelect(gameplaySelect, data.gameplays);
      fit();
      render();
      select("puzzle");
      updateMedia();
      if (!data.gameplays.length) setStatus("Нет gameplay", "Добавьте хотя бы одно фоновое видео в tg circles/gameplay.", "error");
    } catch (error) {
      render();
      const message = error.message || String(error);
      setStatus(
        "Редактор недоступен",
        message.includes("Not Found") || message.includes("404")
          ? "Backend не подхватил API кружков. Перезапустите Shorts Factory и обновите страницу."
          : message,
        "error",
      );
    }
  })();
})();
