import "dotenv/config";
import { sql } from "@openbts/drizzle/db";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { type DatabaseMonthlyStats, getDatabaseMonthlyStats } from "./data.ts";
import { type Language, previousMonth } from "./format.ts";
import { buildDiscordMessage } from "./message.ts";
import { BAND_METRICS, renderMonthlyStatsImage } from "./render.ts";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const LANGUAGES: readonly Language[] = ["pl", "en"];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lang: { type: "string" },
    out: { type: "string" },
  },
});

function isLanguage(value: string): value is Language {
  return LANGUAGES.some((language) => language === value);
}

function printSummary(stats: DatabaseMonthlyStats): void {
  console.log(`Added from ${stats.from} to ${stats.to} (added / total at the end of the period)`);
  console.table(
    Object.fromEntries(
      stats.operators.map((row) => [
        row.operator.name,
        {
          stations: `+${row.stations_added} / ${row.stations}`,
          cells: `+${row.cells_added} / ${row.cells}`,
          pci: `+${row.pcis_added} / ${row.pcis}`,
          azimuths: `+${row.azimuths_added} / ${row.azimuths}`,
          networks_ids: `+${row.networks_ids_added} / ${row.networks_ids}`,
          photos: `+${row.photos_added} / ${row.photos}`,
        },
      ]),
    ),
  );
  console.log(`Photos, each counted once across operators and locations: +${stats.photos.added} / ${stats.photos.total}`);
}

async function main(): Promise<void> {
  const month = positionals[0] ?? new Date().toISOString().slice(0, 7);
  const language = values.lang ?? "pl";
  if (!MONTH_PATTERN.test(month)) throw new Error(`Expected a month like 2026-09, got "${month}"`);
  if (!isLanguage(language)) throw new Error(`Expected --lang pl or --lang en, got "${language}"`);

  const now = new Date();
  const [stats, previous] = await Promise.all([getDatabaseMonthlyStats(month, now), getDatabaseMonthlyStats(previousMonth(month), now)]);
  if (stats.from === null || stats.to === null) {
    console.log(`${month} hasn't started yet`);
    return;
  }
  if (stats.operators.length === 0) {
    console.log(`No data for ${month}`);
    return;
  }

  printSummary(stats);

  const outDir = resolve(values.out ?? ".");
  await mkdir(outDir, { recursive: true });
  const files = await Promise.all(
    BAND_METRICS.map(async (metric) => {
      const file = resolve(outDir, `btsearch-database-${month}-${metric}.png`);
      await writeFile(file, await renderMonthlyStatsImage(stats, month, metric, language));
      return file;
    }),
  );
  const message = buildDiscordMessage(stats, previous, month, language);
  const messageFile = resolve(outDir, `btsearch-database-${month}-discord.md`);
  await writeFile(messageFile, `${message}\n`);
  for (const file of [...files, messageFile]) console.log(`Saved ${file}`);
  console.log(`\n${message}`);
}

main()
  .catch((error: unknown) => {
    console.error("monthly stats failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
    process.exit();
  });
