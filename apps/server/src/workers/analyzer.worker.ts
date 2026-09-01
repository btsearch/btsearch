import { parentPort } from "node:worker_threads";

import { type CellInput, type LookupMaps, resolveAllCells } from "../services/analyzer/logic.js";

if (!parentPort) throw new Error("This file must be run as a worker thread");

type WorkerMessage = {
  cells: CellInput[];
  maps: LookupMaps<unknown>;
};

parentPort.on("message", ({ cells, maps }: WorkerMessage) => {
  try {
    const results = resolveAllCells(cells, maps);
    parentPort!.postMessage({ success: true, result: JSON.stringify(results) });
  } catch (e) {
    parentPort!.postMessage({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});
