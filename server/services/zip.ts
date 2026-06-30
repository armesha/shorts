import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function localHeader(name: Buffer, crc: number, size: number): Buffer {
  const dt = dosDateTime();
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0, 6);
  h.writeUInt16LE(0, 8);
  h.writeUInt16LE(dt.time, 10);
  h.writeUInt16LE(dt.date, 12);
  h.writeUInt32LE(crc >>> 0, 14);
  h.writeUInt32LE(size, 18);
  h.writeUInt32LE(size, 22);
  h.writeUInt16LE(name.length, 26);
  h.writeUInt16LE(0, 28);
  return h;
}

function centralHeader(name: Buffer, crc: number, size: number, offset: number): Buffer {
  const dt = dosDateTime();
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(20, 6);
  h.writeUInt16LE(0, 8);
  h.writeUInt16LE(0, 10);
  h.writeUInt16LE(dt.time, 12);
  h.writeUInt16LE(dt.date, 14);
  h.writeUInt32LE(crc >>> 0, 16);
  h.writeUInt32LE(size, 20);
  h.writeUInt32LE(size, 24);
  h.writeUInt16LE(name.length, 28);
  h.writeUInt16LE(0, 30);
  h.writeUInt16LE(0, 32);
  h.writeUInt16LE(0, 34);
  h.writeUInt16LE(0, 36);
  h.writeUInt32LE(0, 38);
  h.writeUInt32LE(offset, 42);
  return h;
}

function endRecord(count: number, centralSize: number, centralOffset: number): Buffer {
  const h = Buffer.alloc(22);
  h.writeUInt32LE(0x06054b50, 0);
  h.writeUInt16LE(0, 4);
  h.writeUInt16LE(0, 6);
  h.writeUInt16LE(count, 8);
  h.writeUInt16LE(count, 10);
  h.writeUInt32LE(centralSize, 12);
  h.writeUInt32LE(centralOffset, 16);
  h.writeUInt16LE(0, 20);
  return h;
}

export async function writeZipFile(
  outPath: string,
  entries: Array<{ name: string; path?: string; data?: Buffer | string }>,
): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true });
  const fileParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const cleanName = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!cleanName || cleanName.split("/").some((p) => !p || p === "." || p === "..")) {
      throw new Error(`Bad zip entry name: ${entry.name}`);
    }
    const name = Buffer.from(cleanName, "utf8");
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : typeof entry.data === "string"
        ? Buffer.from(entry.data, "utf8")
        : await readFile(entry.path!);
    const crc = crc32(data);
    const local = localHeader(name, crc, data.length);
    fileParts.push(local, name, data);
    centralParts.push(centralHeader(name, crc, data.length, offset), name);
    offset += local.length + name.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((n, p) => n + p.length, 0);
  await writeFile(outPath, Buffer.concat([...fileParts, ...centralParts, endRecord(entries.length, centralSize, centralOffset)]));
  return outPath;
}
