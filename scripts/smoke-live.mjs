#!/usr/bin/env node

const CHECKS = [
  {
    name: "local health",
    url: process.env.SMOKE_LOCAL_URL || "http://127.0.0.1:8080/api/health",
    method: "GET",
  },
  {
    name: "public channels",
    url: process.env.SMOKE_PUBLIC_URL || "https://shareboard.live/channels",
    method: "HEAD",
  },
];

async function check({ name, url, method }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { method, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[smoke] ${name}: ok (${res.status})`);
  } finally {
    clearTimeout(timer);
  }
}

for (const item of CHECKS) await check(item);
