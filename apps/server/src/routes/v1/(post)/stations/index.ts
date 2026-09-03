import { bands, cells, gsmCells, locations, lteCells, nrCells, operators, stations, umtsCells } from "@openbts/drizzle";
import { DrizzleQueryError } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import postgres from "postgres";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";
import { checkCellDuplicatesBatch, checkLTEClidConsistency } from "../../../../services/cellDuplicateCheck.service.js";
import { stationStatusForCellCount } from "../../../../services/stations/status.js";
import { syncStationsPermitsAssociations } from "../../../../services/stationsPermitsAssociation.service.js";
import { validateCellARFCNsForBands } from "../../../../utils/cellARFCNValidation.js";
import { logger } from "../../../../utils/logger.js";
import { type RATInsertDetails, insertRATCellDetails, isNormalRat } from "../../../../utils/ratCellPersistence.js";
import { INSERT_OMIT, lteNullableFields, nrExtendFields, umtsNullableFields } from "../../../../utils/ratCellSchemas.js";
import { makeDetailsRatRefine, validateCellDuplicates } from "../../../../utils/submission.helpers.js";

const stationsInsertSchema = createInsertSchema(stations).omit({ extra_address: true, status: true, statusChangedAt: true });
const stationSchema = createSelectSchema(stations);
const cellsSchema = createSelectSchema(cells).omit({ band_id: true });
const bandsSchema = createSelectSchema(bands);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true });
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true });
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true });
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true });
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const locationSchema = createSelectSchema(locations).omit({ point: true });
const operatorSchema = createSelectSchema(operators);
const STATION_IDENTITY_CONSTRAINT = "stations_station_id_operator_unique";
const baseCellsInsertSchema = createInsertSchema(cells).omit({ createdAt: true, updatedAt: true }).strict();
const gsmInsertSchema = createInsertSchema(gsmCells)
  .omit(INSERT_OMIT)
  .extend({ lac: z.number().int().min(0).max(65535), cid: z.number().int().min(0).max(65535) });
const umtsInsertSchema = createInsertSchema(umtsCells)
  .omit(INSERT_OMIT)
  .extend({ ...umtsNullableFields, rnc: z.number().int().min(0).max(65535), cid: z.number().int().min(0).max(65535) });
const lteInsertSchema = createInsertSchema(lteCells)
  .omit(INSERT_OMIT)
  .extend({
    tac: z.number().int().min(0).max(65535).nullable().optional(),
    enbid: z.number().int().min(0).max(1048575),
    clid: z.number().int().min(0).max(255),
    ...lteNullableFields,
  });
const nrInsertSchema = createInsertSchema(nrCells)
  .omit(INSERT_OMIT)
  .extend(nrExtendFields)
  .superRefine((data, ctx) => {
    if (data.type === "nsa") {
      for (const field of ["nrtac", "clid", "gnbid"] as const) {
        if (data[field] !== null && data[field] !== undefined)
          ctx.addIssue({ code: "custom", message: `${field} must not be set for NSA NR cells`, path: [field] });
      }
      if (data.supports_nr_redcap === true) {
        ctx.addIssue({ code: "custom", message: "supports_nr_redcap must not be set for NSA NR cells", path: ["supports_nr_redcap"] });
      }
    }
  });
const cellWithDetailsInsert = baseCellsInsertSchema
  .extend({ details: z.unknown().optional() })
  .superRefine(makeDetailsRatRefine({ GSM: gsmInsertSchema, UMTS: umtsInsertSchema, LTE: lteInsertSchema, NR: nrInsertSchema }));

type ReqBody = {
  Body: z.infer<typeof stationsInsertSchema> & { cells: z.infer<typeof cellWithDetailsInsert>[] };
};
type CellResponse = z.infer<typeof cellsSchema> & { band: z.infer<typeof bandsSchema>; details: z.infer<typeof cellDetailsSchema> };
type ResponseData = z.infer<typeof stationSchema> & {
  cells: CellResponse[];
  location: z.infer<typeof locationSchema>;
  operator: z.infer<typeof operatorSchema>;
};
const schemaRoute = {
  body: stationsInsertSchema.extend({
    cells: z.array(cellWithDetailsInsert),
  }),
  response: {
    200: z.object({
      data: stationSchema.extend({
        cells: z.array(cellsSchema.extend({ band: bandsSchema, details: cellDetailsSchema })),
        location: locationSchema,
        operator: operatorSchema,
      }),
    }),
  },
};

function isStationIdentityUniqueViolation(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return cause instanceof postgres.PostgresError && cause.code === "23505" && cause.constraint_name === STATION_IDENTITY_CONSTRAINT;
}

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { cells: cellsData, ...stationData } = req.body;

  validateCellDuplicates(cellsData);
  await checkLTEClidConsistency(
    null,
    cellsData.map((cell) => ({ rat: cell.rat, details: cell.details as Record<string, unknown> | undefined })),
    [],
    stationData.operator_id,
  );

  if (stationData.operator_id && cellsData && cellsData.length > 0) {
    await checkCellDuplicatesBatch(
      cellsData.map((cell) => ({ rat: cell.rat, details: cell.details as Record<string, unknown> | undefined })),
      stationData.operator_id,
    );
  }

  await validateCellARFCNsForBands(cellsData.map((cell) => ({ rat: cell.rat, band_id: cell.band_id, details: cell.details })));

  try {
    const station = await db.transaction(async (tx) => {
      const now = new Date();
      const [newStation] = await tx
        .insert(stations)
        .values({
          ...stationData,
          status: stationStatusForCellCount(cellsData.length),
          statusChangedAt: now,
          updatedAt: now,
          createdAt: now,
        })
        .returning();

      if (!newStation) throw new ErrorResponse("FAILED_TO_CREATE");

      if (cellsData.length > 0) {
        const createdCells = await tx
          .insert(cells)
          .values(
            cellsData.map((cell) => ({
              ...cell,
              station_id: newStation.id,
              updatedAt: now,
              createdAt: now,
            })),
          )
          .returning();

        await Promise.all(
          createdCells.map(async (row, idx) => {
            const details = cellsData[idx]?.details;
            if (!details) return;
            if (isNormalRat(row.rat)) await insertRATCellDetails(tx, row.rat, row.id, details as RATInsertDetails);
          }),
        );
      }

      const full = await tx.query.stations.findFirst({
        where: {
          id: newStation.id,
        },
        with: {
          cells: { with: { band: true, gsm: true, umts: true, lte: true, nr: true }, columns: { band_id: false } },
          location: { columns: { point: false } },
          operator: true,
        },
      });
      if (!full) {
        tx.rollback();
        throw new ErrorResponse("NOT_FOUND");
      }

      const cellsWithDetails = (
        full.cells as Array<
          z.infer<typeof cellsSchema> & {
            band: z.infer<typeof bandsSchema>;
            gsm?: z.infer<typeof gsmCellsSchema>;
            umts?: z.infer<typeof umtsCellsSchema>;
            lte?: z.infer<typeof lteCellsSchema>;
            nr?: z.infer<typeof nrCellsSchema>;
          }
        >
      ).map((cell) => {
        const { gsm, umts, lte, nr, band, ...rest } = cell;
        const details: z.infer<typeof cellDetailsSchema> = gsm ?? umts ?? lte ?? nr ?? null;
        return { ...rest, band, details } as CellResponse;
      });

      const response: ResponseData = { ...full, cells: cellsWithDetails } as ResponseData;

      await createAuditLog(
        {
          action: "stations.create",
          table_name: "stations",
          record_id: response.id,
          old_values: null,
          new_values: response,
        },
        req,
        tx,
      );

      if (response.cells.length > 0) {
        const auditCells = response.cells.map(({ band, ...cell }) => ({ ...cell, band_id: band.id }));
        await createAuditLog(
          {
            action: "cells.create",
            table_name: "cells",
            record_id: null,
            new_values: { cells: auditCells },
            metadata: { station_id: response.id },
          },
          req,
          tx,
        );
      }

      return response;
    });

    void syncStationsPermitsAssociations().catch((e) =>
      logger.error("Failed to sync stations_permits after station creation", { error: e instanceof Error ? e.message : String(e) }),
    );

    return res.send({ data: station });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    if (isStationIdentityUniqueViolation(error))
      throw new ErrorResponse("DUPLICATE_ENTRY", {
        message: `A station with station ID ${stationData.station_id} already exists for this operator`,
      });
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createStation: Route<ReqBody, ResponseData> = {
  url: "/stations",
  method: "POST",
  config: { permissions: ["write:stations"] },
  schema: schemaRoute,
  handler,
};

export default createStation;
