import type { MultipartFile } from "@fastify/multipart";
import { attachments, locationPhotos } from "@openbts/drizzle";
import type { FastifyRequest } from "fastify/types/request.js";
import { fileTypeFromBuffer } from "file-type";
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type SharpInput, type SharpOptions } from "sharp";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../services/audit/index.js";
import { assertStationPhotoQuality, decodeHeicToRaw, isHeic } from "../../../../../utils/image.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {}
}

const schemaRoute = {
  params: z.object({ location_id: z.coerce.number() }),
  response: {
    201: z.object({
      data: z.array(z.object({ id: z.number(), attachment_uuid: z.string(), mime_type: z.string(), createdAt: z.string() })),
    }),
  },
};

type ReqParams = { Params: { location_id: number } };
type PhotoItem = { id: number; attachment_uuid: string; mime_type: string; createdAt: string };
type PreparedPhoto = {
  uuid: string;
  name: string;
  size: number;
  note: string | null;
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<PhotoItem[]>>) {
  const { location_id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");
  if (!isMultipart) throw new ErrorResponse("BAD_REQUEST");

  const location = await db.query.locations.findFirst({ where: { id: location_id } });
  if (!location) throw new ErrorResponse("NOT_FOUND");

  await ensureUploadDir();

  const savedPaths: string[] = [];
  const preparedPhotos: PreparedPhoto[] = [];
  const notes: string[] = [];

  try {
    for await (const part of req.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })) {
      const anyPart = part as unknown as { type: string; fieldname?: string; value?: string; file?: unknown };
      if (anyPart.type === "field") {
        if (anyPart.fieldname === "notes") notes.push(anyPart.value ?? "");
        continue;
      }
      if (anyPart.type !== "file" || !anyPart.file) continue;
      const filePart = part as MultipartFile;

      const fileUuid = crypto.randomUUID();
      const filename = `${fileUuid}.webp`;
      const filePath = path.join(UPLOAD_DIR, filename);
      savedPaths.push(filePath);

      const chunks: Buffer[] = [];
      for await (const chunk of filePart.file) chunks.push(chunk as Buffer);
      if (filePart.file.truncated) throw new ErrorResponse("BAD_REQUEST", { message: "File too large (max 10 MB)" });
      const inputBuffer = Buffer.concat(chunks);

      const detected = await fileTypeFromBuffer(inputBuffer);
      if (!detected || !detected.mime.startsWith("image/")) throw new ErrorResponse("BAD_REQUEST", { message: "Only image files are allowed" });

      let sharpInput: SharpInput;
      let sharpOptions: SharpOptions | undefined;
      if (isHeic(detected.mime)) {
        const { data, width, height } = await decodeHeicToRaw(inputBuffer);
        sharpInput = data;
        sharpOptions = { raw: { width, height, channels: 4 } };
      } else sharpInput = inputBuffer;

      const outputBuffer = await sharp(sharpInput, sharpOptions)
        .rotate()
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
      await assertStationPhotoQuality(outputBuffer);
      await fs.writeFile(filePath, outputBuffer);
      const stats = await fs.stat(filePath);

      preparedPhotos.push({
        uuid: fileUuid,
        name: filePart.filename ?? filename,
        size: stats.size,
        note: notes[preparedPhotos.length]?.trim().slice(0, 100) || null,
      });
    }

    if (preparedPhotos.length === 0) return res.code(201).send({ data: [] });

    const insertedRows = await runAuditedOperation(auditContextFromRequest(req), { kind: "location.photos" }, async (tx, audit) => {
      const insertedAttachments = await tx
        .insert(attachments)
        .values(
          preparedPhotos.map((photo) => ({
            uuid: photo.uuid,
            name: photo.name,
            author_id: session.user.id,
            mime_type: "image/webp",
            size: photo.size,
          })),
        )
        .returning();
      if (insertedAttachments.length !== preparedPhotos.length) throw new ErrorResponse("FAILED_TO_CREATE");

      const preparedByUuid = new Map(preparedPhotos.map((photo) => [photo.uuid, photo]));
      const insertedPhotos = await tx
        .insert(locationPhotos)
        .values(
          insertedAttachments.map((attachment) => ({
            location_id,
            attachment_id: attachment.id,
            uploaded_by: session.user.id,
            note: preparedByUuid.get(attachment.uuid)?.note ?? null,
          })),
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
          createdAt: photo.createdAt.toISOString(),
        };
      });
    });

    return res.code(201).send({ data: insertedRows });
  } catch (error) {
    await Promise.all(savedPaths.map((filePath) => fs.unlink(filePath).catch(() => {})));
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
