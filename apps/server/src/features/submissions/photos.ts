import type { MultipartFile } from "@fastify/multipart";
import { attachments, submissionLocationPhotoSelections, submissionPhotos } from "@openbts/drizzle";
import { PHOTO_MAX_BYTES, SUBMISSION_PHOTO_LIMIT } from "@openbts/shared/contract";
import { and, count, eq, ne } from "drizzle-orm";
import { createInsertSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { decodePhotoInput, encodeStationPhoto, isUntouchedFileInput, readUploadedFile } from "../../utils/image.js";
import { deletePhotoFiles, writePhotoFiles } from "../../utils/photoFiles.js";
import { extractExifDate, parseTakenAt } from "../../utils/photoTakenAt.js";
import { requestCovers } from "../access/scope.js";
import { hasStaffPermission } from "../access/staff.js";
import { auditContextFromRequest, runAuditedOperation } from "../audit/index.js";
import { lockSubmission } from "./lock.js";
import type { SubmissionPhotoRow } from "./photoRead.js";
import type { SubmissionRow } from "./read.js";

const attachmentInsertSchema = createInsertSchema(attachments);

type PendingPhoto = {
  attachment: z.infer<typeof attachmentInsertSchema>;
  attachmentUuid: string;
  note: string | null;
  takenAt: Date | null;
  isMain: boolean;
};
export type PhotoSubmission = Pick<SubmissionRow, "id" | "submitter_id" | "status" | "station_id">;
export type SubmissionPhotoChanges = { note?: string | null; taken_at?: Date | null; is_main?: true };

function submissionNotPending(): ErrorResponse {
  return new ErrorResponse("BAD_REQUEST", { message: "Submission is not pending" });
}

export async function uploadSubmissionPhotos(req: FastifyRequest, id: string, userId: string): Promise<SubmissionPhotoRow[]> {
  const submission = await db.query.submissions.findFirst({ where: { id } });
  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (submission.submitter_id !== userId) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
  if (submission.status !== "pending") throw submissionNotPending();

  const existingCount = await db.query.submissionPhotos.findMany({ where: { submission_id: id } });
  if (existingCount.length >= SUBMISSION_PHOTO_LIMIT) {
    throw new ErrorResponse("BAD_REQUEST", { message: `Maximum ${SUBMISSION_PHOTO_LIMIT} photos per submission` });
  }

  const savedUuids: string[] = [];
  const pendingPhotos: PendingPhoto[] = [];
  const notes: string[] = [];
  const takenAts: (string | null)[] = [];
  const isMains: boolean[] = [];
  let filePartCount = 0;
  let mainFileIndex: number | null = null;

  try {
    for await (const part of req.parts({ limits: { fileSize: PHOTO_MAX_BYTES } })) {
      const anyPart = part as unknown as { type: string; fieldname?: string; value?: string; file?: unknown };
      if (anyPart.type === "field") {
        if (anyPart.fieldname === "notes") notes.push(anyPart.value ?? "");
        if (anyPart.fieldname === "takenAts") takenAts.push(anyPart.value || null);
        if (anyPart.fieldname === "isMains") isMains.push(anyPart.value === "true");
        continue;
      }
      if (anyPart.type !== "file" || !anyPart.file) continue;
      const filePart = part as MultipartFile;
      const slot = filePartCount++;
      if (existingCount.length + pendingPhotos.length >= SUBMISSION_PHOTO_LIMIT) break;

      const inputBuffer = await readUploadedFile(filePart.file);
      if (filePart.file.truncated) throw new ErrorResponse("BAD_REQUEST", { message: "File too large (max 20 MB)" });
      if (isUntouchedFileInput(filePart.filename, inputBuffer)) continue;

      const photoInput = await decodePhotoInput(inputBuffer);
      const photo = await encodeStationPhoto(photoInput);

      const fileUuid = crypto.randomUUID();
      savedUuids.push(fileUuid);
      const files = await writePhotoFiles(fileUuid, photo);

      const fileIndex = pendingPhotos.length;
      const note = notes[slot]?.trim().slice(0, 100) || null;
      const takenAtRaw = takenAts[slot];
      const takenAt = takenAtRaw ? parseTakenAt(takenAtRaw) : extractExifDate(inputBuffer);

      const isMain = mainFileIndex === null && (isMains[slot] ?? false);
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

    if (pendingPhotos.length === 0) throw new ErrorResponse("BAD_REQUEST", { message: "No photo was sent" });

    return await runAuditedOperation(
      auditContextFromRequest(req),
      { kind: "submission.photos", metadata: { submission_id: id } },
      async (tx, audit) => {
        const locked = await lockSubmission(tx, id);
        if (locked?.status !== "pending") throw submissionNotPending();
        const [stored] = await tx.select({ total: count() }).from(submissionPhotos).where(eq(submissionPhotos.submission_id, id));
        if ((stored?.total ?? 0) + pendingPhotos.length > SUBMISSION_PHOTO_LIMIT) {
          throw new ErrorResponse("BAD_REQUEST", { message: `Maximum ${SUBMISSION_PHOTO_LIMIT} photos per submission` });
        }

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
        if (mainPhotoId !== null) {
          await Promise.all([
            tx
              .update(submissionPhotos)
              .set({ is_main: false })
              .where(and(eq(submissionPhotos.submission_id, id), ne(submissionPhotos.id, mainPhotoId))),
            tx.update(submissionLocationPhotoSelections).set({ is_main: false }).where(eq(submissionLocationPhotoSelections.submission_id, id)),
          ]);
        }

        await audit.logMany(
          createdPhotos.map((photo) => ({
            entity: "submission_photos",
            op: "create",
            recordId: photo.id,
            stationId: submission.station_id,
            new: photo,
          })),
        );

        return createdPhotos;
      },
    );
  } catch (error) {
    await deletePhotoFiles(savedUuids);
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

export async function findPhotoEditableSubmission(req: FastifyRequest, id: string, userId: string): Promise<PhotoSubmission> {
  const hasAdminPermission = (await hasStaffPermission(req, { submissions: ["moderate"] })) && (await requestCovers(req, { submissionIds: [id] }));

  const submission = await db.query.submissions.findFirst({
    where: { id },
    columns: { id: true, submitter_id: true, status: true, station_id: true },
  });
  if (!submission) throw new ErrorResponse("NOT_FOUND");

  const isSubmitter = submission.submitter_id === userId;
  if (!hasAdminPermission && !isSubmitter) throw new ErrorResponse("FORBIDDEN");
  if (submission.status !== "pending") throw submissionNotPending();

  return submission;
}

export async function updateSubmissionPhoto(
  req: FastifyRequest,
  submission: PhotoSubmission,
  photo: SubmissionPhotoRow,
  changes: SubmissionPhotoChanges,
): Promise<void> {
  const { id } = submission;

  await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.photos", metadata: { submission_id: id } }, async (tx, audit) => {
    const locked = await lockSubmission(tx, id);
    if (locked?.status !== "pending") throw submissionNotPending();

    const [updated] = await tx
      .update(submissionPhotos)
      .set(changes)
      .where(and(eq(submissionPhotos.id, photo.id), eq(submissionPhotos.submission_id, id)))
      .returning();
    if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");

    if (changes.is_main) {
      await Promise.all([
        tx
          .update(submissionPhotos)
          .set({ is_main: false })
          .where(and(eq(submissionPhotos.submission_id, id), ne(submissionPhotos.id, photo.id))),
        tx.update(submissionLocationPhotoSelections).set({ is_main: false }).where(eq(submissionLocationPhotoSelections.submission_id, id)),
      ]);
    }

    await audit.log({
      entity: "submission_photos",
      op: "update",
      recordId: photo.id,
      stationId: submission.station_id,
      old: photo,
      new: updated,
    });
  });
}

export async function removeSubmissionPhoto(req: FastifyRequest, submission: PhotoSubmission, photo: SubmissionPhotoRow): Promise<void> {
  const { id } = submission;
  const attachment = await db.query.attachments.findFirst({ where: { id: photo.attachment_id } });

  await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.photos", metadata: { submission_id: id } }, async (tx, audit) => {
    const locked = await lockSubmission(tx, id);
    if (locked?.status !== "pending") throw submissionNotPending();

    await tx.delete(submissionPhotos).where(and(eq(submissionPhotos.id, photo.id), eq(submissionPhotos.submission_id, id)));
    if (attachment) await tx.delete(attachments).where(eq(attachments.id, attachment.id));

    await audit.log({
      entity: "submission_photos",
      op: "delete",
      recordId: photo.id,
      stationId: submission.station_id,
      old: photo,
    });
  });

  if (attachment) await deletePhotoFiles([attachment.uuid]);
}
