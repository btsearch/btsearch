import {
  microwaveLinkManufacturers,
  microwaveLinkSnapshotCounts,
  microwaveLinkSnapshots,
  microwaveLinkTransmitterTypes,
  microwaveLinks,
  officialDatasets,
} from "@openbts/drizzle";
import { type SQL, and, eq, max, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import { chunks } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { type MicrowaveLinkSnapshotCount, type SnapshotLinkDirection, buildMicrowaveLinkSnapshot, firstDayOfMonth } from "./snapshot.js";

const snapshotSelectSchema = createSelectSchema(microwaveLinkSnapshots);

export type MicrowaveLinkSnapshotHeader = Omit<z.infer<typeof snapshotSelectSchema>, "id">;
export type TakenMicrowaveLinkSnapshot = { header: MicrowaveLinkSnapshotHeader; counts: MicrowaveLinkSnapshotCount[] };

const COUNT_INSERT_BATCH_SIZE = 5000;

function ofSource(sourceId: number): SQL {
  return eq(officialDatasets.sourceId, sourceId);
}

export async function loadSnapshotLinkDirections(reader: Pick<DbTx, "select">, sourceId: number): Promise<SnapshotLinkDirection[]> {
  return reader
    .select({
      licenseeId: microwaveLinks.operator_id,
      permit: { number: microwaveLinks.permit_number },
      tx: { latitude: microwaveLinks.tx_latitude, longitude: microwaveLinks.tx_longitude },
      rx: { latitude: microwaveLinks.rx_latitude, longitude: microwaveLinks.rx_longitude },
      frequencyMhz: sql<number>`${microwaveLinks.freq_khz} / 1000.0`.mapWith(Number),
      polarization: microwaveLinks.polarization,
      channelWidthMhz: microwaveLinks.ch_width,
      modulation: microwaveLinks.modulation_type,
      vendor: microwaveLinkManufacturers.name,
    })
    .from(microwaveLinks)
    .innerJoin(officialDatasets, eq(officialDatasets.id, microwaveLinks.dataset_id))
    .leftJoin(microwaveLinkTransmitterTypes, eq(microwaveLinkTransmitterTypes.id, microwaveLinks.tx_transmitter_type_id))
    .leftJoin(microwaveLinkManufacturers, eq(microwaveLinkManufacturers.id, microwaveLinkTransmitterTypes.manufacturer_id))
    .where(ofSource(sourceId));
}

async function loadSpecsDate(reader: Pick<DbTx, "select">, sourceId: number): Promise<Date | null> {
  const [row] = await reader
    .select({ specsDate: max(microwaveLinks.specs_date) })
    .from(microwaveLinks)
    .innerJoin(officialDatasets, eq(officialDatasets.id, microwaveLinks.dataset_id))
    .where(ofSource(sourceId));
  return row?.specsDate ?? null;
}

export async function writeMicrowaveLinkSnapshot(
  tx: DbTx,
  header: MicrowaveLinkSnapshotHeader,
  counts: readonly MicrowaveLinkSnapshotCount[],
): Promise<void> {
  await tx
    .delete(microwaveLinkSnapshots)
    .where(and(eq(microwaveLinkSnapshots.sourceId, header.sourceId), eq(microwaveLinkSnapshots.startsOn, header.startsOn)));
  const [snapshot] = await tx.insert(microwaveLinkSnapshots).values(header).returning({ id: microwaveLinkSnapshots.id });
  if (snapshot === undefined) throw new Error(`The microwave link snapshot of source ${header.sourceId} for ${header.startsOn} was not saved`);

  for (const batch of chunks(counts, COUNT_INSERT_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop
    await tx.insert(microwaveLinkSnapshotCounts).values(batch.map((count) => ({ ...count, snapshotId: snapshot.id })));
  }
}

export async function takeMicrowaveLinkSnapshot(tx: DbTx, sourceId: number): Promise<TakenMicrowaveLinkSnapshot> {
  const takenAt = new Date();
  const [directions, specsDate] = await Promise.all([loadSnapshotLinkDirections(tx, sourceId), loadSpecsDate(tx, sourceId)]);
  const header = { sourceId, startsOn: firstDayOfMonth(takenAt.toISOString()), takenAt, specsDate };
  const counts = buildMicrowaveLinkSnapshot(directions);
  await writeMicrowaveLinkSnapshot(tx, header, counts);

  logger.info(`Microwave link snapshot: saved ${counts.length} rows of source ${sourceId} for ${header.startsOn}`);
  return { header, counts };
}
