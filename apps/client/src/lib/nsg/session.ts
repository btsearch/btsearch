import { useSyncExternalStore } from "react";

import type { NsgLog, NsgProgress, NsgWorkerRequest, NsgWorkerResponse } from "./types";

type NsgSession = {
  status: "idle" | "parsing" | "ready" | "error";
  log: NsgLog | null;
  progress: NsgProgress | null;
  error: string | null;
};

const initialSession: NsgSession = { status: "idle", log: null, progress: null, error: null };
const listeners = new Set<() => void>();
let session = initialSession;
let currentWorker: Worker | null = null;

function publish(next: NsgSession): void {
  session = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): NsgSession {
  return session;
}

function getServerSnapshot(): NsgSession {
  return initialSession;
}

export function useNsgSession(): NsgSession {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function clearNsgSession(): void {
  currentWorker?.terminate();
  currentWorker = null;
  publish(initialSession);
}

export function importNsgFile(file: File): void {
  currentWorker?.terminate();
  currentWorker = null;
  publish({
    status: "parsing",
    log: null,
    progress: { bytesRead: 0, totalBytes: file.size, percent: 0, recordCount: 0, eventCount: 0, cellCount: 0 },
    error: null,
  });

  try {
    const worker = new Worker(new URL("./parser.worker.ts", import.meta.url), { type: "module" });
    currentWorker = worker;
    worker.onmessage = ({ data }: MessageEvent<NsgWorkerResponse>) => {
      if (currentWorker !== worker) return;
      if (data.type === "progress") {
        publish({ ...session, progress: data.progress });
        return;
      }

      currentWorker = null;
      worker.terminate();
      if (data.type === "complete") publish({ status: "ready", log: data.log, progress: null, error: null });
      else publish({ status: "error", log: null, progress: null, error: data.message });
    };
    worker.onerror = (event) => {
      if (currentWorker !== worker) return;
      currentWorker = null;
      worker.terminate();
      publish({ status: "error", log: null, progress: null, error: event.message || "The NSG parser worker failed." });
    };
    worker.postMessage({ type: "parse", file } satisfies NsgWorkerRequest);
  } catch (error) {
    currentWorker?.terminate();
    currentWorker = null;
    publish({ status: "error", log: null, progress: null, error: error instanceof Error ? error.message : String(error) });
  }
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    currentWorker?.terminate();
    listeners.clear();
  });
