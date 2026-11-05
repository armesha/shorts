#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const TMP_ROOT = join(REPO_ROOT, 'tmp', 'shortrobot-tutorials');
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const TRANSITION_SECONDS = 0.42;

function fail(message) {
  console.error(`render-shortrobot-tutorials: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail(`unknown argument: ${token}`);
    const key = token.slice(2);
    if (!['spec', 'audio', 'output'].includes(key)) fail(`unknown option: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`${token} requires a value`);
    result[key] = value;
    index += 1;
  }
  for (const key of ['spec', 'audio', 'output']) {
    if (!result[key]) fail(`missing required option --${key}`);
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : '';
    fail(`${command} exited with code ${result.status}${detail}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

function commandPath(names) {
  for (const name of names) {
    const result = spawnSync('sh', ['-c', `command -v "$1"`, 'sh', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  fail(`required executable not found: ${names.join(' or ')}`);
}

function escaped(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function clampText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value) : fallback;
}

function normalizeStep(step) {
  if (typeof step === 'string') return { title: step, text: '' };
  if (step && typeof step === 'object') {
    return {
      title: String(step.title || step.text || ''),
      text: String(step.text || ''),
    };
  }
  return { title: '', text: '' };
}

function validateSpec(raw) {
  const requiredStrings = ['id', 'platform', 'title', 'hook', 'voice_text', 'outro', 'visual_style', 'transition', 'sample_url'];
  for (const key of requiredStrings) {
    if (typeof raw[key] !== 'string' || !raw[key].trim()) fail(`spec.${key} must be a non-empty string`);
  }
  if (!Array.isArray(raw.steps) || raw.steps.length < 3) fail('spec.steps must contain at least three steps');
  if (!raw.palette || typeof raw.palette !== 'object') fail('spec.palette must be an object');
  const id = raw.id.trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) fail('spec.id may contain only letters, numbers, hyphens, and underscores');
  return {
    ...raw,
    id,
    palette: {
      bg: safeHex(raw.palette.bg, '#10131A'),
      accent: safeHex(raw.palette.accent, '#56B8FF'),
      panel: safeHex(raw.palette.panel, '#202633'),
      text: safeHex(raw.palette.text, '#F8FAFF'),
    },
    steps: raw.steps.slice(0, 3).map(normalizeStep),
  };
}

function styleMode(spec) {
  const hint = `${spec.id} ${spec.visual_style}`.toLowerCase();
  if (hint.includes('монохром') || hint.includes('mono')) return 'mono';
  if (hint.includes('tech') || hint.includes('тех')) return 'tech';
  if (hint.includes('cinematic') || hint.includes('кино')) return 'cinema';
  if (hint.includes('журнал') || hint.includes('editorial')) return 'editorial';
  if (hint.includes('поп') || hint.includes('коллаж') || hint.includes('энергич')) return 'pop';
  if (hint.includes('lifestyle') || hint.includes('тёпл') || hint.includes('тепл')) return 'warm';
  if (hint.includes('social') || hint.includes('дружелюб')) return 'social';
  if (hint.includes('premium') || hint.includes('золот')) return 'premium';
  return 'minimal';
}

function transitionName(spec) {
  const hint = spec.transition.toLowerCase();
  if (hint.includes('hard-cut') || hint.includes('snap-cut')) return 'fadefast';
  if (hint.includes('swipe') || hint.includes('сдвиг') || hint.includes('перелист')) return 'slideleft';
  if (hint.includes('wipe') || hint.includes('scan-line')) return 'wipeleft';
  if (hint.includes('morph') || hint.includes('match')) return 'smoothleft';
  return 'fade';
}

function titleSize(text) {
  const length = String(text).length;
  if (length > 56) return 56;
  if (length > 42) return 62;
  return 70;
}

function sceneDefinitions(spec) {
  const [first, second, third] = spec.steps;
  const automaticShort = ['YouTube Shorts', 'TikTok', 'Instagram Reels'].includes(spec.platform);
  return [
    {
      eyebrow: spec.platform,
      title: 'Откройте @shortrobot',
      detail: spec.hook,
      kind: 'open',
    },
    {
      eyebrow: 'Шаг 1 · ссылка',
      title: 'Отправьте ссылку',
      detail: `${first.text || first.title} ${second.text || second.title}`.trim(),
      kind: 'send',
    },
    automaticShort
      ? {
          eyebrow: 'Шаг 2 · автоматически',
          title: 'Бот начнёт сам',
          detail: third.text || third.title,
          kind: 'auto',
        }
      : {
          eyebrow: 'Шаг 2 · формат',
          title: 'Выберите вариант',
          detail: third.text || third.title,
          kind: 'format',
        },
    {
      eyebrow: 'Шаг 3 · обработка',
      title: 'Дождитесь обработки',
      detail: 'Один статус покажет, что происходит. Чат можно не закрывать.',
      kind: 'wait',
    },
    {
      eyebrow: 'Готово',
      title: 'Получите видео',
      detail: spec.outro,
      kind: 'done',
    },
  ];
}

function icon(kind) {
  const icons = {
    open: '<span class="bot-face"><i></i><i></i><b></b></span>',
    send: '<span class="link-icon">↗</span>',
    format: '<span class="format-icon"><b>MP4</b><i>1080p</i></span>',
    wait: '<span class="spinner-icon"></span>',
    done: '<span class="play-icon">▶</span>',
  };
  return icons[kind];
}

function phoneContent(scene, spec) {
  const url = clampText(spec.sample_url.replace(/^https?:\/\//, ''), 45);
  if (scene.kind === 'open') {
    return `<div class="profile-mark">${icon('open')}</div>
      <div class="profile-name">@shortrobot</div>
      <div class="profile-note">Видео по ссылке — прямо в Telegram</div>
      <div class="action-button">ОТКРЫТЬ БОТА <span>→</span></div>`;
  }
  if (scene.kind === 'send') {
    return `<div class="chat-label">@shortrobot</div>
      <div class="message incoming">Пришлите ссылку на видео</div>
      <div class="message outgoing"><span>${escaped(url)}</span></div>
      <div class="sent-mark">Отправлено ✓✓</div>`;
  }
  if (scene.kind === 'format') {
    return `<div class="chat-label">@shortrobot</div>
      <div class="message incoming wide">Выберите доступный формат</div>
      <div class="choice selected"><b>MP4 · видео</b><span>лучшее качество</span></div>
      <div class="choice"><b>MP3 · аудио</b><span>только звук</span></div>`;
  }
  if (scene.kind === 'auto') {
    return `<div class="chat-label">@shortrobot</div>
      <div class="message incoming wide">Короткое видео найдено</div>
      <div class="status-card"><span class="auto-mark">✓</span><b>Загрузка началась сама</b><span>Ничего выбирать не нужно</span></div>`;
  }
  if (scene.kind === 'wait') {
    return `<div class="chat-label">@shortrobot</div>
      <div class="status-card">${icon('wait')}<b>Обрабатываем видео</b><span>Один статус обновляется сам</span>
      <div class="progress"><i></i></div><small>Почти готово</small></div>`;
  }
  return `<div class="chat-label">@shortrobot</div>
    <div class="video-card"><div class="video-art">${icon('done')}</div><b>Видео готово</b><span>MP4 · в этом же чате</span></div>
    <div class="action-button compact">СОХРАНИТЬ <span>↓</span></div>`;
}

function backgroundDecor(mode) {
  if (mode === 'tech') return '<div class="tech-grid"></div><div class="data-line one"></div><div class="data-line two"></div>';
  if (mode === 'cinema') return '<div class="cinema-bar top"></div><div class="cinema-bar bottom"></div><div class="film-grain"></div>';
  if (mode === 'editorial') return '<div class="editorial-rule"></div><div class="edition">SHORTROBOT<br>GUIDE / 2026</div>';
  if (mode === 'pop') return '<div class="pop-block a"></div><div class="pop-block b"></div><div class="pop-dot">•••••</div>';
  if (mode === 'warm') return '<div class="table-line"></div><div class="coffee"><i></i></div><div class="paper-slip"></div>';
  if (mode === 'social') return '<div class="social-bubble b1">♥</div><div class="social-bubble b2">↗</div><div class="social-bubble b3">●</div>';
  if (mode === 'premium') return '<div class="premium-ring r1"></div><div class="premium-ring r2"></div><div class="premium-glint"></div>';
  if (mode === 'mono') return '<div class="mono-grid"></div><div class="mono-tag">HOW TO / 05</div>';
  return '<div class="minimal-circle c1"></div><div class="minimal-circle c2"></div>';
}

function renderHtml(spec, scene, sceneIndex) {
  const mode = styleMode(spec);
  const colors = spec.palette;
  const title = escaped(clampText(scene.title, 68));
  const detail = escaped(clampText(scene.detail, 150));
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}body{font-family:"DejaVu Sans",Arial,sans-serif;background:${colors.bg};color:${colors.text}}
.page{position:relative;width:1080px;height:1920px;overflow:hidden;background:${colors.bg};isolation:isolate}.decor{position:absolute;inset:0;overflow:hidden;z-index:-1}.safe{position:absolute;left:68px;top:72px;width:852px;height:1378px}.header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid color-mix(in srgb,${colors.text} 22%,transparent);padding:0 0 24px}.brand{font-size:26px;font-weight:900;letter-spacing:.5px}.brand b{color:${colors.accent}}.counter{font-size:22px;font-weight:800;letter-spacing:3px;opacity:.72}.eyebrow{margin-top:40px;color:${colors.accent};font-size:22px;font-weight:900;letter-spacing:2.6px;text-transform:uppercase}.title{font-size:${titleSize(scene.title)}px;line-height:1.02;letter-spacing:-2.7px;font-weight:950;max-width:840px;margin:16px 0 14px;text-wrap:balance}.detail{font-size:31px;line-height:1.24;font-weight:600;max-width:790px;opacity:.82;margin:0}.stage{position:absolute;left:70px;top:405px;width:770px;height:905px;display:grid;place-items:center}.phone-shadow{position:absolute;width:625px;height:842px;background:${colors.accent};opacity:.18;transform:translate(24px,28px) rotate(2deg);border-radius:62px}.phone{position:relative;width:620px;height:840px;border:7px solid ${colors.text};border-radius:58px;background:${colors.panel};box-shadow:0 32px 74px rgba(0,0,0,.18);padding:84px 42px 38px;color:${colors.text};overflow:hidden}.phone:before{content:"";position:absolute;top:22px;left:213px;width:180px;height:28px;border-radius:30px;background:${colors.text};opacity:.94}.phone:after{content:"";position:absolute;top:33px;left:238px;width:76px;height:7px;border-radius:10px;background:${colors.panel};opacity:.42}.phone-inner{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}.chat-label{position:absolute;left:0;right:0;top:66px;text-align:center;font-size:24px;font-weight:900;padding:22px;border-bottom:2px solid color-mix(in srgb,${colors.text} 13%,transparent)}
.profile-mark{width:190px;height:190px;border-radius:50%;display:grid;place-items:center;background:${colors.accent};color:${colors.bg};box-shadow:0 18px 46px color-mix(in srgb,${colors.accent} 35%,transparent)}.profile-name{font-size:42px;font-weight:950;margin-top:34px}.profile-note{font-size:25px;line-height:1.3;text-align:center;opacity:.68;max-width:430px;margin:12px 0 44px}.action-button{display:flex;justify-content:space-between;align-items:center;width:440px;border-radius:18px;padding:22px 26px;background:${colors.accent};color:${colors.bg};font-size:23px;font-weight:950;letter-spacing:.8px}.action-button.compact{margin-top:28px}.action-button span{font-size:35px;line-height:.8}.bot-face{position:relative;width:112px;height:96px;border:8px solid currentColor;border-radius:28px;display:block}.bot-face:before{content:"";position:absolute;width:8px;height:28px;left:44px;top:-35px;background:currentColor}.bot-face:after{content:"";position:absolute;width:24px;height:24px;left:36px;top:-48px;border-radius:50%;background:currentColor}.bot-face i{position:absolute;top:30px;width:14px;height:14px;background:currentColor;border-radius:50%}.bot-face i:first-child{left:22px}.bot-face i:nth-child(2){right:22px}.bot-face b{position:absolute;left:28px;bottom:19px;width:40px;height:8px;border-radius:10px;background:currentColor}
.message{align-self:flex-start;max-width:440px;padding:20px 24px;border-radius:24px;font-size:24px;line-height:1.28;font-weight:700;margin:13px 0;background:color-mix(in srgb,${colors.text} 9%,${colors.panel})}.message.outgoing{align-self:flex-end;background:${colors.accent};color:${colors.bg};word-break:break-word}.message.wide{align-self:stretch;max-width:none;text-align:center}.sent-mark{align-self:flex-end;font-size:17px;opacity:.56;margin-top:0}.choice{align-self:stretch;margin-top:18px;border:3px solid color-mix(in srgb,${colors.text} 18%,transparent);border-radius:20px;padding:20px 24px;display:flex;flex-direction:column;gap:5px}.choice.selected{border-color:${colors.accent};box-shadow:inset 8px 0 0 ${colors.accent}}.choice b{font-size:27px}.choice span{font-size:20px;opacity:.62}.status-card,.video-card{align-self:stretch;text-align:center;border:3px solid color-mix(in srgb,${colors.text} 17%,transparent);border-radius:30px;padding:42px 34px;background:color-mix(in srgb,${colors.panel} 88%,${colors.accent})}.status-card b,.video-card>b{display:block;font-size:32px;margin-top:24px}.status-card>span,.video-card>span{display:block;font-size:22px;opacity:.66;margin-top:9px}.status-card small{display:block;text-align:left;margin-top:12px;font-size:18px;font-weight:800;opacity:.62}.progress{height:16px;border-radius:20px;background:color-mix(in srgb,${colors.text} 10%,transparent);overflow:hidden;margin-top:34px}.progress i{display:block;width:72%;height:100%;background:${colors.accent};border-radius:20px}.spinner-icon{display:block;width:86px;height:86px;margin:0 auto;border-radius:50%;border:10px solid color-mix(in srgb,${colors.text} 13%,transparent);border-top-color:${colors.accent};transform:rotate(36deg)}.video-art{height:285px;border-radius:22px;display:grid;place-items:center;background:${colors.accent};color:${colors.bg}}.play-icon{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;border:7px solid currentColor;font-size:42px;padding-left:7px}.link-icon{font-size:110px;font-weight:300}.format-icon{display:flex;flex-direction:column;align-items:center;gap:5px}.format-icon b{font-size:30px}.format-icon i{font-style:normal;font-size:19px;opacity:.7}.auto-mark{display:grid!important;place-items:center;width:92px;height:92px;margin:0 auto!important;border-radius:50%;background:${colors.accent};color:${colors.bg};font-size:52px!important;font-weight:950;opacity:1!important}
.rail{position:absolute;right:-2px;top:435px;width:18px;height:700px;border-radius:20px;background:color-mix(in srgb,${colors.text} 10%,transparent)}.rail i{display:block;width:18px;height:${(sceneIndex + 1) * 140}px;max-height:700px;border-radius:20px;background:${colors.accent}}.footer{position:absolute;left:2px;bottom:0;width:828px;display:flex;align-items:center;gap:14px}.footer .line{height:8px;flex:1;border-radius:8px;background:color-mix(in srgb,${colors.text} 12%,transparent);overflow:hidden}.footer .line i{display:block;width:${(sceneIndex + 1) * 20}%;height:100%;background:${colors.accent}}.footer span{font-size:20px;font-weight:900;letter-spacing:1px;opacity:.62}.bottom-zone{position:absolute;left:0;right:0;top:1520px;height:400px;border-top:2px solid color-mix(in srgb,${colors.text} 7%,transparent);opacity:.34}
.minimal-circle{position:absolute;border-radius:50%;border:3px solid ${colors.accent};opacity:.18}.minimal-circle.c1{width:520px;height:520px;right:-230px;top:130px}.minimal-circle.c2{width:320px;height:320px;left:-190px;bottom:210px}
.mono-grid,.tech-grid{position:absolute;inset:0;background-size:74px 74px;background-image:linear-gradient(to right,color-mix(in srgb,${colors.text} 7%,transparent) 1px,transparent 1px),linear-gradient(to bottom,color-mix(in srgb,${colors.text} 7%,transparent) 1px,transparent 1px)}.mono-tag{position:absolute;right:62px;top:75px;border:2px solid ${colors.text};padding:10px;font:700 18px monospace}.data-line{position:absolute;height:2px;background:${colors.accent};opacity:.34;transform-origin:left}.data-line.one{width:730px;left:520px;top:280px;transform:rotate(62deg)}.data-line.two{width:560px;left:-100px;top:1250px;transform:rotate(-38deg)}
.cinema-bar{position:absolute;left:0;right:0;height:72px;background:#000;opacity:.82}.cinema-bar.top{top:0}.cinema-bar.bottom{bottom:0}.film-grain{position:absolute;inset:0;opacity:.12;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E")}
.editorial-rule{position:absolute;left:37px;top:0;width:10px;height:1520px;background:${colors.accent}}.edition{position:absolute;right:170px;top:92px;text-align:right;font:700 17px/1.35 monospace;letter-spacing:2px;opacity:.5}.pop-block{position:absolute;border:4px solid ${colors.text};background:${colors.accent};opacity:.22}.pop-block.a{width:410px;height:410px;right:-180px;top:120px;transform:rotate(17deg)}.pop-block.b{width:310px;height:190px;left:-130px;bottom:260px;transform:rotate(-12deg)}.pop-dot{position:absolute;right:47px;bottom:480px;color:${colors.accent};font-size:52px;letter-spacing:10px;transform:rotate(90deg)}
.table-line{position:absolute;left:-120px;right:-120px;top:1120px;height:16px;background:${colors.accent};opacity:.18;transform:rotate(-7deg)}.coffee{position:absolute;width:300px;height:300px;border:34px solid color-mix(in srgb,${colors.text} 14%,transparent);border-radius:50%;right:-105px;top:1050px}.coffee i{position:absolute;width:100px;height:130px;border:30px solid color-mix(in srgb,${colors.text} 14%,transparent);right:-99px;top:47px;border-radius:55px}.paper-slip{position:absolute;width:430px;height:580px;background:${colors.panel};opacity:.28;left:-240px;top:1260px;transform:rotate(12deg);box-shadow:0 22px 60px rgba(0,0,0,.16)}
.social-bubble{position:absolute;display:grid;place-items:center;border-radius:50%;background:${colors.panel};color:${colors.accent};box-shadow:0 16px 42px rgba(0,0,0,.12);font-size:42px;font-weight:900}.social-bubble.b1{width:138px;height:138px;right:-20px;top:260px}.social-bubble.b2{width:105px;height:105px;left:-24px;top:980px}.social-bubble.b3{width:76px;height:76px;right:42px;top:1250px}.premium-ring{position:absolute;border:2px solid ${colors.accent};border-radius:50%;opacity:.22}.premium-ring.r1{width:860px;height:860px;right:-430px;top:-220px}.premium-ring.r2{width:600px;height:600px;left:-390px;top:990px}.premium-glint{position:absolute;width:12px;height:860px;left:820px;top:40px;background:${colors.accent};opacity:.16;transform:rotate(32deg)}
body.mode-pop .phone{color:#10131A;border-radius:18px;transform:rotate(-1deg);box-shadow:24px 24px 0 color-mix(in srgb,${colors.accent} 64%,transparent)}body.mode-pop .phone-shadow{border-radius:18px;transform:translate(-18px,-14px) rotate(4deg);opacity:.28}body.mode-editorial .title{font-family:Georgia,"DejaVu Serif",serif;font-weight:700;letter-spacing:-2px}body.mode-editorial .phone{border-width:3px;border-radius:4px;box-shadow:15px 15px 0 color-mix(in srgb,${colors.text} 12%,transparent)}body.mode-mono .phone{border-radius:4px;box-shadow:16px 16px 0 ${colors.text}}body.mode-mono .phone-shadow{display:none}body.mode-mono .mono-tag{display:none}body.mode-tech .phone{border-width:3px;border-radius:22px;box-shadow:0 0 0 2px ${colors.accent},0 26px 70px rgba(0,0,0,.3)}body.mode-cinema .phone{border-color:color-mix(in srgb,${colors.accent} 60%,${colors.text});box-shadow:0 30px 95px color-mix(in srgb,${colors.accent} 20%,#000)}body.mode-warm .phone{transform:rotate(1.5deg);box-shadow:0 38px 90px rgba(76,45,32,.24)}body.mode-social .phone{border-radius:76px}body.mode-premium .phone{border-width:3px;border-color:${colors.accent};box-shadow:0 30px 100px color-mix(in srgb,${colors.accent} 16%,#000)}
</style></head><body class="mode-${mode}"><main class="page"><div class="decor">${backgroundDecor(mode)}</div><section class="safe">
<header class="header"><div class="brand"><b>@</b>shortrobot</div><div class="counter">${String(sceneIndex + 1).padStart(2, '0')} / 05</div></header>
<div class="eyebrow">${escaped(scene.eyebrow)}</div><h1 class="title">${title}</h1><p class="detail">${detail}</p>
<div class="stage"><div class="phone-shadow"></div><div class="phone"><div class="phone-inner">${phoneContent(scene, spec)}</div></div></div>
<div class="rail"><i></i></div><div class="footer"><div class="line"><i></i></div><span>${escaped(clampText(spec.title, 46))}</span></div>
</section><div class="bottom-zone"></div></main></body></html>`;
}

function durationOfAudio(ffprobe, audioPath) {
  const output = run(ffprobe, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_type:format=duration',
    '-of', 'json',
    audioPath,
  ], { capture: true });
  let metadata;
  try {
    metadata = JSON.parse(output);
  } catch {
    fail('ffprobe returned invalid metadata for audio');
  }
  if (!metadata.streams?.some((stream) => stream.codec_type === 'audio')) fail('audio file has no audio stream');
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) fail('audio duration is unavailable or invalid');
  return duration;
}

function verifyFrame(ffprobe, framePath) {
  const dimensions = run(ffprobe, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', framePath,
  ], { capture: true });
  if (dimensions !== `${WIDTH}x${HEIGHT}`) fail(`Chrome rendered ${dimensions}, expected ${WIDTH}x${HEIGHT}`);
}

function verifyOutput(ffprobe, outputPath) {
  const raw = run(ffprobe, [
    '-v', 'error', '-show_entries',
    'stream=index,codec_type,codec_name,width,height,pix_fmt:format=duration',
    '-of', 'json', outputPath,
  ], { capture: true });
  const data = JSON.parse(raw);
  const video = data.streams?.find((stream) => stream.codec_type === 'video');
  const audio = data.streams?.find((stream) => stream.codec_type === 'audio');
  if (!video || video.codec_name !== 'h264' || video.width !== WIDTH || video.height !== HEIGHT || video.pix_fmt !== 'yuv420p') {
    fail('output verification failed: expected 1080x1920 H.264 yuv420p video');
  }
  if (!audio) fail('output verification failed: audio stream is missing');
  return Number(data.format?.duration || 0);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const specPath = resolve(args.spec);
  const audioPath = resolve(args.audio);
  const outputPath = isAbsolute(args.output) ? args.output : resolve(args.output);
  if (extname(outputPath).toLowerCase() !== '.mp4') fail('--output must end in .mp4');

  let spec;
  try {
    spec = validateSpec(JSON.parse(readFileSync(specPath, 'utf8')));
  } catch (error) {
    fail(`cannot read spec: ${error.message}`);
  }

  const chrome = commandPath(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']);
  const ffmpeg = commandPath(['ffmpeg']);
  const ffprobe = commandPath(['ffprobe']);
  const audioDuration = durationOfAudio(ffprobe, audioPath);
  const totalDuration = Math.max(14, audioDuration + 0.45);
  const scenes = sceneDefinitions(spec);
  const sceneDuration = (totalDuration + TRANSITION_SECONDS * (scenes.length - 1)) / scenes.length;

  mkdirSync(TMP_ROOT, { recursive: true });
  mkdirSync(dirname(outputPath), { recursive: true });
  const runDir = mkdtempSync(join(TMP_ROOT, `.render-${spec.id}-`));
  const frames = [];

  try {
    scenes.forEach((scene, index) => {
      const htmlPath = join(runDir, `scene-${index + 1}.html`);
      const framePath = join(runDir, `scene-${index + 1}.png`);
      writeFileSync(htmlPath, renderHtml(spec, scene, index), 'utf8');
      run(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--no-first-run',
        '--no-default-browser-check',
        '--metrics-recording-only',
        '--force-device-scale-factor=1',
        `--window-size=${WIDTH},${HEIGHT}`,
        `--user-data-dir=${join(runDir, `chrome-${index + 1}`)}`,
        `--screenshot=${framePath}`,
        pathToFileURL(htmlPath).href,
      ]);
      verifyFrame(ffprobe, framePath);
      frames.push(framePath);
    });

    const ffmpegArgs = ['-hide_banner', '-loglevel', 'warning', '-y'];
    for (const frame of frames) {
      ffmpegArgs.push('-loop', '1', '-framerate', String(FPS), '-t', sceneDuration.toFixed(3), '-i', frame);
    }
    ffmpegArgs.push('-i', audioPath);

    const filters = frames.map((_, index) => {
      const phase = (index * 1.17).toFixed(2);
      return `[${index}:v]scale=1120:1992,crop=${WIDTH}:${HEIGHT}:x='(iw-ow)/2+sin(t*0.72+${phase})*7':y='(ih-oh)/2+cos(t*0.58+${phase})*7',fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[v${index}]`;
    });
    let previous = 'v0';
    const transition = transitionName(spec);
    for (let index = 1; index < frames.length; index += 1) {
      const output = `x${index}`;
      const offset = index * (sceneDuration - TRANSITION_SECONDS);
      filters.push(`[${previous}][v${index}]xfade=transition=${transition}:duration=${TRANSITION_SECONDS}:offset=${offset.toFixed(3)}[${output}]`);
      previous = output;
    }
    filters.push(`[${frames.length}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=async=1:first_pts=0,apad=whole_dur=${totalDuration.toFixed(3)}[a]`);

    ffmpegArgs.push(
      '-filter_complex', filters.join(';'),
      '-map', `[${previous}]`, '-map', '[a]',
      '-t', totalDuration.toFixed(3),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
      '-r', String(FPS), '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      outputPath,
    );
    run(ffmpeg, ffmpegArgs);
    const verifiedDuration = verifyOutput(ffprobe, outputPath);
    console.log(JSON.stringify({
      output: outputPath,
      id: spec.id,
      scenes: scenes.length,
      duration_seconds: Number(verifiedDuration.toFixed(3)),
      video: `${WIDTH}x${HEIGHT} H.264 yuv420p`,
      audio: 'AAC stereo 48 kHz',
      style: styleMode(spec),
    }, null, 2));
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}

main();
