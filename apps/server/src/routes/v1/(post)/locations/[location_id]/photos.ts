import type { MultipartFile } from "@fastify/multipart";
import { attachments, locationPhotos } from "@openbts/drizzle";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../services/audit/index.js";
import { decodePhotoInput, encodeStationPhoto } from "../../../../../utils/image.js";
import { type PhotoFileFields, deletePhotoFiles, photoFileFields, photoFileShape, writePhotoFiles } from "../../../../../utils/photoFiles.js";
import { extractExifDate, parseTakenAt } from "../../../../../utils/photoTakenAt.js";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const schemaRoute = {
  params: z.object({ location_id: z.coerce.number() }),
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

type ReqParams = { Params: { location_id: number } };
type PhotoItem = PhotoFileFields & { id: number; attachment_uuid: string; mime_type: string; createdAt: string };
type PreparedPhoto = { attachment: typeof attachments.$inferInsert; note: string | null; takenAt: Date | null };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<PhotoItem[]>>) {
  const { location_id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");
  if (!isMultipart) throw new ErrorResponse("BAD_REQUEST");

  const location = await db.query.locations.findFirst({ where: { id: location_id } });
  if (!location) throw new ErrorResponse("NOT_FOUND");

  const savedUuids: string[] = [];
  const preparedPhotos: PreparedPhoto[] = [];
  const notes: string[] = [];
  const takenAts: (string | null)[] = [];

  try {
    for await (const part of req.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })) {
      const anyPart = part as unknown as { type: string; fieldname?: string; value?: string; file?: unknown };
      if (anyPart.type === "field") {
        if (anyPart.fieldname === "notes") notes.push(anyPart.value ?? "");
        if (anyPart.fieldname === "takenAts") takenAts.push(anyPart.value || null);
        continue;
      }
      if (anyPart.type !== "file" || !anyPart.file) continue;
      const filePart = part as MultipartFile;

      const chunks: Buffer[] = [];
      for await (const chunk of filePart.file) chunks.push(chunk as Buffer);
      if (filePart.file.truncated) throw new ErrorResponse("BAD_REQUEST", { message: "File too large (max 20 MB)" });
      const inputBuffer = Buffer.concat(chunks);

      const photo = await encodeStationPhoto(await decodePhotoInput(inputBuffer));

      const fileUuid = crypto.randomUUID();
      savedUuids.push(fileUuid);
      const files = await writePhotoFiles(fileUuid, photo);

      const takenAtRaw = takenAts[preparedPhotos.length];
      preparedPhotos.push({
        attachment: { uuid: fileUuid, name: filePart.filename ?? `${fileUuid}.webp`, author_id: session.user.id, mime_type: "image/webp", ...files },
        note: notes[preparedPhotos.length]?.trim().slice(0, 100) || null,
        takenAt: takenAtRaw ? parseTakenAt(takenAtRaw) : extractExifDate(inputBuffer),
      });
    }

    if (preparedPhotos.length === 0) return res.code(201).send({ data: [] });

    const insertedRows = await runAuditedOperation(auditContextFromRequest(req), { kind: "location.photos" }, async (tx, audit) => {
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
              location_id,
              attachment_id: attachment.id,
              uploaded_by: session.user.id,
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
          metadata: { location_id },
        })),
      );

      const attachmentById = new Map(insertedAttachments.map((attachment) => [attachment.id, attachment]));
      return insertedPhotos.map((photo) => {
        const attachment = attachmentById.get(photo.attachment_id);
        if (!attachment) throw new ErrorResponse("FAILED_TO_CREATE");
        return {
          id: photo.id,
          attachment_uuid: attachment.uuid,
          mime_type: attachment.mime_type,
          ...photoFileFields(attachment),
          createdAt: photo.createdAt.toISOString(),
        };
      });
    });

    return res.code(201).send({ data: insertedRows });
  } catch (error) {
    await deletePhotoFiles(savedUuids);
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const uploadLocationPhotos: Route<ReqParams, PhotoItem[]> = {
  url: "/locations/:location_id/photos",
  method: "POST",
  schema: schemaRoute,
  config: { permissions: ["update:stations"] },
  handler,
};

export default uploadLocationPhotos;
