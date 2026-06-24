#!/usr/bin/env node
// Adds the second wave of "sticky" optical-illusion types to the localized
// illusions pack. Each output HTML remains a normal skeleton-v2 self-contained
// illusion file; this script only avoids hand-copying the host 26 times.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ILL_DIR = resolve(HERE, 'illusions');
const SKELETON = resolve(HERE, 'skeleton-v2.html');
const LOCALIZE = resolve(HERE, 'localize.json');

const SPEC_RE = /let SPEC = \{[\s\S]*?\n  \};/;
const DRAW_RE = /function drawIllusion\(ctx, p, CW, CH, H\) \{[\s\S]*?\n  \}\n  \/\/ =+/;

const js = (value) => JSON.stringify(value);
const indent = (src, spaces = 4) => src.trim().split('\n').map((line) => `${' '.repeat(spaces)}${line}`).join('\n');

const items = [
  {
    id: 'moirepulse',
    name: 'Moiré pulse',
    title: 'The rings are not breathing',
    light: false,
    translations: {
      en: 'The rings are not breathing',
      de: 'Die Ringe atmen nicht wirklich',
      it: 'Gli anelli non respirano davvero',
      es: 'Los anillos no están respirando',
      ru: 'Кольца на самом деле не дышат',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#02030a';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
ctx.globalCompositeOperation = 'screen';
const t = p - Math.floor(p);
const centers = [
  [cx, cy, 'rgba(255,255,255,0.78)', 0],
  [cx + 30 * Math.cos(t * TAU * 2), cy + 24 * Math.sin(t * TAU * 2), 'rgba(70,210,255,0.62)', 9],
  [cx - 22 * Math.sin(t * TAU * 2), cy + 18 * Math.cos(t * TAU * 2), 'rgba(255,80,180,0.44)', 15],
];
for (const [x, y, color, phase] of centers) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  for (let r = 20 + phase; r < 610; r += 18) {
    const rr = r + 3 * Math.sin(t * TAU * 3 + r * 0.035);
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.stroke();
  }
}
ctx.globalCompositeOperation = 'source-over';
const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 520);
g.addColorStop(0, 'rgba(255,255,255,0)');
g.addColorStop(0.72, 'rgba(0,0,0,0.08)');
g.addColorStop(1, 'rgba(0,0,0,0.92)');
ctx.fillStyle = g;
ctx.fillRect(cx - 560, cy - 560, 1120, 1120);
ctx.restore();
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(cx, cy, 7, 0, TAU);
ctx.fill();
void H;`,
  },
  {
    id: 'hypnotunnel',
    name: 'Hypnotic tunnel',
    title: 'The tunnel is only flat lines',
    light: false,
    translations: {
      en: 'The tunnel is only flat lines',
      de: 'Der Tunnel besteht nur aus flachen Linien',
      it: 'Il tunnel è fatto solo di linee piatte',
      es: 'El túnel son solo líneas planas',
      ru: 'Тоннель нарисован плоскими линиями',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#05020a';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(Math.sin(p * TAU) * 0.08);
const rings = 38;
for (let i = rings; i >= 0; i--) {
  const u = (i + p * 2) / rings;
  const q = u - Math.floor(u);
  const s = 34 + q * q * 780;
  const alpha = 1 - q * 0.86;
  ctx.save();
  ctx.rotate((i % 2 ? 1 : -1) * 0.785 + p * TAU * 0.08);
  ctx.strokeStyle = i % 2 ? 'rgba(70,220,255,' + alpha + ')' : 'rgba(255,80,190,' + alpha + ')';
  ctx.lineWidth = H.lerp(12, 2, q);
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.restore();
}
for (let a = 0; a < 8; a++) {
  ctx.rotate(TAU / 8);
  const grad = ctx.createLinearGradient(0, 0, 0, 620);
  grad.addColorStop(0, 'rgba(255,255,255,0.72)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 620);
  ctx.stroke();
}
ctx.restore();`,
  },
  {
    id: 'wavegrid',
    name: 'Liquid wave grid',
    title: 'The grid is trying to stay straight',
    light: true,
    translations: {
      en: 'The grid is trying to stay straight',
      de: 'Das Gitter versucht gerade zu bleiben',
      it: 'La griglia cerca di restare dritta',
      es: 'La cuadrícula intenta seguir recta',
      ru: 'Сетка пытается оставаться прямой',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#f3f0e8';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
ctx.translate(cx, cy);
ctx.lineCap = 'round';
for (let pass = 0; pass < 2; pass++) {
  ctx.strokeStyle = pass === 0 ? 'rgba(8,18,32,0.86)' : 'rgba(220,42,92,0.56)';
  ctx.lineWidth = pass === 0 ? 3 : 2;
  const phase = p * TAU * (pass === 0 ? 1 : -1);
  for (let y = -500; y <= 500; y += 42) {
    ctx.beginPath();
    for (let x = -500; x <= 500; x += 18) {
      const yy = y + 22 * Math.sin(x * 0.018 + phase + y * 0.01);
      if (x === -500) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (let x = -480; x <= 480; x += 42) {
    ctx.beginPath();
    for (let y = -500; y <= 500; y += 18) {
      const xx = x + 18 * Math.sin(y * 0.019 - phase + x * 0.012);
      if (y === -500) ctx.moveTo(xx, y);
      else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
}
ctx.restore();
ctx.fillStyle = '#101820';
ctx.beginPath();
ctx.arc(cx, cy, 7, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'kineticdots',
    name: 'Kinetic depth dots',
    title: 'Flat dots turn into a sphere',
    light: false,
    translations: {
      en: 'Flat dots turn into a sphere',
      de: 'Flache Punkte werden zu einer Kugel',
      it: 'Punti piatti diventano una sfera',
      es: 'Puntos planos se vuelven una esfera',
      ru: 'Плоские точки превращаются в шар',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#03050d';
ctx.fillRect(0, 0, CW, CH);
const yaw = p * TAU;
const pitch = 0.42 * Math.sin(p * TAU);
const pts = [];
for (let lat = -6; lat <= 6; lat++) {
  const v = lat / 6;
  const r = Math.sqrt(Math.max(0, 1 - v * v));
  const count = Math.max(10, Math.round(22 * r));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + lat * 0.23;
    let x = Math.cos(a) * r;
    let y = v;
    let z = Math.sin(a) * r;
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    pts.push({ x: x1, y: y1, z: z2 });
  }
}
pts.sort((a, b) => a.z - b.z);
for (const pt of pts) {
  const k = 545 / (2.45 - pt.z);
  const x = cx + pt.x * k;
  const y = cy + pt.y * k;
  const alpha = H.clamp(0.32 + (pt.z + 1) * 0.42, 0.22, 1);
  const r = H.lerp(4.5, 12.5, alpha);
  ctx.fillStyle = 'rgba(' + Math.round(105 + 150 * alpha) + ',' + Math.round(200 + 45 * alpha) + ',255,' + alpha + ')';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
ctx.strokeStyle = 'rgba(255,255,255,0.18)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(cx, cy, 390, 0, TAU);
ctx.stroke();`,
  },
  {
    id: 'aperturebars',
    name: 'Aperture bars',
    title: 'The bars slide sideways, not down',
    light: false,
    translations: {
      en: 'The bars slide sideways, not down',
      de: 'Die Streifen gleiten seitlich, nicht nach unten',
      it: 'Le barre scorrono di lato, non in basso',
      es: 'Las barras se deslizan de lado, no hacia abajo',
      ru: 'Полосы едут вбок, а не вниз',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#070912';
ctx.fillRect(0, 0, CW, CH);
const slitW = 74;
const gap = 34;
const top = cy - 470;
const height = 940;
const left = cx - 430;
for (let s = 0; s < 8; s++) {
  const x = left + s * (slitW + gap);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, top, slitW, height, 24);
  ctx.clip();
  ctx.fillStyle = '#151924';
  ctx.fillRect(x, top, slitW, height);
  ctx.translate(x + slitW / 2, cy);
  ctx.rotate(-0.62);
  const offset = (p * 240) % 80;
  for (let y = -900 - offset; y < 900; y += 80) {
    ctx.fillStyle = '#f4f4f2';
    ctx.fillRect(-520, y, 1040, 30);
    ctx.fillStyle = '#18d7ff';
    ctx.fillRect(-520, y + 30, 1040, 10);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, top, slitW, height, 24);
  ctx.stroke();
}
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(cx, cy, 8, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'chevrondrift',
    name: 'Chevron drift',
    title: 'The arrows refuse to sit still',
    light: false,
    translations: {
      en: 'The arrows refuse to sit still',
      de: 'Die Pfeile wollen nicht stillhalten',
      it: 'Le frecce non vogliono stare ferme',
      es: 'Las flechas se niegan a quedarse quietas',
      ru: 'Стрелки не хотят стоять на месте',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#060505';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
ctx.lineWidth = 10;
ctx.lineJoin = 'round';
for (let row = -7; row <= 7; row++) {
  const y = cy + row * 64;
  const dir = row % 2 ? -1 : 1;
  const shift = ((p * 92 * dir) % 96 + 96) % 96;
  for (let x = H.safe.x0 - 120 + shift; x < H.safe.x1 + 120; x += 96) {
    const hue = row % 2 ? '255,198,45' : '55,220,255';
    ctx.strokeStyle = 'rgba(' + hue + ',0.92)';
    ctx.beginPath();
    ctx.moveTo(x - 32, y - 24);
    ctx.lineTo(x, y);
    ctx.lineTo(x - 32, y + 24);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 10, y - 24);
    ctx.lineTo(x + 42, y);
    ctx.lineTo(x + 10, y + 24);
    ctx.stroke();
    ctx.lineWidth = 10;
  }
}
ctx.restore();
ctx.fillStyle = '#fff';
ctx.beginPath();
ctx.arc(cx, cy, 6, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'orbitstorm',
    name: 'Orbit storm',
    title: 'Stare at the dot — the rings swirl',
    light: false,
    translations: {
      en: 'Stare at the dot — the rings swirl',
      de: 'Starr auf den Punkt - die Ringe wirbeln',
      it: 'Fissa il punto: gli anelli vorticano',
      es: 'Mira el punto: los anillos giran',
      ru: 'Смотри в точку — кольца закрутятся',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#02030c';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.lineCap = 'round';
for (let ring = 0; ring < 13; ring++) {
  const r = 60 + ring * 34;
  const count = 10 + ring * 2;
  const dir = ring % 2 ? -1 : 1;
  const phase = p * TAU * dir * (0.28 + ring * 0.018);
  for (let i = 0; i < count; i++) {
    const a = phase + i * TAU / count;
    const len = TAU / count * 0.45;
    ctx.strokeStyle = ring % 2 ? 'rgba(255,80,180,0.88)' : 'rgba(70,230,255,0.86)';
    ctx.lineWidth = H.lerp(13, 4, ring / 13);
    ctx.beginPath();
    ctx.arc(cx, cy, r, a, a + len * dir, dir < 0);
    ctx.stroke();
  }
}
ctx.restore();
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(cx, cy, 9, 0, TAU);
ctx.fill();
ctx.strokeStyle = 'rgba(255,255,255,0.32)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(cx, cy, 22, 0, TAU);
ctx.stroke();`,
  },
  {
    id: 'tiltcloud',
    name: 'Tilt cloud',
    title: 'Every dash is the same length',
    light: false,
    translations: {
      en: 'Every dash is the same length',
      de: 'Jeder Strich ist gleich lang',
      it: 'Ogni trattino ha la stessa lunghezza',
      es: 'Cada raya tiene la misma longitud',
      ru: 'Каждая черточка одной длины',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#08080b';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
ctx.lineCap = 'round';
const zoom = 1 + 0.055 * Math.sin(p * TAU * 2);
for (let gy = -9; gy <= 9; gy++) {
  for (let gx = -6; gx <= 6; gx++) {
    const x = cx + gx * 70 * zoom;
    const y = cy + gy * 58 * zoom;
    const d = Math.hypot(x - cx, y - cy);
    if (d > 510) continue;
    const a = Math.atan2(y - cy, x - cx) + Math.sin(d * 0.018 + p * TAU) * 0.38;
    const len = 34;
    const bright = 0.45 + 0.45 * Math.sin(d * 0.025 - p * TAU * 2);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.18 + bright * 0.66) + ')';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2);
    ctx.lineTo(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2);
    ctx.stroke();
  }
}
ctx.restore();
ctx.fillStyle = '#ff375f';
ctx.beginPath();
ctx.arc(cx, cy, 7, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'pulsechecker',
    name: 'Pulse checker',
    title: 'The squares never change size',
    light: true,
    translations: {
      en: 'The squares never change size',
      de: 'Die Quadrate ändern nie ihre Größe',
      it: 'I quadrati non cambiano mai dimensione',
      es: 'Los cuadrados nunca cambian de tamaño',
      ru: 'Квадраты не меняют размер',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#efeee9';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
const cell = 52;
const pulse = 1 + 0.09 * Math.sin(p * TAU * 2);
for (let y = H.safe.y0 - cell; y <= H.safe.y1 + cell; y += cell) {
  for (let x = H.safe.x0 - cell; x <= H.safe.x1 + cell; x += cell) {
    const mx = x + cell / 2, my = y + cell / 2;
    const dx = (mx - cx) * pulse;
    const dy = (my - cy) * pulse;
    const dist = Math.hypot(dx, dy);
    const bend = 1 + 0.16 * Math.sin(dist * 0.027 - p * TAU * 3);
    const xx = cx + dx * bend;
    const yy = cy + dy * bend;
    ctx.fillStyle = ((Math.floor(x / cell) + Math.floor(y / cell)) & 1) ? '#111319' : '#faf8ee';
    ctx.fillRect(xx - cell / 2, yy - cell / 2, cell, cell);
  }
}
ctx.restore();
ctx.strokeStyle = 'rgba(240,54,92,0.9)';
ctx.lineWidth = 5;
ctx.beginPath();
ctx.arc(cx, cy, 430, 0, TAU);
ctx.stroke();`,
  },
  {
    id: 'phasewaves',
    name: 'Phase waves',
    title: 'Two wave fields fight your eyes',
    light: false,
    translations: {
      en: 'Two wave fields fight your eyes',
      de: 'Zwei Wellenfelder verwirren deine Augen',
      it: 'Due campi d onde confondono gli occhi',
      es: 'Dos campos de ondas confunden tus ojos',
      ru: 'Две волны спорят с твоими глазами',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#020409';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
ctx.globalCompositeOperation = 'screen';
for (let layer = 0; layer < 2; layer++) {
  ctx.strokeStyle = layer ? 'rgba(255,62,150,0.72)' : 'rgba(62,220,255,0.78)';
  ctx.lineWidth = 4;
  const phase = p * TAU * (layer ? -1 : 1);
  const rot = layer ? 0.62 : -0.62;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  for (let y = -560; y <= 560; y += 32) {
    ctx.beginPath();
    for (let x = -620; x <= 620; x += 14) {
      const yy = y + 18 * Math.sin(x * 0.035 + phase) + 8 * Math.sin((x + y) * 0.015 - phase);
      if (x === -620) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}
ctx.restore();
ctx.globalCompositeOperation = 'source-over';`,
  },
  {
    id: 'phantomrays',
    name: 'Phantom rays',
    title: 'The rings create ghost rays',
    light: true,
    translations: {
      en: 'The rings create ghost rays',
      de: 'Die Ringe erzeugen Geisterstrahlen',
      it: 'Gli anelli creano raggi fantasma',
      es: 'Los anillos crean rayos fantasma',
      ru: 'Кольца создают призрачные лучи',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#f8f5ea';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
const spokes = 40;
for (let i = 0; i < spokes; i++) {
  const a = i * TAU / spokes + 0.08 * Math.sin(p * TAU);
  ctx.rotate(TAU / spokes);
  const grad = ctx.createLinearGradient(0, -470, 0, 470);
  grad.addColorStop(0, i % 2 ? 'rgba(20,20,20,0)' : 'rgba(20,20,20,0.38)');
  grad.addColorStop(0.48, 'rgba(20,20,20,0)');
  grad.addColorStop(0.52, 'rgba(20,20,20,0)');
  grad.addColorStop(1, i % 2 ? 'rgba(20,20,20,0.38)' : 'rgba(20,20,20,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 470, -TAU / spokes * 0.34, TAU / spokes * 0.34);
  ctx.closePath();
  ctx.fill();
  void a;
}
ctx.restore();
ctx.strokeStyle = '#181818';
ctx.lineWidth = 6;
for (let r = 110; r <= 430; r += 80) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
}
ctx.strokeStyle = 'rgba(20,20,20,0.32)';
ctx.lineWidth = 2;
for (let i = 0; i < 40; i += 2) {
  const a = i * TAU / 40;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
  ctx.lineTo(cx + Math.cos(a) * 455, cy + Math.sin(a) * 455);
  ctx.stroke();
}
ctx.fillStyle = '#111';
ctx.beginPath();
ctx.arc(cx, cy, 9, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'floatingrings',
    name: 'Floating rings',
    title: 'Every ring is perfectly flat',
    light: false,
    translations: {
      en: 'Every ring is perfectly flat',
      de: 'Jeder Ring ist vollkommen flach',
      it: 'Ogni anello è perfettamente piatto',
      es: 'Cada anillo es totalmente plano',
      ru: 'Каждое кольцо абсолютно плоское',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#04060b';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
for (let i = 0; i < 12; i++) {
  const u = i / 11;
  const y = H.lerp(-410, 410, u);
  const rx = 370 * Math.sin(u * Math.PI);
  const ry = 30 + 26 * Math.cos(p * TAU * 2 + i * 0.7);
  ctx.lineWidth = H.lerp(9, 3, u);
  ctx.strokeStyle = i % 2 ? 'rgba(255,210,80,0.86)' : 'rgba(90,230,255,0.82)';
  ctx.beginPath();
  ctx.ellipse(0, y, rx, Math.abs(ry), 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, y + 8, rx * 0.94, Math.abs(ry) * 0.65, 0, 0, TAU);
  ctx.stroke();
}
ctx.restore();
ctx.fillStyle = '#fff';
ctx.beginPath();
ctx.arc(cx, cy, 7, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'depthlattice',
    name: 'Depth lattice',
    title: 'A flat grid becomes a tunnel',
    light: false,
    translations: {
      en: 'A flat grid becomes a tunnel',
      de: 'Ein flaches Gitter wird zum Tunnel',
      it: 'Una griglia piatta diventa un tunnel',
      es: 'Una cuadrícula plana se vuelve túnel',
      ru: 'Плоская сетка превращается в тоннель',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#010309';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(0.1 * Math.sin(p * TAU));
ctx.strokeStyle = 'rgba(80,230,255,0.78)';
ctx.lineWidth = 3;
const steps = 18;
for (let i = 0; i < steps; i++) {
  const q = ((i + p * 2.2) / steps) % 1;
  const z = q * q;
  const w = H.lerp(40, 780, z);
  const h = H.lerp(70, 1180, z);
  ctx.globalAlpha = H.lerp(1, 0.12, z);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
}
ctx.globalAlpha = 1;
for (let i = 0; i < 18; i++) {
  const a = i * TAU / 18;
  ctx.beginPath();
  ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 40);
  ctx.lineTo(Math.cos(a) * 420, Math.sin(a) * 650);
  ctx.stroke();
}
ctx.restore();
ctx.fillStyle = '#ff4d7d';
ctx.beginPath();
ctx.arc(cx, cy, 7, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'stripebeat',
    name: 'Stripe beat',
    title: 'Only the brightness is pulsing',
    light: true,
    translations: {
      en: 'Only the brightness is pulsing',
      de: 'Nur die Helligkeit pulsiert',
      it: 'Pulsa solo la luminosità',
      es: 'Solo pulsa el brillo',
      ru: 'Пульсирует только яркость',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#d8d8d2';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
const w = 30;
for (let x = H.safe.x0 - 80; x <= H.safe.x1 + 80; x += w) {
  const i = Math.round((x - H.safe.x0) / w);
  const phase = Math.sin(p * TAU * 4 + i * 0.7);
  const c = Math.round(70 + 150 * (0.5 + 0.5 * phase));
  ctx.fillStyle = i % 2 ? 'rgb(' + c + ',' + c + ',' + c + ')' : 'rgb(' + (255 - c) + ',' + (255 - c) + ',' + (255 - c) + ')';
  ctx.fillRect(x, H.safe.y0, w, H.safe.y1 - H.safe.y0);
}
ctx.globalCompositeOperation = 'multiply';
const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, 480);
g.addColorStop(0, 'rgba(255,255,255,0.7)');
g.addColorStop(1, 'rgba(0,0,0,0.34)');
ctx.fillStyle = g;
ctx.fillRect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.restore();`,
  },
  {
    id: 'beadspiral',
    name: 'Bead spiral',
    title: 'The beads sit on perfect spirals',
    light: false,
    translations: {
      en: 'The beads sit on perfect spirals',
      de: 'Die Perlen liegen auf perfekten Spiralen',
      it: 'Le perle stanno su spirali perfette',
      es: 'Las cuentas están en espirales perfectas',
      ru: 'Бусины стоят на идеальных спиралях',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#020207';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
for (let arm = 0; arm < 5; arm++) {
  for (let i = 0; i < 78; i++) {
    const q = i / 78;
    const r = 26 + q * 470;
    const a = arm * TAU / 5 + q * TAU * 3.6 + p * TAU * 0.9;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const glow = 0.5 + 0.5 * Math.sin(q * TAU * 8 - p * TAU * 4);
    ctx.fillStyle = 'rgba(' + Math.round(80 + 175 * glow) + ',' + Math.round(130 + 110 * q) + ',255,' + (0.35 + 0.55 * (1 - q)) + ')';
    ctx.beginPath();
    ctx.arc(x, y, H.lerp(9, 3, q), 0, TAU);
    ctx.fill();
  }
}
ctx.restore();
ctx.fillStyle = '#fff';
ctx.beginPath();
ctx.arc(cx, cy, 6, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'glasswarp',
    name: 'Glass warp',
    title: 'The centre is not bending',
    light: true,
    translations: {
      en: 'The centre is not bending',
      de: 'Die Mitte verbiegt sich nicht',
      it: 'Il centro non si piega davvero',
      es: 'El centro no se está doblando',
      ru: 'Центр на самом деле не гнётся',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#f6f1e6';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
ctx.strokeStyle = '#11151a';
ctx.lineWidth = 3;
for (let y = H.safe.y0; y <= H.safe.y1; y += 48) {
  ctx.beginPath();
  for (let x = H.safe.x0; x <= H.safe.x1; x += 18) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    const lens = Math.max(0, 1 - d / 360);
    const yy = y + lens * 42 * Math.sin(dx * 0.025 + p * TAU * 2);
    if (x === H.safe.x0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
}
for (let x = H.safe.x0; x <= H.safe.x1; x += 48) {
  ctx.beginPath();
  for (let y = H.safe.y0; y <= H.safe.y1; y += 18) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    const lens = Math.max(0, 1 - d / 360);
    const xx = x + lens * 42 * Math.sin(dy * 0.025 - p * TAU * 2);
    if (y === H.safe.y0) ctx.moveTo(xx, y);
    else ctx.lineTo(xx, y);
  }
  ctx.stroke();
}
ctx.restore();
ctx.strokeStyle = 'rgba(24,160,255,0.85)';
ctx.lineWidth = 7;
ctx.beginPath();
ctx.arc(cx, cy, 360, 0, TAU);
ctx.stroke();`,
  },
  {
    id: 'scintcircle',
    name: 'Scintillating circle grid',
    title: 'Count the black sparks',
    light: true,
    translations: {
      en: 'Count the black sparks',
      de: 'Zähl die schwarzen Funken',
      it: 'Conta le scintille nere',
      es: 'Cuenta las chispas negras',
      ru: 'Сосчитай чёрные вспышки',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#d9d9d2';
ctx.fillRect(0, 0, CW, CH);
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 16;
for (let r = 95; r <= 455; r += 60) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
}
for (let i = 0; i < 28; i++) {
  const a = i * TAU / 28;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * 75, cy + Math.sin(a) * 75);
  ctx.lineTo(cx + Math.cos(a) * 478, cy + Math.sin(a) * 478);
  ctx.stroke();
}
for (let r = 95; r <= 455; r += 60) {
  for (let i = 0; i < 28; i++) {
    const a = i * TAU / 28;
    const flash = 0.35 + 0.65 * Math.max(0, Math.sin(p * TAU * 6 + i * 1.7 + r * 0.05));
    ctx.fillStyle = 'rgba(0,0,0,' + (0.22 + 0.7 * flash) + ')';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 7.5, 0, TAU);
    ctx.fill();
  }
}
ctx.fillStyle = '#e22d54';
ctx.beginPath();
ctx.arc(cx, cy, 7, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'crawlingdots',
    name: 'Crawling dots',
    title: 'The dots are locked to the grid',
    light: false,
    translations: {
      en: 'The dots are locked to the grid',
      de: 'Die Punkte bleiben im Raster',
      it: 'I punti restano bloccati sulla griglia',
      es: 'Los puntos están fijos en la cuadrícula',
      ru: 'Точки закреплены на сетке',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#03040b';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
const step = 56;
for (let y = H.safe.y0 + 20; y < H.safe.y1; y += step) {
  for (let x = H.safe.x0 + 20; x < H.safe.x1; x += step) {
    const gx = Math.round((x - H.safe.x0) / step);
    const gy = Math.round((y - H.safe.y0) / step);
    const phase = Math.sin(p * TAU * 5 + gx * 0.9 + gy * 1.35);
    const r = 5 + 8 * Math.max(0, phase);
    ctx.fillStyle = phase > 0 ? 'rgba(255,220,80,0.96)' : 'rgba(80,180,255,0.38)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}
ctx.restore();
ctx.strokeStyle = 'rgba(255,255,255,0.16)';
ctx.lineWidth = 2;
for (let x = H.safe.x0; x <= H.safe.x1; x += step) {
  ctx.beginPath(); ctx.moveTo(x, H.safe.y0); ctx.lineTo(x, H.safe.y1); ctx.stroke();
}
for (let y = H.safe.y0; y <= H.safe.y1; y += step) {
  ctx.beginPath(); ctx.moveTo(H.safe.x0, y); ctx.lineTo(H.safe.x1, y); ctx.stroke();
}`,
  },
  {
    id: 'fanflip',
    name: 'Ambiguous fan',
    title: 'Which way did the fan flip?',
    light: false,
    translations: {
      en: 'Which way did the fan flip?',
      de: 'In welche Richtung kippt der Fächer?',
      it: 'Da che parte si ribalta il ventaglio?',
      es: '¿Hacia qué lado gira el abanico?',
      ru: 'В какую сторону перевернулся веер?',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#05050a';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
const blades = 18;
const phase = Math.sin(p * TAU * 2);
for (let i = 0; i < blades; i++) {
  const a = i * TAU / blades + phase * 0.14;
  const w = TAU / blades * 0.64;
  const grad = ctx.createRadialGradient(0, 0, 40, 0, 0, 470);
  grad.addColorStop(0, i % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(70,200,255,0.76)');
  grad.addColorStop(1, i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,40,150,0.05)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 470, a - w / 2, a + w / 2);
  ctx.closePath();
  ctx.fill();
}
ctx.restore();
ctx.fillStyle = '#05050a';
ctx.beginPath();
ctx.arc(cx, cy, 86, 0, TAU);
ctx.fill();
ctx.strokeStyle = '#fff';
ctx.lineWidth = 6;
ctx.beginPath();
ctx.arc(cx, cy, 86, 0, TAU);
ctx.stroke();`,
  },
  {
    id: 'polarchecker',
    name: 'Polar checker',
    title: 'Straight rings feel twisted',
    light: false,
    translations: {
      en: 'Straight rings feel twisted',
      de: 'Gerade Ringe wirken verdreht',
      it: 'Anelli regolari sembrano contorti',
      es: 'Anillos rectos parecen retorcidos',
      ru: 'Ровные кольца будто скручены',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#02020a';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
const rings = 11;
for (let ri = 0; ri < rings; ri++) {
  const r0 = 48 + ri * 40;
  const r1 = r0 + 34;
  const cells = 24 + ri * 4;
  for (let i = 0; i < cells; i++) {
    const a0 = i * TAU / cells + Math.sin(p * TAU + ri) * 0.08;
    const a1 = (i + 1) * TAU / cells + Math.sin(p * TAU + ri) * 0.08;
    ctx.fillStyle = (i + ri) % 2 ? 'rgba(255,255,255,0.92)' : 'rgba(20,170,255,0.82)';
    ctx.beginPath();
    ctx.arc(0, 0, r1, a0, a1);
    ctx.arc(0, 0, r0, a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
}
ctx.restore();
ctx.fillStyle = '#ff335f';
ctx.beginPath();
ctx.arc(cx, cy, 8, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'zippermotion',
    name: 'Zipper motion',
    title: 'The zipper crawls without moving',
    light: false,
    translations: {
      en: 'The zipper crawls without moving',
      de: 'Der Reißverschluss kriecht ohne Bewegung',
      it: 'La cerniera striscia senza muoversi',
      es: 'La cremallera avanza sin moverse',
      ru: 'Молния ползёт, хотя стоит на месте',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#070707';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
const rows = 20;
for (let i = -rows; i <= rows; i++) {
  const y = i * 28;
  const phase = Math.sin(p * TAU * 4 + i * 0.7);
  const open = 22 + 16 * phase;
  for (const side of [-1, 1]) {
    ctx.fillStyle = i % 2 ? '#f4f4f0' : '#49d8ff';
    ctx.beginPath();
    ctx.moveTo(side * open, y);
    ctx.lineTo(side * 230, y - 18);
    ctx.lineTo(side * 230, y + 18);
    ctx.closePath();
    ctx.fill();
  }
}
ctx.strokeStyle = 'rgba(255,255,255,0.28)';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(0, -610);
ctx.lineTo(0, 610);
ctx.stroke();
ctx.restore();`,
  },
  {
    id: 'eclipsegrid',
    name: 'Eclipse grid',
    title: 'Every center dot is identical',
    light: true,
    translations: {
      en: 'Every center dot is identical',
      de: 'Jeder Mittelpunkt ist identisch',
      it: 'Ogni punto centrale è identico',
      es: 'Cada punto central es idéntico',
      ru: 'Все центральные точки одинаковые',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#f2efe6';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.beginPath();
ctx.rect(H.safe.x0, H.safe.y0, H.safe.x1 - H.safe.x0, H.safe.y1 - H.safe.y0);
ctx.clip();
for (let row = 0; row < 7; row++) {
  for (let col = 0; col < 5; col++) {
    const x = cx + (col - 2) * 150;
    const y = cy + (row - 3) * 130;
    const r = 42 + 18 * Math.sin(p * TAU * 2 + row + col);
    ctx.fillStyle = (row + col) % 2 ? '#0c1018' : '#d9d1bd';
    ctx.beginPath();
    ctx.arc(x - 26, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = (row + col) % 2 ? '#d9d1bd' : '#0c1018';
    ctx.beginPath();
    ctx.arc(x + 26, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff7138';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, TAU);
    ctx.fill();
  }
}
ctx.restore();`,
  },
  {
    id: 'neonladder',
    name: 'Neon ladder',
    title: 'The glow appears between the lines',
    light: false,
    translations: {
      en: 'The glow appears between the lines',
      de: 'Das Leuchten erscheint zwischen den Linien',
      it: 'Il bagliore appare tra le linee',
      es: 'El brillo aparece entre las líneas',
      ru: 'Свечение возникает между линиями',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#01030a';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(-0.35);
for (let rail of [-1, 1]) {
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(rail * 150, -520);
  ctx.lineTo(rail * 150, 520);
  ctx.stroke();
}
for (let i = -10; i <= 10; i++) {
  const y = i * 52;
  const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(p * TAU * 3 + i * 0.8));
  ctx.shadowColor = i % 2 ? '#21d6ff' : '#ff2f98';
  ctx.shadowBlur = 26 * pulse;
  ctx.strokeStyle = i % 2 ? 'rgba(33,214,255,' + (0.55 + pulse * 0.35) + ')' : 'rgba(255,47,152,' + (0.55 + pulse * 0.35) + ')';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-150, y);
  ctx.lineTo(150, y);
  ctx.stroke();
}
ctx.shadowBlur = 0;
ctx.restore();`,
  },
  {
    id: 'splitspiral',
    name: 'Split spiral',
    title: 'Two spirals share one flat image',
    light: false,
    translations: {
      en: 'Two spirals share one flat image',
      de: 'Zwei Spiralen teilen ein flaches Bild',
      it: 'Due spirali condividono un immagine piatta',
      es: 'Dos espirales comparten una imagen plana',
      ru: 'Две спирали в одной плоской картинке',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#020208';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
ctx.lineCap = 'round';
for (let arm = 0; arm < 2; arm++) {
  ctx.strokeStyle = arm ? 'rgba(255,64,150,0.88)' : 'rgba(70,220,255,0.88)';
  ctx.lineWidth = 13;
  for (let offset = 0; offset < 7; offset++) {
    ctx.beginPath();
    for (let i = 0; i <= 220; i++) {
      const q = i / 220;
      const r = 40 + q * 480;
      const a = (arm ? -1 : 1) * (q * TAU * 3.8 + p * TAU * 0.8) + offset * TAU / 7;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
ctx.restore();
ctx.fillStyle = '#fff';
ctx.beginPath();
ctx.arc(cx, cy, 8, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'rayafterimage',
    name: 'Ray afterimage',
    title: 'Stare, then blink at a wall',
    dur: 10,
    light: false,
    translations: {
      en: 'Stare, then blink at a wall',
      de: 'Starr hin, dann blinzle zur Wand',
      it: 'Fissa, poi sbatti le palpebre verso il muro',
      es: 'Mira fijo y luego parpadea hacia una pared',
      ru: 'Смотри, потом моргни на стену',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
const rays = 48;
for (let i = 0; i < rays; i++) {
  const a0 = i * TAU / rays + p * TAU * 0.22;
  const a1 = a0 + TAU / rays * 0.52;
  ctx.fillStyle = i % 2 ? '#fff7dc' : '#101010';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 520, a0, a1);
  ctx.closePath();
  ctx.fill();
}
ctx.restore();
const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 75);
g.addColorStop(0, '#ff2f45');
g.addColorStop(0.5, '#ff2f45');
g.addColorStop(1, 'rgba(255,47,69,0)');
ctx.fillStyle = g;
ctx.beginPath();
ctx.arc(cx, cy, 75, 0, TAU);
ctx.fill();
ctx.fillStyle = '#fff';
ctx.beginPath();
ctx.arc(cx, cy, 5, 0, TAU);
ctx.fill();`,
  },
  {
    id: 'loomroom',
    name: 'Looming room',
    title: 'The room is only lines',
    light: false,
    translations: {
      en: 'The room is only lines',
      de: 'Der Raum besteht nur aus Linien',
      it: 'La stanza è fatta solo di linee',
      es: 'La habitación son solo líneas',
      ru: 'Комната состоит только из линий',
    },
    body: String.raw`
const cx = H.cx, cy = H.cy, TAU = H.TAU;
ctx.fillStyle = '#02040b';
ctx.fillRect(0, 0, CW, CH);
ctx.save();
ctx.translate(cx, cy);
ctx.strokeStyle = 'rgba(255,255,255,0.78)';
ctx.lineWidth = 4;
const depth = (p * 2) % 1;
for (let i = 0; i < 18; i++) {
  const q = ((i + depth) / 18) % 1;
  const scale = q * q;
  const w = H.lerp(50, 760, scale);
  const h = H.lerp(80, 1160, scale);
  ctx.globalAlpha = H.lerp(0.95, 0.08, scale);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
}
ctx.globalAlpha = 0.86;
const corners = [[-380,-580],[380,-580],[380,580],[-380,580]];
for (const [x, y] of corners) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(x, y);
  ctx.stroke();
}
ctx.restore();
ctx.fillStyle = '#31d9ff';
ctx.beginPath();
ctx.arc(cx, cy, 7, 0, TAU);
ctx.fill();`,
  },
];

mkdirSync(ILL_DIR, { recursive: true });
const skeleton = readFileSync(SKELETON, 'utf8');
if (!SPEC_RE.test(skeleton) || !DRAW_RE.test(skeleton)) {
  throw new Error('skeleton-v2.html does not match expected markers');
}

for (const item of items) {
  const spec = [
    'let SPEC = {',
    `    key: ${js(item.id)}, name: ${js(item.name)}, title: ${js(item.title)}, dur: ${item.dur || 8}, fps: ${item.fps || 30}, light: ${!!item.light},`,
    '    // variant: optional {palette,dir,turns,speed,seed,density,angle} merged into H.v',
    '  };',
  ].join('\n');
  const draw = [
    'function drawIllusion(ctx, p, CW, CH, H) {',
    indent(item.body, 4),
    '  }',
    '  // ===========================================================================',
  ].join('\n');
  const html = skeleton.replace(SPEC_RE, spec).replace(DRAW_RE, draw);
  writeFileSync(resolve(ILL_DIR, `${item.id}.html`), html);
}

const localize = JSON.parse(readFileSync(LOCALIZE, 'utf8'));
for (const item of items) {
  localize[item.id] = item.translations;
}
writeFileSync(LOCALIZE, `${JSON.stringify(localize, null, 2)}\n`);

console.log(`added ${items.length} sticky illusion types`);
for (const item of items) console.log(`  ${item.id}: ${item.title}`);
