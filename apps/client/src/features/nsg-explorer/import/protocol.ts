import type { NsgLog, NsgProgress } from "@/lib/nsg-parser/model";

export type NsgWorkerRequest = { type: "parse"; file: File };
export type NsgWorkerResponse = { type: "progress"; progress: NsgProgress } | { type: "complete"; log: NsgLog } | { type: "error"; message: string };
