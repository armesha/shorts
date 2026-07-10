// Throwaway final-verification harness for the SOLID reorg: drives the freshly-built
// frontend (served by an isolated :8099 instance) through every dashboard route and
// flags REAL crashes (uncaught pageerror / blank #root / error-boundary), not benign
// console warnings on an empty DB. Run AFTER launching the isolated server on :8099.
import { chromium } from "playwright";

const BASE = process.env.VERIFY_BASE || "http://localhost:8099";
const USER = process.env.VERIFY_USER || "verify";
const PASS = process.env.VERIFY_PASS || "Verify_pass_123";

function sidFrom(setCookie) {
  const m = (setCookie || "").match(/sid=([^;]+)/);
  return m ? m[1] : null;
}

// 1) login (public route) -> sid cookie
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: USER, password: PASS }),
});
if (!loginRes.ok) {
  console.error(`LOGIN FAILED ${loginRes.status}: ${(await loginRes.text()).slice(0, 200)}`);
  process.exit(1);
}
const sid = sidFrom(loginRes.headers.get("set-cookie"));
if (!sid) { console.error("NO sid COOKIE in login response"); process.exit(1); }
console.log("login ok (sid acquired)");

// 2) create an account so /accounts/:id has a target
let accId = 1;
try {
  const r = await fetch(`${BASE}/api/accounts`, {
    method: "POST", headers: { "content-type": "application/json", cookie: `sid=${sid}` }, body: "{}",
  });
  if (r.ok) { accId = (await r.json()).id; console.log("created account", accId); }
} catch (e) { console.log("account create skipped:", e.message); }

const routes = [
  "/", "/channels", "/studio", "/gallery", "/cards", "/packs", "/notifications",
  "/accounts", `/accounts/${accId}`, "/history", "/statistics", "/admin/analytics",
  "/clip-demos", "/limits", "/errors", "/system", "/settings", "/editor", "/users",
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "sid", value: sid, domain: "localhost", path: "/" }]);

let fails = 0;
const results = [];
for (const route of routes) {
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
  let status = "OK", detail = "";
  try {
    // NOT networkidle: the Layout opens a persistent SSE (/api/notifications/stream) that
    // keeps the network "active" forever, so networkidle never settles. Use domcontentloaded
    // + a fixed settle window for React to mount, fetch, and render.
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1800);
    const root = await page.evaluate(() => {
      const r = document.querySelector("#root");
      return { kids: r ? r.childElementCount : 0, text: (r ? r.innerText : "").trim() };
    });
    if (root.kids === 0 || root.text.length < 5) { status = "EMPTY"; detail = `root kids=${root.kids} textlen=${root.text.length}`; }
    if (/something went wrong|error boundary|chunkloaderror|cannot read|is not a function|is not defined/i.test(root.text)) {
      status = "ERROR_UI"; detail = root.text.slice(0, 120);
    }
  } catch (e) { status = "NAV_FAIL"; detail = e.message.slice(0, 120); }
  // REAL failure = crash signals; benign console errors are reported but don't fail the run.
  const crashed = status !== "OK" || pageErrors.length > 0;
  if (crashed) fails++;
  const mark = crashed ? "FAIL" : "ok";
  const extra = [
    pageErrors.length ? `pageerror(${pageErrors.length}): ${pageErrors[0].slice(0, 100)}` : "",
    consoleErrors.length ? `console-err(${consoleErrors.length})` : "",
  ].filter(Boolean).join(" | ");
  results.push(`  [${mark}] ${route.padEnd(20)} ${status}  ${detail} ${extra}`);
  console.log(results[results.length - 1]);
  await page.close();
}
await browser.close();
console.log(`\n=== UI CHECK: ${routes.length - fails}/${routes.length} pages OK, ${fails} crashed ===`);
process.exit(fails > 0 ? 2 : 0);
