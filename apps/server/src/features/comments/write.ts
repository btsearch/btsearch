import type { MultipartFile, MultipartValue } from "@fastify/multipart";
import { attachments, stationComments } from "@openbts/drizzle";
import { COMMENT_MAX_LENGTH, COMMENT_PHOTO_LIMIT, COMMENT_PHOTO_MAX_BYTES } from "@openbts/shared/contract";
import { eq, inArray } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type SharpInput, type SharpOptions } from "sharp";
import { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.js";
import {
  assertStationPhotoQuality,
  decodeHeicToRaw,
  isHeic,
  isUntouchedFileInput,
  readUploadedFile,
  refusingUnreadableImage,
} from "../../utils/image.js";
import { logger } from "../../utils/logger.js";
import { UPLOAD_DIR } from "../../utils/photoFiles.js";
import { requestCovers } from "../access/scope.js";
import { hasStaffPermission } from "../access/staff.js";
import { auditContextFromRequest, runAuditedOperation } from "../audit/index.js";
import { buildInternalStationActionUrl } from "../notifications/actionUrls.js";
import { notifyStationWatchers } from "../notifications/service.js";

const attachmentInsertSchema = createInsertSchema(attachments);
const stationCommentSelectSchema = createSelectSchema(stationComments, {
  attachments: z.array(z.object({ uuid: z.string(), type: z.string() })).nullable(),
});

export type CommentRow = z.infer<typeof stationCommentSelectSchema>;
export type CommentChanges = { content?: string; status?: CommentRow["status"] };

async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {}
}

export async function canModerateComments(req: FastifyRequest, stationId: number): Promise<boolean> {
  return (await hasStaffPermission(req, { comments: ["moderate"] })) && (await requestCovers(req, { stationIds: [stationId] }));
}

export async function createStationComment(req: FastifyRequest, stationId: number, userId: string): Promise<CommentRow> {
  let content: string | undefined;
  const pendingAttachments: z.infer<typeof attachmentInsertSchema>[] = [];
  const validatedAttachments: { uuid: string; type: string }[] = [];

  await ensureUploadDir();
  const savedPaths: string[] = [];
  try {
    for await (const part of req.parts({ limits: { fileSize: COMMENT_PHOTO_MAX_BYTES } })) {
      if ((part as MultipartFile).type === "file" && (part as MultipartFile).file) {
        const filePart = part as MultipartFile;
        const inputBuffer = await readUploadedFile(filePart.file);
        if (isUntouchedFileInput(filePart.filename, inputBuffer)) continue;

        const mimetype: string = filePart.mimetype;
        if (!mimetype.startsWith("image/")) throw new ErrorResponse("BAD_REQUEST", { message: "Only image files are allowed" });
        if (validatedAttachments.length >= COMMENT_PHOTO_LIMIT) {
          throw new ErrorResponse("BAD_REQUEST", { message: `Maximum ${COMMENT_PHOTO_LIMIT} photos per comment` });
        }
        if (filePart.file.truncated) throw new ErrorResponse("BAD_REQUEST", { message: "File too large (max 5 MB)" });
        const fileUuid = crypto.randomUUID();
        const filename = `${fileUuid}.webp`;
        const filePath = path.join(UPLOAD_DIR, filename);
        savedPaths.push(filePath);

        let sharpInput: SharpInput;
        let sharpOptions: SharpOptions | undefined;
        if (isHeic(mimetype)) {
          const { data, width, height } = await refusingUnreadableImage(() => decodeHeicToRaw(inputBuffer));
          sharpInput = data;
          sharpOptions = { raw: { width, height, channels: 4 } };
        } else sharpInput = inputBuffer;

        const outputBuffer = await refusingUnreadableImage(() =>
          sharp(sharpInput, sharpOptions)
            .rotate()
            .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 75 })
            .toBuffer(),
        );
        await assertStationPhotoQuality(outputBuffer);
        await fs.writeFile(filePath, outputBuffer);
        const stats = await fs.stat(filePath);

        pendingAttachments.push({
          uuid: fileUuid,
          name: filePart.filename ?? filename,
          author_id: userId,
          mime_type: "image/webp",
          size: stats.size,
        });
        validatedAttachments.push({ uuid: fileUuid, type: "image/webp" });
        continue;
      }

      if ((part as MultipartValue).type === "field") {
        const field = part as MultipartValue;
        if (field.fieldname === "content") {
          content = field.value !== null && field.value !== undefined ? String(field.value as string | number | boolean) : "";
        }
      }
    }

    const trimmedContent = content?.trim();
    if (!trimmedContent) throw new ErrorResponse("BAD_REQUEST");
    if (trimmedContent.length > COMMENT_MAX_LENGTH) {
      throw new ErrorResponse("BAD_REQUEST", { message: `Comment is too long (max ${COMMENT_MAX_LENGTH} characters)` });
    }

    const { commentQueueEnabled } = getRuntimeSettings();
    const skipsQueue = !commentQueueEnabled || (await canModerateComments(req, stationId));
    return await runAuditedOperation(auditContextFromRequest(req), { kind: "comment.create" }, async (tx, audit) => {
      if (pendingAttachments.length > 0) await tx.insert(attachments).values(pendingAttachments);

      const [created] = await tx
        .insert(stationComments)
        .values({
          station_id: stationId,
          user_id: userId,
          content: trimmedContent,
          attachments: validatedAttachments,
          status: skipsQueue ? "approved" : "pending",
        })
        .returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({
        entity: "station_comments",
        op: "create",
        recordId: created.id,
        stationId,
        new: created,
      });
      return created;
    });
  } catch (error) {
    await Promise.all(
      savedPaths.map(async (savedPath) => {
        try {
          await fs.unlink(savedPath);
        } catch {}
      }),
    );
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

export async function updateStationComment(req: FastifyRequest, comment: CommentRow, changes: CommentChanges): Promise<CommentRow> {
  const { content, status } = changes;
  const isTextEdited = content !== undefined && content !== comment.content;

  const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "comment.update" }, async (tx, audit) => {
    const [result] = await tx
      .update(stationComments)
      .set({ content, status, updatedAt: isTextEdited ? new Date() : comment.updatedAt })
      .where(eq(stationComments.id, comment.id))
      .returning();
    if (!result) throw new ErrorResponse("INTERNAL_SERVER_ERROR");

    await audit.log({
      entity: "station_comments",
      op: "update",
      recordId: comment.id,
      stationId: comment.station_id,
      old: comment,
      new: result,
    });
    return result;
  });

  if (status === "approved" && comment.status !== "approved") {
    const station = await db.query.stations.findFirst({
      where: { id: comment.station_id },
      columns: { id: true, station_id: true },
      with: { location: { columns: { latitude: true, longitude: true } } },
    });
    void notifyStationWatchers({
      stationId: comment.station_id,
      stationStringId: station?.station_id ?? null,
      type: "station_comment_approved",
      actionUrl: station ? buildInternalStationActionUrl(station) : undefined,
    }).catch((e) => logger.error("Failed to notify station watchers about approved comment", { error: e }));
  }

  return updated;
}

export async function removeStationComment(req: FastifyRequest, comment: CommentRow): Promise<void> {
  const uuids = (comment.attachments ?? []).map((attachment) => attachment.uuid);

  await runAuditedOperation(auditContextFromRequest(req), { kind: "comment.delete" }, async (tx, audit) => {
    await tx.delete(stationComments).where(eq(stationComments.id, comment.id));
    if (uuids.length > 0) await tx.delete(attachments).where(inArray(attachments.uuid, uuids));

    await audit.log({
      entity: "station_comments",
      op: "delete",
      recordId: comment.id,
      stationId: comment.station_id,
      old: comment,
    });
  });

  await Promise.all(
    uuids.map(async (uuid) => {
      try {
        await fs.unlink(path.join(UPLOAD_DIR, `${uuid}.webp`));
      } catch {}
    }),
  );
}
