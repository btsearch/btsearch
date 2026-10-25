import { readerVersions, readers } from "@openbts/drizzle";
import type { MeasurementReaderVersion } from "@openbts/shared/contract";
import { asc, eq } from "drizzle-orm";

import db from "../../../database/psql.js";

export async function listReaderVersions(): Promise<MeasurementReaderVersion[]> {
  const rows = await db
    .select({ version: readerVersions, source: readers.source })
    .from(readerVersions)
    .innerJoin(readers, eq(readers.name, readerVersions.readerName))
    .orderBy(asc(readerVersions.readerName), asc(readerVersions.firstSeenAt), asc(readerVersions.id));
  return rows.map(({ version, source }) => ({
    id: version.id,
    reader: version.readerName,
    source,
    version: version.version,
    firstSeenAt: version.firstSeenAt.toISOString(),
  }));
}
