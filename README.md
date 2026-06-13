# Shorts Factory

Автоматическая фабрика YouTube Shorts: по расписанию генерит контент → собирает картинку из
шаблона → 1080×1920 → видео 5–6с с музыкой → загружает на YouTube. Управление — веб-дашборд.
Полная архитектура и исследование: [`docs/STACK.md`](docs/STACK.md). ТЗ: `ТЗ.pdf`.

## 📁 Структура
```
server/                # Fastify API + БД (node:sqlite) + YouTube OAuth + планировщик
  config.ts            #   конфиг, путь к ключу Google (env/настройка/дефолт), fail-fast
  db.ts                #   аккаунты, история, настройки, YouTube-токены
  youtube.ts           #   OAuth (auth-url, callback) + videos.insert (загрузка)
  scheduler.ts         #   node-cron: автогенерация+загрузка по расписанию каналов
  index.ts             #   роуты
src/
  render.ts            # HTML→картинка (puppeteer-core + системный Chrome) + фоны-текстуры
  video.ts             # картинка(+аудио)→MP4 (ffmpeg-static)
  llm.ts               # генерация текста через Claude Code headless (для тем «N фактов»)
  anecdotes/           # генератор «Русские анекдоты» (без ИИ): build, library, render, pipeline
  scripts/             # утилиты: превью, e2e (Playwright), текстуры, замер заголовка
web/                   # Vite + React + Tailwind + DaisyUI (светлая тема) — дашборд
templates/             # HTML-шаблоны роликов (anecdote.html и др.)
assets/
  backgrounds/         # фоны-текстуры (kraft, parchment, marble, linen, concrete, newsprint)
  audio/anekdoty/      # музыка для анекдотов (зацикливается под длину)
data/                  # БД, паки анекдотов, сгенерированные файлы (gitignored)
Русские анекдоты/      # исходный файл анекдотов (НЕ трогаем, оригинал)
```

## 🚀 Запуск (Windows / macOS / Linux)
1. Установи **Node.js 22+** и **Google Chrome** (или Edge — детектится автоматически).
2. Склонируй и поставь зависимости (одна установка тянет и backend, и web):
   ```bash
   git clone https://github.com/armesha/shorts.git
   cd shorts
   npm install
   ```
3. Положи свой **Google client-secret** (`client_secret_*.json`) в **корень `shorts/`** —
   подхватится автоматически (или задай env `GOOGLE_CLIENT_SECRET_FILE`). Без него сервер не стартует (fail-fast).
4. Запусти — **одна команда** (работает в `cmd`, PowerShell и bash):
   ```bash
   npm start
   ```
   → открой **http://localhost:5173** (API на :8080)

Кроссплатформенно: Chrome ищется по ОС (Win `Program Files`, macOS `/Applications`, Linux
`/usr/bin`), Vite слушает IPv4+IPv6, API-прокси на `127.0.0.1`. Контент (анекдоты RU/DE/FR/IT,
текстуры, музыка) уже в репозитории; БД создаётся пустой; личные данные (ключ, БД, токены) **не коммитятся**.

**Как постится:** библиотека канала = очередь. Планировщик выкладывает каждый ролик **ровно один раз**
по расписанию и убирает его (без повторов). Кончились ролики → ничего не постится — нагенери ещё в «Студии».

Прочее:
```bash
npm test                               # юнит-тесты
node --import tsx src/scripts/e2e.ts   # e2e сайта (Playwright)
```

## 🔒 Безопасность
Файл Google client-secret **никогда не читается агентом** (deny-правило в `.claude/settings.json`,
git-ignored). Путь меняется в «Настройках» или env `GOOGLE_CLIENT_SECRET_FILE`.

## ✅ Статус
Готово: дашборд (каналы/студия/история/настройки), генератор анекдотов (1 пак озаглавлен,
100 готовых), рендер+видео+музыка, OAuth-подключение канала, планировщик. Дальше: озаглавить
остальные паки, реальные роялти-фри треки, точные AI-текстуры (drop в `assets/backgrounds/`).
