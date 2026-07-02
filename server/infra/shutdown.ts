// Graceful shutdown orchestration — pure & testable (all side effects injected as deps).
// On a stop signal: stop taking NEW work (scheduler + generation queue), WAIT for the in-flight
// render/upload to finish (so nothing is left half-done / no orphan scratch files / no double-post),
// then close the HTTP server and the DB. After this, a restart starts clean.

export interface ShutdownDeps {
  log: (msg: string) => void;
  stopScheduler: () => void;
  drainQueue: () => void;
  /** Live count of in-flight tasks; shutdown waits until both reach 0 (or the timeout). */
  activeCounts: () => { render: number; upload: number };
  closeServer: () => Promise<void>;
  closeDb: () => void;
}

export interface ShutdownOpts {
  timeoutMs?: number; // hard cap on how long to wait for in-flight work (default 30s)
  pollMs?: number; // how often to re-check active counts (default 200ms)
  sleep?: (ms: number) => Promise<void>; // injectable for tests
}

export interface ShutdownResult {
  drained: boolean; // true = in-flight work finished on its own; false = timed out and forced close
  waitedMs: number;
}

export async function gracefulShutdown(deps: ShutdownDeps, opts: ShutdownOpts = {}): Promise<ShutdownResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const pollMs = opts.pollMs ?? 200;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  deps.log("остановка приёма новых задач (планировщик + очередь генерации)…");
  deps.stopScheduler();
  deps.drainQueue();

  const start = Date.now();
  let drained = true;
  for (;;) {
    const a = deps.activeCounts();
    if (a.render === 0 && a.upload === 0) break;
    if (Date.now() - start >= timeoutMs) {
      drained = false;
      deps.log(`таймаут дренажа: ещё активно ${a.render} рендер / ${a.upload} загрузка — закрываюсь принудительно`);
      break;
    }
    deps.log(`жду завершения: ${a.render} рендер / ${a.upload} загрузка…`);
    await sleep(pollMs);
  }

  deps.log("закрываю HTTP-сервер…");
  await deps.closeServer();
  deps.log("закрываю БД…");
  deps.closeDb();

  const waitedMs = Date.now() - start;
  deps.log(`остановка завершена за ${waitedMs} мс (drained=${drained}) 👋`);
  return { drained, waitedMs };
}
