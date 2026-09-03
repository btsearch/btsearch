import { sql } from "./database.js";
import { importDeviceRegistry } from "./device-registry.js";
import { importRadiolines } from "./radiolines.js";
import { associateStationsWithPermits, importPermits } from "./stations.js";
import { cleanupOrphanedUkeStations } from "./uke-stations.js";
import { cleanupDownloads } from "./utils.js";

async function main(): Promise<void> {
  try {
    const dateStart = new Date();
    console.log(`UKE Importer started at ${dateStart.toISOString()}`);
    await importPermits();
    await importRadiolines();
    await importDeviceRegistry();
    const orphanedStations = await cleanupOrphanedUkeStations();
    if (orphanedStations > 0) console.log(`Deleted ${orphanedStations} orphaned UKE stations`);
    await associateStationsWithPermits();
    const dateEnd = new Date();
    console.log(`UKE Importer finished at ${dateEnd.toISOString()}`);
    const duration = (dateEnd.getTime() - dateStart.getTime()) / 1000;
    console.log(`Total duration: ${duration.toFixed(2)} seconds`);
  } finally {
    await cleanupDownloads();
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
