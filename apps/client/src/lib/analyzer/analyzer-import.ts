export const ANALYZER_MAX_CELLS = 20_000;

export type AnalyzerImportErrorCode = "tooManyCells" | "readFailed";

export class AnalyzerImportError extends Error {
  constructor(
    public readonly code: AnalyzerImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = code === "tooManyCells" ? "AnalyzerCellLimitError" : "AnalyzerTextImportError";
  }
}

export function isAnalyzerImportError(error: unknown): error is AnalyzerImportError {
  return error instanceof AnalyzerImportError;
}
