import type { NsgWorkerRequest, NsgWorkerResponse } from "./protocol";
import { parseNsg } from "@/lib/nsg-parser";
import { openNsgFile } from "@/lib/nsg-parser/browser";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function send(message: NsgWorkerResponse): void {
  scope.postMessage(message);
}

scope.addEventListener("message", async (event: MessageEvent<NsgWorkerRequest>) => {
  if (event.data.type !== "parse") return;
  const { file } = event.data;
  try {
    const { stream, source } = await openNsgFile(file);
    const log = await parseNsg(
      { stream, source },
      { allowIncompleteFinalRecord: true, onProgress: (progress) => send({ type: "progress", progress }) },
    );
    send({ type: "complete", log });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "Unable to read this NSG log." });
  }
});
