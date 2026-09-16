import type { MultipartFile, MultipartValue } from "@fastify/multipart";
import { attachments, stationComments } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type SharpInput, type SharpOptions } from "sharp";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../../services/audit/index.js";
import { getRuntimeSettings } from "../../../../../../services/settings.service.js";
import { assertStationPhotoQuality, decodeHeicToRaw, isHeic } from "../../../../../../utils/image.js";

const stationCommentSelectSchema = createSelectSchema(stationComments);
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {}
}
const schemaRoute = {
  params: z
    .object({
      station_id: z.coerce.number<number>(),
    })
    .strict(),
  response: {
    201: z
      .object({
        data: stationCommentSelectSchema,
      })
      .strict(),
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type RequestData = ReqParams;
type ResponseData = z.infer<typeof stationCommentSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;
  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");
  const userId = req.userSession?.user.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");
  if (!getRuntimeSettings().enableStationComments) throw new ErrorResponse("FORBIDDEN");
  if (!isMultipart) throw new ErrorResponse("BAD_REQUEST");

  try {
    const station = await db.query.stations.findFirst({
      where: {
        id: station_id,
      },
    });
    if (!station) throw new ErrorResponse("NOT_FOUND");

    let content: string | undefined;
    const pendingAttachments: (typeof attachments.$inferInsert)[] = [];
    const validatedAttachments: { uuid: string; type: string }[] = [];

    await ensureUploadDir();
    const savedPaths: string[] = [];
    let newComment: ResponseData;
    try {
      for await (const part of req.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })) {
        if ((part as MultipartFile).type === "file" && (part as MultipartFile).file) {
          const filePart = part as MultipartFile;
          const mimetype: string = filePart.mimetype;
          if (!mimetype.startsWith("image/")) throw new ErrorResponse("BAD_REQUEST", { message: "Only image files are allowed" });
          if (validatedAttachments.length >= 5) throw new ErrorResponse("BAD_REQUEST", { message: "Maximum 5 photos per comment" });
          const fileUuid = crypto.randomUUID();
          const filename = `${fileUuid}.webp`;
          const filePath = path.join(UPLOAD_DIR, filename);
          savedPaths.push(filePath);

          const chunks: Buffer[] = [];
          for await (const chunk of filePart.file) chunks.push(chunk as Buffer);
          if (filePart.file.truncated) throw new ErrorResponse("BAD_REQUEST", { message: "File too large (max 5 MB)" });
          const inputBuffer = Buffer.concat(chunks);

          let sharpInput: SharpInput;
          let sharpOptions: SharpOptions | undefined;
          if (isHeic(mimetype)) {
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
          if (field.fieldname === "content")
            content = field.value !== null && field.value !== undefined ? String(field.value as string | number | boolean) : "";
        }
      }

      if (!content) throw new ErrorResponse("BAD_REQUEST");
      const commentContent = content;

      const { commentQueueEnabled } = getRuntimeSettings();
      newComment = await runAuditedOperation(auditContextFromRequest(req), { kind: "comment.create" }, async (tx, audit) => {
        if (pendingAttachments.length > 0) await tx.insert(attachments).values(pendingAttachments);

        const [created] = await tx
          .insert(stationComments)
          .values({
            station_id: station_id,
            user_id: userId,
            content: commentContent,
            attachments: validatedAttachments,
            status: commentQueueEnabled && !["admin", "editor"].includes(req.userSession?.user.role ?? "") ? "pending" : "approved",
          })
          .returning();
        if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

        await audit.log({
          entity: "station_comments",
          op: "create",
          recordId: created.id,
          stationId: station_id,
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

    return res.code(201).send({ data: newComment });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const createStationComment: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/comments",
  method: "POST",
  schema: schemaRoute,
  config: { permissions: ["create:comments"] },
  handler,
};

export default createStationComment;
