import { isAnalyzerImportError } from "../analyzer/analyzer-import";
import { parseNsgAnalyzerStream } from "./analyzer";
import type { NsgAnalyzerWorkerRequest, NsgAnalyzerWorkerResponse } from "./analyzer";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function send(message: NsgAnalyzerWorkerResponse): void {
  scope.postMessage(message);
}

scope.addEventListener("message", async (event: MessageEvent<NsgAnalyzerWorkerRequest>) => {
  if (event.data.type !== "parse") return;
  const { file } = event.data;
  try {
    const result = await parseNsgAnalyzerStream(file.stream(), { name: file.name, size: file.size }, (progress) =>
      send({ type: "progress", progress }),
    );
    send({ type: "complete", result });
  } catch (error) {
    send({
      type: "error",
      code: isAnalyzerImportError(error) ? error.code : "readFailed",
      message: error instanceof Error ? error.message : "Unable to read this NSG log.",
    });
  }
});
