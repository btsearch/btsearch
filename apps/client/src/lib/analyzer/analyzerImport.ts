export const ANALYZER_MAX_CELLS = 20_000;
export const ANALYZER_NR_MAX = { nci: 68_719_476_735, tac: 16_777_215, pci: 1007, arfcn: 3_279_165 } as const;

export type AnalyzerImportErrorCode = "tooManyCells" | "readFailed";

export class AnalyzerImportError extends Error {
  constructor(
    public readonly code: AnalyzerImportErrorCode,
    message: string,
    public readonly cellCount: number | null = null,
  ) {
    super(message);
    this.name = code === "tooManyCells" ? "AnalyzerCellLimitError" : "AnalyzerTextImportError";
  }
}

export function isAnalyzerImportError(error: unknown): error is AnalyzerImportError {
  return error instanceof AnalyzerImportError;
}
