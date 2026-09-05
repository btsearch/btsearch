import { AnalyzerImportError } from "../analyzer/analyzer-import";
import type { NsgAnalyzerImport, NsgAnalyzerWorkerRequest, NsgAnalyzerWorkerResponse } from "./analyzer";
import type { NsgProgress } from "./types";

type ImportOptions = { signal?: AbortSignal; onProgress?: (progress: NsgProgress) => void };

export function importNsgAnalyzerFile(file: File, { signal, onProgress }: ImportOptions = {}): Promise<NsgAnalyzerImport> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("NSG import cancelled.", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./analyzer.worker.ts", import.meta.url), { type: "module" });

    function cleanup(): void {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    }

    function abort(): void {
      cleanup();
      reject(new DOMException("NSG import cancelled.", "AbortError"));
    }

    signal?.addEventListener("abort", abort, { once: true });
    worker.addEventListener("message", ({ data }: MessageEvent<NsgAnalyzerWorkerResponse>) => {
      if (data.type === "progress") {
        onProgress?.(data.progress);
        return;
      }
      cleanup();
      if (data.type === "complete") resolve(data.result);
      else {
        reject(new AnalyzerImportError(data.code, data.message));
      }
    });
    worker.addEventListener("error", () => {
      cleanup();
      reject(new Error("Unable to read this NSG log."));
    });
    worker.addEventListener("messageerror", () => {
      cleanup();
      reject(new Error("Unable to receive the NSG import result."));
    });
    try {
      worker.postMessage({ type: "parse", file } satisfies NsgAnalyzerWorkerRequest);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
