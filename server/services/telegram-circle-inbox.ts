import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import {
  telegramCircleSourceName,
} from "./circle-source-library.ts";
import {
  circleProjectDir,
  ensureCircleWorkspace,
} from "./circle-workspace.ts";

// The hosted Bot API currently allows getFile downloads up to 20 MB.
export const MAX_TELEGRAM_CIRCLE_BYTES = 20 * 1024 * 1024;

const packagedFfmpeg = ffmpegPath as unknown as string | null;
const ffmpeg = packagedFfmpeg && existsSync(packagedFfmpeg)
  ? packagedFfmpeg
  : (process.env.FFMPEG_PATH?.trim() || "ffmpeg");
const importsInFlight = new Map<string, Promise<TelegramCircleImportResult>>();

export class TelegramCircleImportError extends Error {
  constructor(
    message: string,
    readonly code: "too_large" | "download_failed" | "invalid_video",
  ) {
    super(message);
  }
}

export interface TelegramCircleImportInput {
  botToken: string;
  userId: number;
  fileId: string;
  fileUniqueId: string;
  fileSize?: number;
}

export interface TelegramCircleImportResult {
  file: string;
  duplicate: boolean;
}

interface ImportDeps {
  fetchImpl?: typeof fetch;
}

function runFfmpeg(args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpeg, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4_000);
    });
    child.once("error", () => reject(new TelegramCircleImportError(
      "Не удалось проверить видеокружок.",
      "invalid_video",
    )));
    child.once("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new TelegramCircleImportError(
        stderr ? "Telegram прислал повреждённый или неподдерживаемый видеокружок." : "Не удалось проверить видеокружок.",
        "invalid_video",
      ));
    });
  });
}

async function readResponseLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new TelegramCircleImportError("Видеокружок превышает лимит Bot API 20 МБ.", "too_large");
  }
  if (!response.body) {
    throw new TelegramCircleImportError("Telegram не вернул содержимое файла.", "download_failed");
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      const chunk = Buffer.from(item.value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new TelegramCircleImportError("Видеокружок превышает лимит Bot API 20 МБ.", "too_large");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof TelegramCircleImportError) throw error;
    throw new TelegramCircleImportError("Не удалось скачать видеокружок из Telegram.", "download_failed");
  }
  if (!total) throw new TelegramCircleImportError("Telegram вернул пустой файл.", "download_failed");
  return Buffer.concat(chunks, total);
}

async function downloadTelegramFile(
  input: TelegramCircleImportInput,
  fetchImpl: typeof fetch,
): Promise<Buffer> {
  let fileResponse: Response;
  try {
    fileResponse = await fetchImpl(`https://api.telegram.org/bot${input.botToken}/getFile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: input.fileId }),
    });
  } catch {
    throw new TelegramCircleImportError("Не удалось запросить видеокружок у Telegram.", "download_failed");
  }

  const body = await fileResponse.json().catch(() => ({})) as {
    ok?: boolean;
    result?: { file_path?: string; file_size?: number };
  };
  const filePath = body.result?.file_path || "";
  const reportedSize = Number(body.result?.file_size || 0);
  if (!fileResponse.ok || !body.ok || !filePath) {
    throw new TelegramCircleImportError("Telegram не разрешил скачать видеокружок.", "download_failed");
  }
  if (Number.isFinite(reportedSize) && reportedSize > MAX_TELEGRAM_CIRCLE_BYTES) {
    throw new TelegramCircleImportError("Видеокружок превышает лимит Bot API 20 МБ.", "too_large");
  }
  const parts = filePath.split("/");
  if (!parts.length || parts.some((part) => !part || part === "." || part === ".." || !/^[a-z0-9_.-]+$/i.test(part))) {
    throw new TelegramCircleImportError("Telegram вернул некорректный путь к файлу.", "download_failed");
  }

  let downloadResponse: Response;
  try {
    downloadResponse = await fetchImpl(
      `https://api.telegram.org/file/bot${input.botToken}/${parts.map(encodeURIComponent).join("/")}`,
    );
  } catch {
    throw new TelegramCircleImportError("Не удалось скачать видеокружок из Telegram.", "download_failed");
  }
  if (!downloadResponse.ok) {
    throw new TelegramCircleImportError("Telegram не отдал файл видеокружка.", "download_failed");
  }
  return readResponseLimited(downloadResponse, MAX_TELEGRAM_CIRCLE_BYTES);
}

async function performImport(
  input: TelegramCircleImportInput,
  file: string,
  fetchImpl: typeof fetch,
): Promise<TelegramCircleImportResult> {
  const root = ensureCircleWorkspace();
  const target = resolve(root, "downloads", file);
  if (existsSync(target) && statSync(target).isFile() && statSync(target).size > 0) {
    return { file, duplicate: true };
  }

  const uploadDir = resolve(root, "downloads", ".uploads");
  const temporary = resolve(uploadDir, `${file}.${process.pid}.${randomUUID()}.upload`);
  await mkdir(uploadDir, { recursive: true });
  try {
    const bytes = await downloadTelegramFile(input, fetchImpl);
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-i", temporary,
      "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-",
    ], circleProjectDir());
    await rename(temporary, target);
    await chmod(target, 0o600);
    return { file, duplicate: false };
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function importTelegramCircle(
  input: TelegramCircleImportInput,
  deps: ImportDeps = {},
): Promise<TelegramCircleImportResult> {
  if (Number(input.fileSize || 0) > MAX_TELEGRAM_CIRCLE_BYTES) {
    throw new TelegramCircleImportError("Видеокружок превышает лимит Bot API 20 МБ.", "too_large");
  }
  const stableId = input.fileUniqueId || input.fileId;
  const file = telegramCircleSourceName(input.userId, stableId);
  const key = `${input.userId}:${file}`;
  const current = importsInFlight.get(key);
  if (current) return current;
  const task = performImport(input, file, deps.fetchImpl ?? fetch);
  importsInFlight.set(key, task);
  try {
    return await task;
  } finally {
    importsInFlight.delete(key);
  }
}

export interface TelegramCircleInboxMessage {
  fromId?: string;
  chatId?: string | number;
  chatType?: string;
  videoNote?: {
    fileId?: string;
    fileUniqueId?: string;
    fileSize?: number;
  };
}

interface InboxDeps {
  botToken: string;
  publicBaseUrl?: string;
  findUserByTelegramId: (telegramId: string) => { id: number } | null;
  sendMessage: (chatId: string | number, text: string) => Promise<unknown>;
  importCircle?: typeof importTelegramCircle;
  onError?: (error: Error) => void;
}

export async function handleTelegramCircleInboxMessage(
  message: TelegramCircleInboxMessage,
  deps: InboxDeps,
): Promise<boolean> {
  const note = message.videoNote;
  if (!note) return false;
  if (message.chatType && message.chatType !== "private") return true;
  if (message.chatId == null || !message.fromId || !note.fileId) return true;

  const user = deps.findUserByTelegramId(message.fromId);
  if (!user) {
    const settingsUrl = deps.publicBaseUrl
      ? `\n\nНастройки: ${deps.publicBaseUrl.replace(/\/+$/, "")}/settings`
      : "";
    await deps.sendMessage(
      message.chatId,
      `Сначала привяжите этот Telegram к аккаунту Shorts Factory, затем отправьте кружок ещё раз.${settingsUrl}`,
    );
    return true;
  }

  try {
    const result = await (deps.importCircle ?? importTelegramCircle)({
      botToken: deps.botToken,
      userId: user.id,
      fileId: note.fileId,
      fileUniqueId: note.fileUniqueId || note.fileId,
      fileSize: note.fileSize,
    });
    await deps.sendMessage(
      message.chatId,
      result.duplicate
        ? "Этот кружок уже есть в вашем редакторе."
        : "✅ Кружок добавлен в Shorts Factory. Вернитесь в редактор — он появится в списке «Кружок».",
    );
  } catch (error) {
    const safeError = error instanceof TelegramCircleImportError
      ? error
      : new TelegramCircleImportError("Не удалось добавить видеокружок.", "download_failed");
    deps.onError?.(safeError);
    await deps.sendMessage(
      message.chatId,
      safeError.code === "too_large"
        ? "Не удалось загрузить: Bot API принимает видеокружки размером до 20 МБ."
        : "Не удалось скачать этот кружок. Попробуйте отправить его ещё раз или загрузите файл через сайт.",
    );
  }
  return true;
}
