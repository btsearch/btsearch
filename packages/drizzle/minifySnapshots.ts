import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const migrationsFolder = "./migrations";

async function minifySnapshot(folderName: string) {
  const snapshotPath = join(migrationsFolder, folderName, "snapshot.json");
  const contents = await readFile(snapshotPath, "utf8").catch(() => null);
  if (contents === null) return;

  const minified = JSON.stringify(JSON.parse(contents));
  if (minified !== contents) await writeFile(snapshotPath, minified);
}

const folders = await readdir(migrationsFolder, { withFileTypes: true });

await Promise.all(folders.filter((folder) => folder.isDirectory()).map((folder) => minifySnapshot(folder.name)));
