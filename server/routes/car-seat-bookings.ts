import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";

type BookingRow = {
  car_id: string;
  seat_id: string;
  name: string;
  created_at: string;
};

const PAGES = {
  cars2: "server/public/cars/cars2.html",
} as const;

type PageId = keyof typeof PAGES;

const TOKEN_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: "not found" });
}

function cleanToken(value: unknown): string | null {
  const token = String(value ?? "").trim();
  return TOKEN_RE.test(token) ? token : null;
}

function cleanName(value: unknown, maxLength: number): string | null {
  const name = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return name.length >= 2 ? name : null;
}

function flat(rows: BookingRow[]) {
  const result: Record<string, { name: string; ts: number; createdAt: string }> = {};
  for (const row of rows) {
    result[`${row.car_id}:${row.seat_id}`] = {
      name: row.name,
      ts: new Date(row.created_at).getTime() || Date.now(),
      createdAt: row.created_at,
    };
  }
  return result;
}

function listRows(db: Db, namespace: PageId): BookingRow[] {
  return db.db
    .prepare(
      `SELECT car_id, seat_id, name, created_at
       FROM car_seat_bookings
       WHERE namespace = ?
       ORDER BY car_id, seat_id`,
    )
    .all(namespace) as BookingRow[];
}

function upsertBooking(db: Db, namespace: PageId, carId: string, seatId: string, name: string) {
  db.db
    .prepare(
      `INSERT INTO car_seat_bookings (namespace, car_id, seat_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(namespace, car_id, seat_id)
       DO UPDATE SET name = excluded.name, updated_at = datetime('now')`,
    )
    .run(namespace, carId, seatId, name);
}

export function registerCarSeatBookingRoutes(app: FastifyInstance, db: Db) {
  app.all("/cars1", async (_req, reply) => notFound(reply));
  app.all("/cars1/", async (_req, reply) => notFound(reply));
  app.all("/cars1/bookings", async (_req, reply) => notFound(reply));

  for (const [pageId, file] of Object.entries(PAGES) as Array<[PageId, string]>) {
    app.get(`/${pageId}`, async (_req, reply) => {
      const htmlPath = resolve(process.cwd(), file);
      if (!existsSync(htmlPath)) return reply.code(404).send({ error: "page not found" });
      reply.type("text/html; charset=utf-8");
      return reply.send(createReadStream(htmlPath));
    });
  }

  app.get("/cars2/bookings", async () => flat(listRows(db, "cars2")));

  app.post("/cars2/bookings", async (req, reply) => {
    const body = (req.body ?? {}) as { key?: unknown; name?: unknown };
    const [carRaw, seatRaw] = String(body.key ?? "").split(":");
    const carId = cleanToken(carRaw);
    const seatId = cleanToken(seatRaw);
    const name = cleanName(body.name, 24);
    if (!carId || !seatId || !name) return reply.code(400).send({ error: "bad booking payload" });

    const exists = db.db
      .prepare("SELECT 1 FROM car_seat_bookings WHERE namespace = ? AND car_id = ? AND seat_id = ?")
      .get("cars2", carId, seatId);
    if (exists) return reply.code(409).send({ error: "seat already booked" });

    db.db
      .prepare(
        `INSERT INTO car_seat_bookings (namespace, car_id, seat_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run("cars2", carId, seatId, name);
    return flat(listRows(db, "cars2"));
  });

  app.put("/cars2/bookings", async (req, reply) => {
    const body = (req.body ?? {}) as { key?: unknown; name?: unknown };
    const [carRaw, seatRaw] = String(body.key ?? "").split(":");
    const carId = cleanToken(carRaw);
    const seatId = cleanToken(seatRaw);
    const name = cleanName(body.name, 24);
    if (!carId || !seatId || !name) return reply.code(400).send({ error: "bad booking payload" });
    upsertBooking(db, "cars2", carId, seatId, name);
    return flat(listRows(db, "cars2"));
  });

  app.delete("/cars2/bookings", async (req, reply) => {
    const body = (req.body ?? {}) as { key?: unknown };
    const [carRaw, seatRaw] = String(body.key ?? "").split(":");
    const carId = cleanToken(carRaw);
    const seatId = cleanToken(seatRaw);
    if (carId && seatId) {
      db.db.prepare("DELETE FROM car_seat_bookings WHERE namespace = ? AND car_id = ? AND seat_id = ?").run("cars2", carId, seatId);
    }
    return flat(listRows(db, "cars2"));
  });
}
