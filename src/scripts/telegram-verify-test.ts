// Quick self-test for the Telegram Login Widget signature check (no server needed):
//   tsx src/scripts/telegram-verify-test.ts
// Signs synthetic widget payloads with a throwaway token, then asserts verifyTelegramAuth()
// accepts the genuine one and rejects tampering / wrong token / staleness.
import { createHash, createHmac } from "node:crypto";
import { verifyTelegramAuth } from "../../server/telegram.ts";

function sign(data: Record<string, string | number>, token: string): string {
  const dcs = Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  return createHmac("sha256", secret).update(dcs).digest("hex");
}

const TOKEN = "123456:THROWAWAY_TEST_TOKEN";
const now = Math.floor(Date.now() / 1000);
let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
};

// 1) Genuine payload → accepted, id surfaced as a string.
const base = { id: 8974649785, first_name: "Test", username: "tester", auth_date: now };
const good = { ...base, hash: sign(base, TOKEN) };
const v1 = verifyTelegramAuth(good, TOKEN);
check("genuine payload accepted", v1.ok === true);
check("id returned as string", v1.ok === true && v1.user.id === "8974649785");

// 2) Tampered field (id changed after signing) → rejected.
const v2 = verifyTelegramAuth({ ...good, id: 999 }, TOKEN);
check("tampered id rejected", v2.ok === false);

// 3) Wrong bot token → rejected.
const v3 = verifyTelegramAuth(good, "999999:OTHER_TOKEN");
check("wrong token rejected", v3.ok === false);

// 4) Stale auth_date (2 days old) → rejected.
const old = { ...base, auth_date: now - 2 * 86400 };
const v4 = verifyTelegramAuth({ ...old, hash: sign(old, TOKEN) }, TOKEN);
check("stale auth_date rejected", v4.ok === false);

// 5) Missing hash → rejected.
const v5 = verifyTelegramAuth(base, TOKEN);
check("missing hash rejected", v5.ok === false);

// 6) Optional fields omitted still verify (hash computed over present keys only).
const minimal = { id: 42, auth_date: now };
const v6 = verifyTelegramAuth({ ...minimal, hash: sign(minimal, TOKEN) }, TOKEN);
check("minimal payload accepted", v6.ok === true);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
