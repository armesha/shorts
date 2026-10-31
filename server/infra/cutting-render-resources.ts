import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

export function cuttingRenderCpuSet(allowed: string) {
  const cpus = new Set<number>();
  for (const piece of allowed.trim().split(",")) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(piece);
    if (!match) throw new Error("Не удалось определить доступные процессоры для нарезки.");
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (last < first || last > 65535 || last - first > 4096) throw new Error("Некорректный список процессоров.");
    for (let cpu = first; cpu <= last; cpu++) cpus.add(cpu);
  }
  const sorted = [...cpus].sort((a, b) => a - b);
  if (!sorted.length) throw new Error("Нет доступных процессоров для нарезки.");
  return sorted.slice(-Math.max(1, Math.min(2, Math.ceil(sorted.length / 4)))).join(",");
}

export function cuttingRenderCommand(bin: string, args: string[]) {
  const isFfmpeg = /^ffmpeg(?:\.exe)?$/i.test(basename(bin)) || (!!process.env.VIDEO_CUTTING_FFMPEG && bin === process.env.VIDEO_CUTTING_FFMPEG);
  if (process.platform !== "linux" || !isFfmpeg) return { bin, args };
  const status = readFileSync("/proc/self/status", "utf8");
  const allowed = /^Cpus_allowed_list:\s*(\S+)/m.exec(status)?.[1];
  if (!allowed) throw new Error("Не удалось ограничить ресурсы рендера.");
  const taskset = ["/usr/bin/taskset", "/bin/taskset"].find(existsSync);
  if (!taskset) throw new Error("Для ограничения ресурсов рендера требуется taskset.");
  const taskArgs = ["-c", cuttingRenderCpuSet(allowed), bin, ...args];
  const nice = ["/usr/bin/nice", "/bin/nice"].find(existsSync);
  return nice ? { bin: nice, args: ["-n", "10", taskset, ...taskArgs] } : { bin: taskset, args: taskArgs };
}
