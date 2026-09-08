import type { AnalyzerImportErrorCode } from "@/lib/analyzer/analyzer-import";
import type { NsgProgress } from "@/lib/nsg-parser/model";

import type { NsgAnalyzerImport } from "./parseImport";

export type NsgAnalyzerWorkerRequest = { type: "parse"; file: File };
export type NsgAnalyzerWorkerResponse =
  | { type: "progress"; progress: NsgProgress }
  | { type: "complete"; result: NsgAnalyzerImport }
  | { type: "error"; code: AnalyzerImportErrorCode; message: string };
