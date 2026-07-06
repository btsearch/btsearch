import { cells, stationSectors } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import z from "zod";

import { ErrorResponse } from "../../../../../../errors.ts";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.ts";
import { createAuditLog } from "../../../../../../services/auditLog.service.ts";
import type { DbTx } from "../../../../../../types/global.ts";

const sectorInputSchema = z.object({
  id: z.number().int().optional(),
  azimuth: z.number().int().min(0).max(360),
});
const sectorSchema = createSelectSchema(stationSectors).omit({ station_id: true });
const MAX_SECTORS = 15;

const schemaRoute = {
  params: z.object({ station_id: z.coerce.number() }),
  body: z.object({ sectors: z.array(sectorInputSchema) }),
  response: { 200: z.object({ data: z.array(sectorSchema) }) },
};
type ReqBodyParams = { Params: z.infer<typeof schemaRoute.params>; Body: z.infer<typeof schemaRoute.body> };
type SectorInput = z.infer<typeof sectorInputSchema>;
type SectorRow = z.infer<typeof sectorSchema>;
type ResBody = SectorRow[];

function findPreviousSector(
  sector: SectorInput,
  previousById: ReadonlyMap<number, SectorRow>,
  previousSectors: SectorRow[],
  usedPreviousIds: ReadonlySet<number>,
): SectorRow | undefined {
  if (sector.id !== undefined) return previousById.get(sector.id);

  return previousSectors.find((previous) => previous.azimuth === sector.azimuth && !usedPreviousIds.has(previous.id));
}

async function saveSector(tx: DbTx, stationId: number, sector: SectorInput, previous?: SectorRow): Promise<SectorRow | null> {
  if (previous) {
    if (previous.azimuth !== sector.azimuth)
      await tx
        .update(stationSectors)
        .set({ azimuth: sector.azimuth })
        .where(and(eq(stationSectors.id, previous.id), eq(stationSectors.station_id, stationId)));

    return { id: previous.id, azimuth: sector.azimuth };
  }

  const [inserted] = await tx
    .insert(stationSectors)
    .values({ station_id: stationId, azimuth: sector.azimuth })
    .returning({ id: stationSectors.id, azimuth: stationSectors.azimuth });
  return inserted ?? null;
}

async function deleteUnusedSectors(tx: DbTx, deletedIds: number[]): Promise<void> {
  if (deletedIds.length === 0) return;

  const [assignedResult] = await tx.select({ value: count() }).from(cells).where(inArray(cells.sector_id, deletedIds));
  if (Number(assignedResult?.value ?? 0) > 0)
    throw new ErrorResponse("BAD_REQUEST", { message: "Cannot delete sectors that are already assigned to cells" });

  await tx.delete(stationSectors).where(inArray(stationSectors.id, deletedIds));
}

async function handler(req: FastifyRequest<ReqBodyParams>, res: ReplyPayload<JSONBody<ResBody>>) {
  const { station_id } = req.params;
  const { sectors } = req.body;
  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const previousSectors = await db.query.stationSectors.findMany({
    where: { station_id },
    columns: { station_id: false },
    orderBy: { id: "asc" },
  });

  if (sectors.length > MAX_SECTORS)
    throw new ErrorResponse("BAD_REQUEST", { message: `Too many sectors for the station. Maximum allowed is ${MAX_SECTORS}` });

  const result = await db.transaction(async (tx) => {
    const previousById = new Map(previousSectors.map((sector) => [sector.id, sector]));
    const retainedSectorIds = new Set<number>();
    const sectorPlan = sectors.map((sector) => {
      const matchingPrevious = findPreviousSector(sector, previousById, previousSectors, retainedSectorIds);
      if (matchingPrevious) retainedSectorIds.add(matchingPrevious.id);
      return { sector, matchingPrevious };
    });

    const savedSectors = await Promise.all(sectorPlan.map(({ sector, matchingPrevious }) => saveSector(tx, station_id, sector, matchingPrevious)));
    const nextSectors = savedSectors.filter((sector): sector is SectorRow => sector !== null);

    const deletedIds = previousSectors.filter((sector) => !retainedSectorIds.has(sector.id)).map((sector) => sector.id);
    await deleteUnusedSectors(tx, deletedIds);

    return nextSectors;
  });

  await createAuditLog(
    {
      action: "stations.update",
      table_name: "station_sectors",
      record_id: station_id,
      old_values: previousSectors,
      new_values: result,
      metadata: { station_id },
    },
    req,
  );

  return res.send({ data: result });
}

const putSectors: Route<ReqBodyParams, ResBody> = {
  url: "/stations/:station_id/sectors",
  method: "PUT",
  config: { permissions: ["write:stations"] },
  schema: schemaRoute,
  handler,
};

export default putSectors;
