import { config } from "dotenv";
import path from "node:path";

import { KMZ_OUTPUT_DIR } from "../config.js";
import { sql } from "../database.js";
import { generateRadiolinesKmz } from "./radiolines.ts";
import { generateStationsKmz } from "./stations.ts";

config();

const OUTPUT_DIR = process.argv[2] || KMZ_OUTPUT_DIR;

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  try {
    const dateStart = new Date();
    console.log(`KMZ Generator started at ${dateStart.toISOString()}`);

    const dateStr = todayDateStr();
    const dateDir = path.join(OUTPUT_DIR, dateStr);

    await generateStationsKmz(path.join(dateDir, "stations"), dateStr);
    await generateRadiolinesKmz(path.join(dateDir, "radiolines"), dateStr);

    const dateEnd = new Date();
    const duration = (dateEnd.getTime() - dateStart.getTime()) / 1000;
    console.log(`KMZ generation finished in ${duration.toFixed(2)}s`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
