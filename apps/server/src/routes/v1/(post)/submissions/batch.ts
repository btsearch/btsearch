import { cells, lteCells, stations } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";
import { notifyStaffNewSubmission } from "../../../../services/notifications/service.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";
import {
  type SingleSubmission,
  type SubmissionWithExtras,
  processSubmission,
  proposedCellInsert,
  proposedLocationInsert,
  proposedStationInsert,
  singleSubmissionSchema,
  submissionsSelectSchema,
  validateSubmission,
} from "../../../../services/submissions/create.js";
import { logger } from "../../../../utils/logger.js";

const ITEMS_CAP = 25;
const ANALYZER_SYSTEM_NOTE = "System: Zgłoszono przez analizator. Mogą być błędy";

const requestSchema = z.object({
  submitter_note: z.string().max(2000).optional(),
  items: z.array(singleSubmissionSchema).min(1).max(ITEMS_CAP),
});

type ReqBody = { Body: z.infer<typeof requestSchema> };
const schemaRoute = {
  body: requestSchema,
  response: {
    200: z.object({
      data: z.array(
        submissionsSelectSchema.extend({
          proposedStation: proposedStationInsert.optional(),
          proposedLocation: proposedLocationInsert.optional(),
          cells: z.array(proposedCellInsert).optional(),
        }),
      ),
    }),
  },
};

type ResponseData = z.infer<typeof submissionsSelectSchema>[];

function addStationTac(stationTacs: Map<number, number>, stationId: number, tac: number): void {
  const existingTac = stationTacs.get(stationId);
  if (existingTac !== undefined && existingTac !== tac)
    throw new ErrorResponse("BAD_REQUEST", { message: `Multiple TAC values submitted for station ${stationId}` });
  stationTacs.set(stationId, tac);
}

async function expandLteTacUpdates(inputs: SingleSubmission[]): Promise<SingleSubmission[]> {
  const tacByStationId = new Map<number, number>();

  for (const input of inputs) {
    if (!input.station_id) continue;
    for (const cell of input.cells ?? []) {
      if (cell.operation === "delete" || cell.rat !== "LTE") continue;
      const details = cell.details as { tac?: number | null } | undefined;
      if (details?.tac !== null && details?.tac !== undefined) addStationTac(tacByStationId, input.station_id, details.tac);
    }
  }

  if (tacByStationId.size === 0) return inputs;

  const stationCells = await db
    .select({
      stationId: cells.station_id,
      cellId: cells.id,
      bandId: cells.band_id,
      enbid: lteCells.enbid,
      clid: lteCells.clid,
      tac: lteCells.tac,
      pci: lteCells.pci,
      earfcn: lteCells.earfcn,
      supports_iot: lteCells.supports_iot,
    })
    .from(cells)
    .innerJoin(lteCells, eq(lteCells.cell_id, cells.id))
    .where(inArray(cells.station_id, [...tacByStationId.keys()]));

  const lteCellsByStationId = new Map<number, typeof stationCells>();
  for (const cell of stationCells) {
    const stationCells = lteCellsByStationId.get(cell.stationId) ?? [];
    stationCells.push(cell);
    lteCellsByStationId.set(cell.stationId, stationCells);
  }

  return inputs.map((input) => {
    if (!input.station_id) return input;
    const tac = tacByStationId.get(input.station_id);
    if (tac === undefined) return input;

    const inputCells = (input.cells ?? []).map((cell) => {
      if (cell.operation === "delete" || cell.rat !== "LTE") return cell;
      return { ...cell, details: { ...(cell.details as Record<string, unknown> | undefined), tac } };
    });
    const existingCellIds = new Set(inputCells.map((cell) => cell.target_cell_id).filter((id): id is number => id !== null && id !== undefined));
    const expandedCells = [...inputCells];

    for (const cell of lteCellsByStationId.get(input.station_id) ?? []) {
      if (cell.tac === tac || existingCellIds.has(cell.cellId)) continue;
      expandedCells.push({
        operation: "update",
        target_cell_id: cell.cellId,
        station_id: input.station_id,
        band_id: cell.bandId,
        rat: "LTE",
        details: {
          enbid: cell.enbid,
          clid: cell.clid,
          tac,
          pci: cell.pci,
          earfcn: cell.earfcn,
          supports_iot: cell.supports_iot,
        },
      });
    }

    return { ...input, cells: expandedCells };
  });
}

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FORBIDDEN");
  const userSession = req.userSession;
  if (!userSession?.user?.id) throw new ErrorResponse("UNAUTHORIZED");
  const userId = userSession.user.id;

  const { submitter_note, items } = req.body;
  const effective_note = submitter_note
    ? `${submitter_note}
${ANALYZER_SYSTEM_NOTE}`
    : ANALYZER_SYSTEM_NOTE;

  const stationsWithTooFewCells = items.filter((item) => (item.cells?.length ?? 0) < 1);
  if (stationsWithTooFewCells.length > 0) {
    throw new ErrorResponse("BAD_REQUEST", { message: "Each station must have at least 1 cell changes in a batch submission" });
  }

  const submissionInputs: SingleSubmission[] = items.map((item) => ({
    ...item,
    submitter_note: item.submitter_note ?? effective_note,
  }));

  await Promise.all(submissionInputs.map(validateSubmission));
  const expandedSubmissionInputs = await expandLteTacUpdates(submissionInputs);

  try {
    const results = await db.transaction(async (tx) => {
      const created: SubmissionWithExtras[] = [];
      for (const input of expandedSubmissionInputs) {
        // eslint-disable-next-line no-await-in-loop
        created.push(await processSubmission(tx, input, userId));
      }
      return created;
    });

    await Promise.all(
      results.map((submission) =>
        createAuditLog(
          {
            action: "submissions.create",
            table_name: "submissions",
            record_id: undefined,
            old_values: null,
            new_values: submission,
            metadata: { submission_id: submission.id },
          },
          req,
        ),
      ),
    );

    const submitterName = userSession.user.name || userSession.user.username || "Unknown";
    const stationIdsToResolve = results.filter((s) => !s.proposedStation?.station_id && s.station_id).map((s) => s.station_id!);
    const uniqueStationIds = Array.from(new Set(stationIdsToResolve));
    const resolvedStations =
      uniqueStationIds.length > 0
        ? await db.select({ id: stations.id, station_id: stations.station_id }).from(stations).where(inArray(stations.id, uniqueStationIds))
        : [];
    const stationIdMap = new Map(resolvedStations.map((s) => [s.id, s.station_id]));

    for (const submission of results) {
      if (
        submission.pending_photos &&
        !submission.proposedStation &&
        !submission.proposedLocation &&
        (!submission.cells || submission.cells.length === 0) &&
        !submission.submitter_note
      )
        continue;

      const stationStringId = submission.proposedStation?.station_id ?? (submission.station_id ? stationIdMap.get(submission.station_id) : undefined);

      void notifyStaffNewSubmission({
        submissionId: submission.id,
        submitterName,
        submissionType: submission.type ?? "new",
        stationId: stationStringId ?? undefined,
      }).catch((e) => logger.error("Failed to notify staff about new submission", { error: e }));
    }

    return res.send({ data: results });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: error instanceof Error ? error.message : "Unknown error", cause: error });
  }
}

const createSubmissionBatch: Route<ReqBody, ResponseData> = {
  url: "/submissions/batch",
  method: "POST",
  config: { permissions: ["write:submissions"] },
  schema: schemaRoute,
  handler,
};

export default createSubmissionBatch;
