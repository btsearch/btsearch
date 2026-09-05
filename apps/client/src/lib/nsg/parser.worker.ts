import { parseNsgStream } from "./parser";
import type { NsgWorkerRequest, NsgWorkerResponse } from "./types";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function send(message: NsgWorkerResponse): void {
  scope.postMessage(message);
}

scope.addEventListener("message", async (event: MessageEvent<NsgWorkerRequest>) => {
  if (event.data.type !== "parse") return;
  const { file } = event.data;
  try {
    const log = await parseNsgStream(file.stream(), { name: file.name, size: file.size }, (progress) => send({ type: "progress", progress }));
    send({ type: "complete", log });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "Unable to read this NSG log." });
  }
});
