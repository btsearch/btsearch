import {
  attachments,
  locationPhotos,
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedSectors,
  proposedStations,
  proposedUMTSCells,
  stations,
  submissionLocationPhotoSelections,
  submissions,
  users,
} from "@openbts/drizzle";
import { and, asc, eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../plugins/auth/utils.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";

const submissionsSchema = createSelectSchema(submissions);
const stationsSchema = createSelectSchema(stations);
const userSchema = createSelectSchema(users).pick({ id: true, name: true, image: true, username: true });
const proposedCellsSchema = createSelectSchema(proposedCells);
const proposedSectorsSchema = createSelectSchema(proposedSectors);
const gsmSchema = createSelectSchema(proposedGSMCells).omit({ proposed_cell_id: true });
const umtsSchema = createSelectSchema(proposedUMTSCells).omit({ proposed_cell_id: true });
const lteSchema = createSelectSchema(proposedLTECells).omit({ proposed_cell_id: true });
const nrSchema = createSelectSchema(proposedNRCells).omit({ proposed_cell_id: true });
const proposedDetailsSchema = z.union([gsmSchema, umtsSchema, lteSchema, nrSchema]).nullable();
const locationPhotoDetailsSchema = createSelectSchema(locationPhotos)
  .pick({ id: true, note: true })
  .extend({
    attachment_uuid: z.string(),
    mime_type: z.string(),
    taken_at: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    author: z.object({ uuid: z.string(), username: z.string(), name: z.string() }).nullable(),
  });
const locationPhotoSelectionSchema = locationPhotoDetailsSchema.extend({ is_main: z.boolean() });

const schemaRoute = {
  params: z.object({
    id: z.coerce.string<string>(),
  }),
  response: {
    200: z.object({
      data: submissionsSchema.extend({
        station: stationsSchema.nullable(),
        submitter: userSchema.nullable(),
        reviewer: userSchema.nullable(),
        proposedLocation: createSelectSchema(proposedLocations).nullable(),
        proposedStation: createSelectSchema(proposedStations).nullable(),
        sectors: z.array(proposedSectorsSchema),
        cells: z.array(proposedCellsSchema.extend({ details: proposedDetailsSchema })),
        locationPhotoSelections: z.array(locationPhotoSelectionSchema),
        locationPhotoRemovalSelections: z.array(locationPhotoDetailsSchema),
      }),
    }),
  },
};
type ReqParams = { Params: { id: string } };
type LocationPhotoDetails = z.infer<typeof locationPhotoDetailsSchema>;
type LocationPhotoSelection = z.infer<typeof locationPhotoSelectionSchema>;
type Submission = z.infer<typeof submissionsSchema> & {
  station: z.infer<typeof stationsSchema> | null;
  submitter: z.infer<typeof userSchema> | null;
  reviewer: z.infer<typeof userSchema> | null;
  sectors: z.infer<typeof proposedSectorsSchema>[];
  cells: Array<z.infer<typeof proposedCellsSchema> & { details: z.infer<typeof proposedDetailsSchema> }>;
  locationPhotoSelections: LocationPhotoSelection[];
  locationPhotoRemovalSelections: LocationPhotoDetails[];
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Submission>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FORBIDDEN");
  const { id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");
  const hasAdminPermission = (await verifyPermissions(session.user.id, { submissions: ["read"] })) || false;

  const submission = await db.query.submissions.findFirst({
    where: {
      id: id,
    },
    with: {
      station: true,
      submitter: {
        columns: {
          id: true,
          name: true,
          image: true,
          username: true,
        },
      },
      reviewer: {
        columns: {
          id: true,
          name: true,
          image: true,
          username: true,
        },
      },
      proposedLocation: true,
      proposedStation: true,
    },
  });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (!hasAdminPermission && submission.submitter_id !== session.user.id) throw new ErrorResponse("NOT_FOUND");

  const [rawSectors, rawCells] = await Promise.all([
    db.query.proposedSectors.findMany({ where: { submission_id: id }, orderBy: { id: "asc" } }),
    db.query.proposedCells.findMany({
      where: {
        submission_id: id,
      },
      with: {
        gsm: true,
        umts: true,
        lte: true,
        nr: true,
      },
    }),
  ]);

  const cells = rawCells.map(({ gsm, umts, lte, nr, ...base }) => ({
    ...base,
    details: gsm ?? umts ?? lte ?? nr ?? null,
  }));

  const [rawLocationPhotoSels, rawLocationPhotoRemovalSels] = await Promise.all([
    db
      .select({
        id: locationPhotos.id,
        attachment_uuid: attachments.uuid,
        mime_type: attachments.mime_type,
        note: locationPhotos.note,
        taken_at: locationPhotos.taken_at,
        createdAt: locationPhotos.createdAt,
        author_uuid: users.id,
        author_username: users.username,
        author_name: users.name,
        is_main: submissionLocationPhotoSelections.is_main,
      })
      .from(submissionLocationPhotoSelections)
      .innerJoin(locationPhotos, eq(submissionLocationPhotoSelections.location_photo_id, locationPhotos.id))
      .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
      .leftJoin(users, eq(locationPhotos.uploaded_by, users.id))
      .where(and(eq(submissionLocationPhotoSelections.submission_id, id), eq(submissionLocationPhotoSelections.is_removal, false)))
      .orderBy(asc(locationPhotos.createdAt)),
    db
      .select({
        id: locationPhotos.id,
        attachment_uuid: attachments.uuid,
        mime_type: attachments.mime_type,
        note: locationPhotos.note,
        taken_at: locationPhotos.taken_at,
        createdAt: locationPhotos.createdAt,
        author_uuid: users.id,
        author_username: users.username,
        author_name: users.name,
      })
      .from(submissionLocationPhotoSelections)
      .innerJoin(locationPhotos, eq(submissionLocationPhotoSelections.location_photo_id, locationPhotos.id))
      .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
      .leftJoin(users, eq(locationPhotos.uploaded_by, users.id))
      .where(and(eq(submissionLocationPhotoSelections.submission_id, id), eq(submissionLocationPhotoSelections.is_removal, true)))
      .orderBy(asc(locationPhotos.createdAt)),
  ]);

  const locationPhotoSelections: LocationPhotoSelection[] = rawLocationPhotoSels.map((r) => ({
    id: r.id,
    attachment_uuid: r.attachment_uuid,
    mime_type: r.mime_type,
    note: r.note,
    taken_at: r.taken_at?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    author: r.author_uuid && r.author_username && r.author_name ? { uuid: r.author_uuid, username: r.author_username, name: r.author_name } : null,
    is_main: r.is_main,
  }));
  const locationPhotoRemovalSelections: LocationPhotoDetails[] = rawLocationPhotoRemovalSels.map((r) => ({
    id: r.id,
    attachment_uuid: r.attachment_uuid,
    mime_type: r.mime_type,
    note: r.note,
    taken_at: r.taken_at?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    author: r.author_uuid && r.author_username && r.author_name ? { uuid: r.author_uuid, username: r.author_username, name: r.author_name } : null,
  }));

  return res.send({ data: { ...submission, sectors: rawSectors, cells, locationPhotoSelections, locationPhotoRemovalSelections } });
}

const getSubmission: Route<ReqParams, Submission> = {
  url: "/submissions/:id",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getSubmission;
