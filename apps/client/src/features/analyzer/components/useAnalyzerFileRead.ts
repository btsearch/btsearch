import { useState } from "react";

import { analyzerSession } from "../data/session";
import { useAnalyzerFileImport } from "../hooks/useAnalyzerFileImport";
import { describeAnalyzerFile, toLogRows } from "../model/rows";
import type { FileReading, ReadFailure } from "./fileBar";
import { isAnalyzerImportError } from "@/lib/analyzer/analyzerImport";

type AnalyzerFileRead = {
  reading: FileReading | null;
  failure: ReadFailure | null;
  readFile: (file: File) => Promise<void>;
  cancelRead: () => void;
};

const UNNAMED_FILE = "";

function toReadFailure(file: File, error: unknown): ReadFailure {
  if (!isAnalyzerImportError(error)) return { fileName: file.name, kind: "failed", cellCount: null };
  return { fileName: file.name, kind: error.code === "tooManyCells" ? "tooMany" : "failed", cellCount: error.cellCount };
}

export function useAnalyzerFileRead(onFileLoaded: () => void): AnalyzerFileRead {
  const { importProgress, importFile, cancelImport } = useAnalyzerFileImport();
  const [readingName, setReadingName] = useState<string | null>(null);
  const [failure, setFailure] = useState<ReadFailure | null>(null);

  async function readFile(file: File): Promise<void> {
    setFailure(null);
    setReadingName(file.name);

    try {
      const imported = await importFile(file);
      if (imported === null) return;

      const logRows = toLogRows(imported.rows);
      if (logRows.rows.length === 0) {
        setFailure({ fileName: file.name, kind: "noRows", cellCount: null });
        return;
      }

      const source = { name: file.name, sizeBytes: file.size, format: imported.format, skippedObservations: imported.skippedObservations };
      analyzerSession.loadFile(describeAnalyzerFile(source, logRows), logRows.rows);
      onFileLoaded();
    } catch (error) {
      setFailure(toReadFailure(file, error));
    }
  }

  const reading: FileReading | null =
    importProgress === null
      ? null
      : { name: readingName ?? UNNAMED_FILE, bytesRead: importProgress.bytesRead, totalBytes: importProgress.totalBytes };

  return { reading, failure, readFile, cancelRead: cancelImport };
}
