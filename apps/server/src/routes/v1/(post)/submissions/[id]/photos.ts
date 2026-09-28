import type { MultipartFile } from "@fastify/multipart";
import { attachments, submissionLocationPhotoSelections, submissionPhotos } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../features/audit/index.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";
import { decodePhotoInput, encodeStationPhoto } from "../../../../../utils/image.js";
import { type PhotoFileFields, deletePhotoFiles, photoFileFields, photoFileShape, writePhotoFiles } from "../../../../../utils/photoFiles.js";
import { extractExifDate, parseTakenAt } from "../../../../../utils/photoTakenAt.js";

const MAX_PHOTOS_PER_SUBMISSION = 10;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const schemaRoute = {
  params: z.object({ id: z.string() }),
  response: {
    201: z.object({
      data: z.array(
        z.object({
          id: z.number(),
          attachment_uuid: z.string(),
          mime_type: z.string(),
          ...photoFileShape,
          createdAt: z.string(),
        }),
      ),
    }),
  },
};

type ReqParams = { Params: { id: string } };
type RequestData = ReqParams;
type PendingPhoto = {
  attachment: typeof attachments.$inferInsert;
  attachmentUuid: string;
  note: string | null;
  takenAt: Date | null;
  isMain: boolean;
};
type InsertedPhoto = PhotoFileFields & { id: number; attachment_uuid: string; mime_type: string; createdAt: Date };
type PhotoItem = Omit<InsertedPhoto, "createdAt"> & { createdAt: string };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<PhotoItem[]>>) {
  if (!getRuntimeSettings().photosEnabled) throw new ErrorResponse("FORBIDDEN");
  const { id } = req.params;
  const userId = req.userSession?.user.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");

  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");
  if (!isMultipart) throw new ErrorResponse("BAD_REQUEST");

  const submission = await db.query.submissions.findFirst({ where: { id } });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (submission.status !== "pending") throw new ErrorResponse("BAD_REQUEST", { message: "Submission is not pending" });
  if (submission.submitter_id !== userId) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const existingCount = await db.query.submissionPhotos.findMany({ where: { submission_id: id } });
  if (existingCount.length >= MAX_PHOTOS_PER_SUBMISSION) {
    throw new ErrorResponse("BAD_REQUEST", { message: `Maximum ${MAX_PHOTOS_PER_SUBMISSION} photos per submission` });
  }

  const savedUuids: string[] = [];
  const pendingPhotos: PendingPhoto[] = [];
  let insertedRows: InsertedPhoto[];
  const notes: string[] = [];
  const takenAts: (string | null)[] = [];
  const isMains: boolean[] = [];
  let mainFileIndex: number | null = null;

  try {
    for await (const part of req.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })) {
      const anyPart = part as unknown as { type: string; fieldname?: string; value?: string; file?: unknown };
      if (anyPart.type === "field") {
        if (anyPart.fieldname === "notes") notes.push(anyPart.value ?? "");
        if (anyPart.fieldname === "takenAts") takenAts.push(anyPart.value || null);
        if (anyPart.fieldname === "isMains") isMains.push(anyPart.value === "true");
        continue;
      }
      if (anyPart.type !== "file" || !anyPart.file) continue;
      const filePart = part as MultipartFile;
      if (existingCount.length + pendingPhotos.length >= MAX_PHOTOS_PER_SUBMISSION) break;

      const chunks: Buffer[] = [];
      for await (const chunk of filePart.file) chunks.push(chunk as Buffer);
      if (filePart.file.truncated) throw new ErrorResponse("BAD_REQUEST", { message: "File too large (max 20 MB)" });
      const inputBuffer = Buffer.concat(chunks);

      const photoInput = await decodePhotoInput(inputBuffer);
      const photo = await encodeStationPhoto(photoInput);

      const fileUuid = crypto.randomUUID();
      savedUuids.push(fileUuid);
      const files = await writePhotoFiles(fileUuid, photo);

      const fileIndex = pendingPhotos.length;
      const note = notes[fileIndex]?.trim().slice(0, 100) || null;
      const takenAtRaw = takenAts[fileIndex];
      const takenAt = takenAtRaw ? parseTakenAt(takenAtRaw) : extractExifDate(inputBuffer);

      const isMain = mainFileIndex === null && (isMains[fileIndex] ?? false);
      pendingPhotos.push({
        attachment: {
          uuid: fileUuid,
          name: filePart.filename ?? `${fileUuid}.webp`,
          author_id: userId,
          mime_type: "image/webp",
          ...files,
        },
        attachmentUuid: fileUuid,
        note,
        takenAt,
        isMain,
      });
      if (isMain) mainFileIndex = fileIndex;
    }

    insertedRows = await runAuditedOperation(
      auditContextFromRequest(req),
      { kind: "submission.photos", metadata: { submission_id: id } },
      async (tx, audit) => {
        if (pendingPhotos.length === 0) return [];

        const createdAttachments = await tx
          .insert(attachments)
          .values(pendingPhotos.map(({ attachment }) => attachment))
          .returning();
        if (createdAttachments.length !== pendingPhotos.length) throw new ErrorResponse("FAILED_TO_CREATE");

        const attachmentByUuid = new Map(createdAttachments.map((attachment) => [attachment.uuid, attachment]));
        const createdPhotos = await tx
          .insert(submissionPhotos)
          .values(
            pendingPhotos.map((pendingPhoto) => {
              const attachment = attachmentByUuid.get(pendingPhoto.attachmentUuid);
              if (!attachment) throw new ErrorResponse("FAILED_TO_CREATE");
              return {
                submission_id: id,
                attachment_id: attachment.id,
                note: pendingPhoto.note,
                taken_at: pendingPhoto.takenAt,
                is_main: pendingPhoto.isMain,
              };
            }),
          )
          .returning();
        if (createdPhotos.length !== pendingPhotos.length) throw new ErrorResponse("FAILED_TO_CREATE");

        const photoByAttachmentId = new Map(createdPhotos.map((photo) => [photo.attachment_id, photo]));
        const mainPendingPhoto = mainFileIndex === null ? null : pendingPhotos[mainFileIndex];
        const mainAttachment = mainPendingPhoto ? attachmentByUuid.get(mainPendingPhoto.attachmentUuid) : null;
        const mainPhotoId = mainAttachment ? (photoByAttachmentId.get(mainAttachment.id)?.id ?? null) : null;
        if (mainPhotoId !== null)
          await Promise.all([
            tx
              .update(submissionPhotos)
              .set({ is_main: false })
              .where(and(eq(submissionPhotos.submission_id, id), ne(submissionPhotos.id, mainPhotoId))),
            tx.update(submissionLocationPhotoSelections).set({ is_main: false }).where(eq(submissionLocationPhotoSelections.submission_id, id)),
          ]);

        await audit.logMany(
          createdPhotos.map((photo) => ({
            entity: "submission_photos",
            op: "create",
            recordId: photo.id,
            stationId: submission.station_id,
            new: photo,
          })),
        );

        return pendingPhotos.map((pendingPhoto) => {
          const attachment = attachmentByUuid.get(pendingPhoto.attachmentUuid);
          const photo = attachment ? photoByAttachmentId.get(attachment.id) : undefined;
          if (!attachment || !photo) throw new ErrorResponse("FAILED_TO_CREATE");
          return {
            id: photo.id,
            attachment_uuid: attachment.uuid,
            mime_type: attachment.mime_type,
            ...photoFileFields(attachment),
            createdAt: photo.createdAt,
          };
        });
      },
    );
  } catch (error) {
    await deletePhotoFiles(savedUuids);
    throw error;
  }

  return res.code(201).send({
    data: insertedRows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
}

const uploadSubmissionPhotos: Route<RequestData, PhotoItem[]> = {
  url: "/submissions/:id/photos",
  method: "POST",
  schema: schemaRoute,
  config: { permissions: ["create:submissions"] },
  handler,
};

export default uploadSubmissionPhotos;
