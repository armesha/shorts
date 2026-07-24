(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const scene = $("#scene");
  const viewport = $("#stageViewport");
  const shell = $("#sceneShell");
  const props = $("#props");
  const sourceSelect = $("#sourceSelect");
  const sourceUpload = $("#sourceUpload");
  const gameplaySelect = $("#gameplaySelect");
  const templateNameInput = $("#templateName");
  const templateSelect = $("#templateSelect");
  const advertiserSelect = $("#advertiserSelect");
  const bannerEnabledInput = $("#bannerEnabled");
  const elements = { puzzle: $("#puzzle"), circle: $("#circle"), banner: $("#banner") };
  let scale = 0.35;
  let selected = "puzzle";
  let sourceFiles = [];
  let templates = [];
  let activeTemplateId = "default";
  let advertisers = [];
  let activeAdvertiserId = "";
  let layout = {
    circle: { x: 130, y: 300, size: 820 },
    puzzle: { x: 90, y: 92, width: 900, labelSize: 30, puzzleSize: 68, gap: 14 },
    banner: { x: 90, y: 830, width: 900, height: 260, startSeconds: 0, repeatEverySeconds: 0 },
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
      ["startSeconds", "Первый показ, сек.", 0, 180], ["repeatEverySeconds", "Повтор через, сек.", 0, 180],
    ];
    return [
      ["x", "X", -1000, 2080], ["y", "Y", 0, 1800], ["width", "Ширина", 160, 2160],
      ["labelSize", "Подпись", 16, 120], ["puzzleSize", "Пример", 24, 180], ["gap", "Отступ", 0, 100],
    ];
  }

  function renderProps() {
    if (!layout) return;
    const names = { circle: "Кружок", puzzle: "Загадка", banner: "Баннер" };
    const timingHint = selected === "banner" ? '<div class="property-hint">Повтор 0 — баннер крутится непрерывно после первого показа.</div>' : "";
    props.innerHTML = `<div class="selection-name">${names[selected]}</div><div class="form-grid">${fieldsFor(selected).map(([key, label, min, max]) => `<label class="field"><span>${label}</span><input type="number" data-field="${key}" min="${min}" max="${max}" value="${layout[selected][key] ?? 0}"></label>`).join("")}</div>${timingHint}`;
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fillSelect(select, values, withRandom = false) {
    const random = withRandom ? '<option value="__telegram__">Прямо из Telegram — без повторов</option><option value="__random__">Из скачанных — без повторов</option>' : "";
    select.innerHTML = random + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  }

  const adFields = {
    name: $("#adName"),
    brand: $("#adBrand"),
    headline: $("#adHeadline"),
    subline: $("#adSubline"),
    cta: $("#adCta"),
    accentColor: $("#adAccent"),
    backgroundColor: $("#adBackground"),
    textColor: $("#adTextColor"),
  };

  function fillAdvertiserForm(advertiser) {
    const value = advertiser || {
      name: "", brand: "", headline: "", subline: "", cta: "",
      accentColor: "#ff2f78", backgroundColor: "#21151f", textColor: "#ffffff",
    };
    Object.entries(adFields).forEach(([key, input]) => { input.value = value[key] || ""; });
    $("#adLogo").value = "";
    $("#saveAdvertiserButton").textContent = advertiser?.legacy ? "Создать копию рекламодателя" : "Сохранить рекламодателя";
    $("#deleteAdvertiserButton").disabled = !advertiser || advertiser.legacy;
  }

  function renderTemplates(selectedId = activeTemplateId) {
    templateSelect.innerHTML = templates
      .map((item) => `<option value="${item.id}">${item.name}</option>`)
      .join("");
    activeTemplateId = templates.some((item) => item.id === selectedId) ? selectedId : (templates[0]?.id || "default");
    templateSelect.value = activeTemplateId;
    $("#deleteTemplateButton").disabled = templates.length <= 1;
  }

  function applyTemplateResponse(data) {
    templates = data.templates || templates;
    activeTemplateId = data.activeTemplateId || data.template?.id || activeTemplateId;
    if (data.layout) layout = data.layout;
    const current = data.template || templates.find((item) => item.id === activeTemplateId);
    if (current?.name) templateNameInput.value = current.name;
    if (data.advertisers) advertisers = data.advertisers;
    if (data.activeAdvertiserId) activeAdvertiserId = data.activeAdvertiserId;
    if (typeof data.bannerEnabled === "boolean") bannerEnabledInput.checked = data.bannerEnabled;
    renderTemplates(activeTemplateId);
    renderAdvertisers(activeAdvertiserId);
    render();
  }

  async function switchTemplate() {
    const data = await api("/circle-editor/templates/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: templateSelect.value }),
    });
    applyTemplateResponse(data);
    setStatus("Шаблон выбран", `Активен «${data.template.name}».`);
  }

  function renderAdvertisers(selectedId = activeAdvertiserId) {
    if (!advertisers.length) {
      advertiserSelect.innerHTML = '<option value="">Сначала загрузите баннер</option>';
      advertiserSelect.disabled = true;
      bannerEnabledInput.checked = false;
      bannerEnabledInput.disabled = true;
      activeAdvertiserId = "";
      updateBannerPreview();
      return;
    }
    advertiserSelect.innerHTML = advertisers
      .map((item) => `<option value="${item.id}">${item.name}</option>`)
      .join("");
    advertiserSelect.disabled = false;
    bannerEnabledInput.disabled = false;
    activeAdvertiserId = advertisers.some((item) => item.id === selectedId) ? selectedId : (advertisers[0]?.id || "");
    advertiserSelect.value = activeAdvertiserId;
    updateBannerPreview();
  }

  function updateBannerPreview() {
    const current = advertisers.find((item) => item.id === activeAdvertiserId);
    const image = $("#bannerImage");
    const video = $("#bannerVideo");
    if (!current) {
      video.pause();
      video.removeAttribute("src");
      video.hidden = true;
      image.hidden = true;
      elements.banner.style.display = "none";
      return;
    }
    if (current?.hasVideo) {
      image.hidden = true;
      video.hidden = false;
      video.src = `/api/circle-editor/banner-preview.webm?id=${encodeURIComponent(activeAdvertiserId)}&v=${Date.now()}`;
      video.load();
      video.play().catch(() => {});
    } else {
      video.pause();
      video.removeAttribute("src");
      video.hidden = true;
      image.hidden = false;
      image.src = `/api/circle-editor/banner-preview.png?id=${encodeURIComponent(activeAdvertiserId)}&v=${Date.now()}`;
    }
    elements.banner.style.display = bannerEnabledInput.checked ? "" : "none";
  }

  const fileDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve(undefined);
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать логотип"));
    reader.readAsDataURL(file);
  });

  async function saveAdvertiser() {
    const current = advertisers.find((item) => item.id === advertiserSelect.value);
    const button = $("#saveAdvertiserButton");
    button.disabled = true;
    setStatus("Создаю баннер", "Рендерю прозрачный рекламный ассет…", "busy");
    try {
      const logoDataUrl = await fileDataUrl($("#adLogo").files[0]);
      const body = Object.fromEntries(Object.entries(adFields).map(([key, input]) => [key, input.value]));
      if (current && !current.legacy) body.id = current.id;
      if (logoDataUrl) body.logoDataUrl = logoDataUrl;
      body.activate = true;
      const result = await api("/circle-editor/overlays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      advertisers = result.advertisers;
      activeAdvertiserId = result.activeAdvertiserId;
      bannerEnabledInput.checked = result.bannerEnabled;
      renderAdvertisers(activeAdvertiserId);
      setStatus("Рекламодатель сохранён", `${result.advertiser.name} выбран для следующих роликов.`);
    } finally {
      button.disabled = false;
    }
  }

  async function activateAdvertiser() {
    activeAdvertiserId = advertiserSelect.value;
    updateBannerPreview();
    await api("/circle-editor/overlays/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeAdvertiserId, enabled: bannerEnabledInput.checked }),
    });
  }

  async function deleteAdvertiser() {
    const current = advertisers.find((item) => item.id === advertiserSelect.value);
    if (!current || current.legacy) return;
    if (!window.confirm(`Удалить рекламодателя «${current.name}»?`)) return;
    const result = await api(`/circle-editor/overlays/${encodeURIComponent(current.id)}`, { method: "DELETE" });
    advertisers = result.advertisers;
    activeAdvertiserId = result.activeAdvertiserId;
    bannerEnabledInput.checked = result.bannerEnabled;
    renderAdvertisers(activeAdvertiserId);
    setStatus("Рекламодатель удалён", "Активным выбран доступный баннер.");
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

  async function uploadCircle(file) {
    if (!file) return;
    const allowed = ["mp4", "mov", "webm", "mkv", "m4v"];
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !allowed.includes(extension)) {
      throw new Error("Поддерживаются MP4, MOV, WebM, MKV и M4V.");
    }
    if (file.size > 500 * 1024 * 1024) {
      throw new Error("Файл кружка превышает лимит 500 МБ.");
    }

    setStatus("Загружаю кружок", `${file.name} · ${Math.max(1, Math.round(file.size / 1024 / 1024))} МБ`, "busy");
    const response = await fetch(`/api/circle-editor/sources/upload?filename=${encodeURIComponent(file.name)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
    sourceFiles = Array.isArray(body.sources) ? body.sources : sourceFiles;
    fillSelect(sourceSelect, sourceFiles, true);
    sourceSelect.value = body.source;
    updateMedia();
    setStatus("Кружок загружен", "Файл выбран и готов к генерации.");
  }

  async function save(createNew = false) {
    if (!layout) return setStatus("Редактор не загружен", "Обновите страницу после запуска backend.", "error");
    setStatus("Сохраняю", "Записываю раскладку в config.json…", "busy");
    const name = templateNameInput.value.trim();
    if (!name) throw new Error("Введите имя шаблона");
    const result = await api("/circle-editor/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layout,
        name,
        activeAdvertiserId,
        bannerEnabled: bannerEnabledInput.checked,
        templateId: activeTemplateId,
        createNew,
      }),
    });
    applyTemplateResponse(result);
    setStatus(
      createNew ? "Создан новый шаблон" : "Шаблон сохранён",
      `«${result.template.name}» доступен отдельным источником в Студии.`,
    );
  }

  async function deleteTemplate() {
    if (templates.length <= 1) return;
    const current = templates.find((item) => item.id === activeTemplateId);
    if (!current || !window.confirm(`Удалить шаблон «${current.name}»?`)) return;
    const data = await api(`/circle-editor/templates/${encodeURIComponent(current.id)}`, { method: "DELETE" });
    applyTemplateResponse(data);
    setStatus("Шаблон удалён", `Активен «${data.template.name}».`);
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
  sourceUpload.addEventListener("change", async () => {
    const file = sourceUpload.files?.[0];
    sourceUpload.value = "";
    try {
      await uploadCircle(file);
    } catch (error) {
      setStatus("Ошибка загрузки", error.message || String(error), "error");
    }
  });
  gameplaySelect.addEventListener("change", updateMedia);
  $("#saveButton").addEventListener("click", () => save(false).catch((error) => setStatus("Ошибка сохранения", error.message, "error")));
  $("#saveAsButton").addEventListener("click", () => save(true).catch((error) => setStatus("Ошибка создания", error.message, "error")));
  $("#deleteTemplateButton").addEventListener("click", () => deleteTemplate().catch((error) => setStatus("Ошибка удаления", error.message, "error")));
  templateSelect.addEventListener("change", () => switchTemplate().catch((error) => setStatus("Ошибка выбора шаблона", error.message, "error")));
  $("#renderButton").addEventListener("click", generate);
  $("#saveAdvertiserButton")?.addEventListener("click", () => saveAdvertiser().catch((error) => setStatus("Ошибка баннера", error.message, "error")));
  $("#deleteAdvertiserButton")?.addEventListener("click", () => deleteAdvertiser().catch((error) => setStatus("Ошибка удаления", error.message, "error")));
  $("#newAdvertiserButton")?.addEventListener("click", () => {
    advertiserSelect.value = "";
    fillAdvertiserForm(null);
    $("#adName").focus();
  });
  advertiserSelect.addEventListener("change", () => activateAdvertiser().catch((error) => setStatus("Ошибка выбора баннера", error.message, "error")));
  bannerEnabledInput.addEventListener("change", () => {
    updateBannerPreview();
    activateAdvertiser().catch((error) => setStatus("Ошибка выбора баннера", error.message, "error"));
  });
  window.addEventListener("resize", fit);

  (async () => {
    try {
      const data = await api("/circle-editor");
      layout = data.layout;
      templateNameInput.value = data.template?.name || "Telegram-кружочки";
      templates = data.templates || [];
      activeTemplateId = data.activeTemplateId || templates[0]?.id || "default";
      advertisers = data.advertisers || [];
      activeAdvertiserId = data.activeAdvertiserId || "";
      bannerEnabledInput.checked = data.bannerEnabled !== false;
      $("#manageBannersLink").hidden = !data.canManageBanners;
      renderAdvertisers(activeAdvertiserId);
      renderTemplates(activeTemplateId);
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
