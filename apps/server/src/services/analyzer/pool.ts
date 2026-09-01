import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import type { CellInput, LookupMaps } from "./logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "../../workers/analyzer.worker.js");

type PendingTask = {
  resolve: (json: string) => void;
  reject: (err: Error) => void;
};

type WorkerEntry = {
  worker: Worker;
  pending: PendingTask | null;
};

type QueueEntry = {
  cells: CellInput[];
  maps: LookupMaps<unknown>;
  pending: PendingTask;
};

class AnalyzerWorkerPool {
  private entries: WorkerEntry[] = [];
  private queue: QueueEntry[] = [];

  constructor(size: number) {
    for (let i = 0; i < size; i++) this.spawn();
  }

  private spawn(): void {
    const entry: WorkerEntry = { worker: null!, pending: null };
    const worker = new Worker(WORKER_PATH, { execArgv: process.execArgv });
    entry.worker = worker;

    worker.on("message", ({ success, result, error }: { success: boolean; result?: string; error?: string }) => {
      const task = entry.pending;
      entry.pending = null;
      if (task) {
        if (success && result !== undefined) task.resolve(result);
        else task.reject(new Error(error ?? "Worker failed"));
      }

      this.dispatch();
    });

    worker.on("error", (err) => {
      const task = entry.pending;
      entry.pending = null;
      task?.reject(err instanceof Error ? err : new Error(String(err)));
      const idx = this.entries.indexOf(entry);
      if (idx !== -1) this.entries.splice(idx, 1);
      this.spawn();
    });

    this.entries.push(entry);
    this.dispatch();
  }

  private dispatch(): void {
    if (this.queue.length === 0) return;
    const idle = this.entries.find((e) => e.pending === null);
    if (!idle) return;
    const task = this.queue.shift()!;
    idle.pending = task.pending;
    idle.worker.postMessage({ cells: task.cells, maps: task.maps });
  }

  run(cells: CellInput[], maps: LookupMaps<unknown>): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ cells, maps, pending: { resolve, reject } });
      this.dispatch();
    });
  }
}

export const analyzerPool = new AnalyzerWorkerPool(2);
