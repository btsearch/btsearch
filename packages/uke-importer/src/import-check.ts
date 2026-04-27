import { ukeImportMetadata } from "@openbts/drizzle";
import { db } from "@openbts/drizzle/db";

type ImportType = "permits" | "radiolines" | "stations_permits" | "device_registry";

export async function getLastImportedFileNames(importType: ImportType): Promise<Set<string> | null> {
  const latestImport = await db.query.ukeImportMetadata.findFirst({
    where: {
      AND: [{ import_type: importType }, { status: "success" }],
    },
    orderBy: { last_import_date: "desc" },
  });
  if (!latestImport) return null;
  try {
    const hrefs: string[] = JSON.parse(latestImport.file_list);
    return new Set(hrefs.map((href) => href.split("/").pop() ?? href));
  } catch {
    return null;
  }
}

export async function recordImportMetadata(
  importType: ImportType,
  fileLinks: Array<{ href: string; text: string }>,
  status: "success" | "failed",
): Promise<number> {
  const fileList = JSON.stringify(fileLinks.map((l) => l.href).sort());
  const [row] = await db
    .insert(ukeImportMetadata)
    .values({
      import_type: importType,
      file_list: fileList,
      status,
    })
    .returning({ id: ukeImportMetadata.id });
  if (!row) throw new Error("Failed to record import metadata");
  return row.id;
}
