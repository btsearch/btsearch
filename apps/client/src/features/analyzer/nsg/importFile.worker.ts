import { isAnalyzerImportError } from "@/lib/analyzer/analyzer-import";
import { openNsgFile } from "@/lib/nsg-parser/browser";

import { parseNsgAnalyzerStream } from "./parseImport";
import type { NsgAnalyzerWorkerRequest, NsgAnalyzerWorkerResponse } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function send(message: NsgAnalyzerWorkerResponse): void {
  scope.postMessage(message);
}

scope.addEventListener("message", async (event: MessageEvent<NsgAnalyzerWorkerRequest>) => {
  if (event.data.type !== "parse") return;
  const { file } = event.data;
  try {
    const { stream, source } = await openNsgFile(file);
    const result = await parseNsgAnalyzerStream(stream, source, (progress) => send({ type: "progress", progress }));
    send({ type: "complete", result });
  } catch (error) {
    send({
      type: "error",
      code: isAnalyzerImportError(error) ? error.code : "readFailed",
      message: error instanceof Error ? error.message : "Unable to read this NSG log.",
    });
  }
});
