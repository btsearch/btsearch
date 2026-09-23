import type { NsgAnalyzerImport } from "./parseImport";
import type { AnalyzerImportErrorCode } from "@/lib/analyzer/analyzerImport";
import type { NsgProgress } from "@/lib/nsg-parser/model";

export type NsgAnalyzerWorkerRequest = { type: "parse"; file: File };
export type NsgAnalyzerWorkerResponse =
  | { type: "progress"; progress: NsgProgress }
  | { type: "complete"; result: NsgAnalyzerImport }
  | { type: "error"; code: AnalyzerImportErrorCode; message: string };
