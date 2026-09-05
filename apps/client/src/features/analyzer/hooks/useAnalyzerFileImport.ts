import { useCallback, useEffect, useRef, useState } from "react";

import type { FileFormat, ParsedRow } from "@/lib/analyzer-parsers";

export type AnalyzerFileImportProgress = Readonly<{
  bytesRead: number;
  totalBytes: number;
}>;

export type ImportedAnalyzerFile = Readonly<{
  rows: ParsedRow[];
  format: FileFormat;
  skippedObservations: number;
}>;

export function useAnalyzerFileImport(): {
  importProgress: AnalyzerFileImportProgress | null;
  importFile: (file: File) => Promise<ImportedAnalyzerFile | null>;
  cancelImport: () => void;
} {
  const controllerRef = useRef<AbortController | null>(null);
  const [importProgress, setImportProgress] = useState<AnalyzerFileImportProgress | null>(null);

  const cancelImport = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setImportProgress(null);
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const importFile = useCallback(async (file: File): Promise<ImportedAnalyzerFile | null> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setImportProgress({ bytesRead: 0, totalBytes: file.size });

    let lastProgressUpdate = 0;
    function updateProgress(bytesRead: number): void {
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      const now = performance.now();
      if (bytesRead < file.size && now - lastProgressUpdate < 100) return;
      lastProgressUpdate = now;
      setImportProgress({ bytesRead, totalBytes: file.size });
    }

    try {
      const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (controller.signal.aborted || controllerRef.current !== controller) return null;
      const isNsg = header[0] === 0x21 && header[1] === 0x4e && header[2] === 0x53 && header[3] === 0x47;

      if (isNsg) {
        const { importNsgAnalyzerFile } = await import("@/lib/nsg/analyzerImport");
        if (controller.signal.aborted || controllerRef.current !== controller) return null;
        const imported = await importNsgAnalyzerFile(file, {
          signal: controller.signal,
          onProgress: (progress) => updateProgress(progress.bytesRead),
        });
        if (controller.signal.aborted || controllerRef.current !== controller) return null;
        return {
          rows: imported.rows,
          format: "nsg",
          skippedObservations: imported.unsupportedCells + imported.invalidCells,
        };
      }

      const { importAnalyzerTextFile } = await import("@/lib/analyzer-text-import");
      if (controller.signal.aborted || controllerRef.current !== controller) return null;
      const imported = await importAnalyzerTextFile(file, { signal: controller.signal, onProgress: updateProgress });
      if (controller.signal.aborted || controllerRef.current !== controller) return null;
      return { ...imported, skippedObservations: 0 };
    } catch (error) {
      if (controller.signal.aborted || controllerRef.current !== controller) return null;
      throw error;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setImportProgress(null);
      }
    }
  }, []);

  return { importProgress, importFile, cancelImport };
}
