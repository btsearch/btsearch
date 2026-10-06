import type { MultipartFile } from "@fastify/multipart";
import { attachments, locationPhotos } from "@openbts/drizzle";
import { PHOTO_MAX_BYTES } from "@openbts/shared/contract";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../errors.js";
import { decodePhotoInput, encodeStationPhoto, isUntouchedFileInput, readUploadedFile } from "../../utils/image.js";
import { deletePhotoFiles, writePhotoFiles } from "../../utils/photoFiles.js";
import { extractExifDate, parseTakenAt } from "../../utils/photoTakenAt.js";
import { auditContextFromRequest, runAuditedOperation } from "../audit/index.js";
import type { LocationPhotoRow } from "./read.js";

const attachmentInsertSchema = createInsertSchema(attachments);
const attachmentSelectSchema = createSelectSchema(attachments);

type PreparedPhoto = { attachment: z.infer<typeof attachmentInsertSchema>; note: string | null; takenAt: Date | null };

export type UploadedLocationPhoto = {
  photo: LocationPhotoRow;
  attachment: z.infer<typeof attachmentSelectSchema>;
};

export async function uploadLocationPhotos(req: FastifyRequest, locationId: number, userId: string): Promise<UploadedLocationPhoto[]> {
  const savedUuids: string[] = [];
  const preparedPhotos: PreparedPhoto[] = [];
  const notes: string[] = [];
  const takenAts: (string | null)[] = [];
  let filePartCount = 0;

  try {
    for await (const part of req.parts({ limits: { fileSize: PHOTO_MAX_BYTES } })) {
      const anyPart = part as unknown as { type: string; fieldname?: string; value?: string; file?: unknown };
      if (anyPart.type === "field") {
        if (anyPart.fieldname === "notes") notes.push(anyPart.value ?? "");
        if (anyPart.fieldname === "takenAts") takenAts.push(anyPart.value || null);
        continue;
      }
      if (anyPart.type !== "file" || !anyPart.file) continue;
      const filePart = part as MultipartFile;
      const slot = filePartCount++;

      const inputBuffer = await readUploadedFile(filePart.file);
      if (filePart.file.truncated) throw new ErrorResponse("BAD_REQUEST", { message: "File too large (max 20 MB)" });
      if (isUntouchedFileInput(filePart.filename, inputBuffer)) continue;

      const photo = await encodeStationPhoto(await decodePhotoInput(inputBuffer));

      const fileUuid = crypto.randomUUID();
      savedUuids.push(fileUuid);
      const files = await writePhotoFiles(fileUuid, photo);

      const takenAtRaw = takenAts[slot];
      preparedPhotos.push({
        attachment: { uuid: fileUuid, name: filePart.filename ?? `${fileUuid}.webp`, author_id: userId, mime_type: "image/webp", ...files },
        note: notes[slot]?.trim().slice(0, 100) || null,
        takenAt: takenAtRaw ? parseTakenAt(takenAtRaw) : extractExifDate(inputBuffer),
      });
    }

    if (preparedPhotos.length === 0) throw new ErrorResponse("BAD_REQUEST", { message: "No photo was sent" });

    return await runAuditedOperation(auditContextFromRequest(req), { kind: "location.photos" }, async (tx, audit) => {
      const insertedAttachments = await tx
        .insert(attachments)
        .values(preparedPhotos.map(({ attachment }) => attachment))
        .returning();
      if (insertedAttachments.length !== preparedPhotos.length) throw new ErrorResponse("FAILED_TO_CREATE");

      const preparedByUuid = new Map(preparedPhotos.map((prepared) => [prepared.attachment.uuid, prepared]));
      const insertedPhotos = await tx
        .insert(locationPhotos)
        .values(
          insertedAttachments.map((attachment) => {
            const prepared = preparedByUuid.get(attachment.uuid);
            return {
              location_id: locationId,
              attachment_id: attachment.id,
              uploaded_by: userId,
              note: prepared?.note ?? null,
              taken_at: prepared?.takenAt ?? null,
            };
          }),
        )
        .returning();
      if (insertedPhotos.length !== preparedPhotos.length) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.logMany(
        insertedPhotos.map((photo) => ({
          entity: "location_photos",
          op: "create",
          recordId: photo.id,
          new: photo,
          metadata: { location_id: locationId },
        })),
      );

      const attachmentById = new Map(insertedAttachments.map((attachment) => [attachment.id, attachment]));
      return insertedPhotos.map((photo) => {
        const attachment = attachmentById.get(photo.attachment_id);
        if (!attachment) throw new ErrorResponse("FAILED_TO_CREATE");
        return { photo, attachment };
      });
    });
  } catch (error) {
    await deletePhotoFiles(savedUuids);
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}
