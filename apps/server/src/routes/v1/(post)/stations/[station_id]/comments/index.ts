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
import { createAuditLog } from "../../../../../../services/auditLog.service.js";
import { getRuntimeSettings } from "../../../../../../services/settings.service.js";
import { decodeHeicToRaw, isHeic } from "../../../../../../utils/image.js";

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
    const validatedAttachments: { uuid: string; type: string }[] | null = [];

    await ensureUploadDir();
    const savedPaths: string[] = [];
    try {
      for await (const part of req.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })) {
        if ((part as MultipartFile).type === "file" && (part as MultipartFile).file) {
          const filePart = part as MultipartFile;
          const mimetype: string = filePart.mimetype;
          if (!mimetype.startsWith("image/")) throw new ErrorResponse("BAD_REQUEST", { message: "Only image files are allowed" });
          if ((validatedAttachments as { uuid: string; type: string }[]).length >= 5)
            throw new ErrorResponse("BAD_REQUEST", { message: "Maximum 5 photos per comment" });
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
          await fs.writeFile(filePath, outputBuffer);
          const stats = await fs.stat(filePath);

          const [newAttachment] = await db
            .insert(attachments)
            .values({ uuid: fileUuid, name: filePart.filename ?? filename, author_id: userId, mime_type: "image/webp", size: stats.size })
            .returning();
          if (!newAttachment) throw new ErrorResponse("FAILED_TO_CREATE");
          (validatedAttachments as { uuid: string; type: string }[]).push({ uuid: newAttachment.uuid, type: newAttachment.mime_type });
          continue;
        }

        if ((part as MultipartValue).type === "field") {
          const field = part as MultipartValue;
          if (field.fieldname === "content")
            content = field.value !== null && field.value !== undefined ? String(field.value as string | number | boolean) : "";
        }
      }
    } catch (error) {
      await Promise.all(
        savedPaths.map(async (p) => {
          try {
            await fs.access(p);
            await fs.unlink(p);
          } catch {}
        }),
      );
      if (error instanceof ErrorResponse) throw error;
      throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
    }

    if (!content) throw new ErrorResponse("BAD_REQUEST");

    const { commentQueueEnabled } = getRuntimeSettings();

    const [newComment] = await db
      .insert(stationComments)
      .values({
        station_id: Number(station_id),
        user_id: userId,
        content: content,
        attachments: validatedAttachments,
        status: commentQueueEnabled && !["admin", "editor"].includes(req.userSession?.user.role ?? "") ? "pending" : "approved",
      })
      .returning();
    if (!newComment) throw new ErrorResponse("FAILED_TO_CREATE");

    await createAuditLog(
      {
        action: "station_comments.create",
        table_name: "station_comments",
        record_id: null,
        old_values: null,
        new_values: newComment,
        metadata: { comment_id: newComment.id },
      },
      req,
    );

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
