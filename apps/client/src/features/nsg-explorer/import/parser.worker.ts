import { knownGnbidLength } from "@openbts/country-packs";

import type { NsgWorkerRequest, NsgWorkerResponse } from "./protocol";
import { parseCellrec } from "@/lib/cellrec-parser";
import { CELLREC_MAGIC, isCellrecFileHeader } from "@/lib/cellrec-parser/fileHeader";
import { parseNsg } from "@/lib/nsg-parser";
import { openNsgFile } from "@/lib/nsg-parser/browser";
import type { NsgLog, NsgProgress } from "@/lib/nsg-parser/model";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function send(message: NsgWorkerResponse): void {
  scope.postMessage(message);
}

function reportProgress(progress: NsgProgress): void {
  send({ type: "progress", progress });
}

async function parseFile(file: File): Promise<NsgLog> {
  const leadingBytes = new Uint8Array(await file.slice(0, CELLREC_MAGIC.length).arrayBuffer());
  if (isCellrecFileHeader(leadingBytes))
    return parseCellrec(
      new Uint8Array(await file.arrayBuffer()),
      { name: file.name, size: file.size },
      { gnbidLength: knownGnbidLength, onProgress: reportProgress },
    );
  const { stream, source } = await openNsgFile(file);
  return parseNsg({ stream, source }, { allowIncompleteFinalRecord: true, gnbidLength: knownGnbidLength, onProgress: reportProgress });
}

scope.addEventListener("message", async (event: MessageEvent<NsgWorkerRequest>) => {
  if (event.data.type !== "parse") return;
  const { file } = event.data;
  try {
    send({ type: "complete", log: await parseFile(file) });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "Unable to read this log." });
  }
});
