import { parentPort, workerData } from "node:worker_threads";

if (!parentPort) throw new Error("This file must be run as a worker thread");

const task = workerData?.task as string;

let didComplete = false;
const warnings: string[] = [];

const originalLog = console.log;
console.log = (...args: unknown[]) => {
  originalLog(...args);
  const message = args.join(" ");
  if (message.includes("Import completed successfully")) didComplete = true;
};

try {
  switch (task) {
    case "importPermits": {
      const { importPermits } = await import("@openbts/uke-importer/stations");
      await importPermits();
      break;
    }
    case "importRadiolines": {
      const { importRadiolines } = await import("@openbts/uke-importer/radiolines");
      const result = await importRadiolines();
      warnings.push(...result.warnings);
      break;
    }
    case "importDeviceRegistry": {
      const { importDeviceRegistry } = await import("@openbts/uke-importer/device-registry");
      await importDeviceRegistry();
      break;
    }
    default:
      throw new Error(`Unknown task: ${task}`);
  }

  parentPort.postMessage({ success: true, result: didComplete, warnings });
} catch (e) {
  parentPort.postMessage({ success: false, error: e instanceof Error ? e.message : String(e) });
}
