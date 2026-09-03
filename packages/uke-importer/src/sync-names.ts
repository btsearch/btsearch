import { sql as dbClient } from "./database.js";
import { runMnoNameSync } from "./sync-names/run.js";

try {
  await runMnoNameSync(process.argv.slice(2));
} finally {
  await dbClient.end({ timeout: 5 });
}
