import type { MultipartFile } from "@fastify/multipart";
import { attachments, submissionPhotos } from "@openbts/drizzle";
import * as ExifReader from "exifreader";
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
import { createAuditLog } from "../../../../../services/auditLog.service.js";
import { getRuntimeSettings } from "../../../../../services/settings.service.js";
import { decodeHeicToRaw, isHeic } from "../../../../../utils/image.js";
import { clearOtherMainPhotos } from "../../../../../utils/submissions/photos.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_PHOTOS_PER_SUBMISSION = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function extractExifDate(buffer: Buffer): Date | null {
  try {
    const tags = ExifReader.load(buffer);
    const raw = tags["DateTimeOriginal"]?.description ?? tags["DateTimeDigitized"]?.description;
    if (!raw) return null;
    // EXIF date format: "YYYY:MM:DD HH:MM:SS"
    const [datePart, timePart] = raw.split(" ");
    if (!datePart || !timePart) return null;
    const date = new Date(`${datePart.replaceAll(":", "-")}T${timePart}`);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {}
}

const schemaRoute = {
  params: z.object({ id: z.string() }),
  response: {
    201: z.object({
      data: z.array(
        z.object({
          id: z.number(),
          attachment_uuid: z.string(),
          mime_type: z.string(),
          createdAt: z.string(),
        }),
      ),
    }),
  },
};

type ReqParams = { Params: { id: string } };
type RequestData = ReqParams;

async function handler(
  req: FastifyRequest<RequestData>,
  res: ReplyPayload<JSONBody<{ id: number; attachment_uuid: string; mime_type: string; createdAt: string }[]>>,
) {
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

  await ensureUploadDir();

  const savedPaths: string[] = [];
  const insertedRows: { id: number; attachment_uuid: string; mime_type: string; createdAt: Date }[] = [];
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
      if (existingCount.length + savedPaths.length >= MAX_PHOTOS_PER_SUBMISSION) break;

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

      const exifDate = extractExifDate(inputBuffer);

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
      await fs.writeFile(filePath, outputBuffer);

      const stats = await fs.stat(filePath);

      const [newAttachment] = await db
        .insert(attachments)
        .values({
          uuid: fileUuid,
          name: filePart.filename ?? filename,
          author_id: userId,
          mime_type: "image/webp",
          size: stats.size,
        })
        .returning();
      if (!newAttachment) throw new ErrorResponse("FAILED_TO_CREATE");

      const fileIndex = insertedRows.length;
      const note = notes[fileIndex]?.trim().slice(0, 100) || null;
      const takenAtRaw = takenAts[fileIndex];
      let taken_at: Date | null = null;
      if (takenAtRaw) {
        const parsed = new Date(takenAtRaw);
        if (Number.isNaN(parsed.getTime())) throw new ErrorResponse("BAD_REQUEST", { message: "Invalid takenAt date" });
        taken_at = parsed;
      } else if (exifDate) {
        taken_at = exifDate;
      }
      const is_main: boolean = mainFileIndex === null && (isMains[fileIndex] ?? false);
      const [photoRow] = await db
        .insert(submissionPhotos)
        .values({ submission_id: id, attachment_id: newAttachment.id, note, taken_at, is_main })
        .returning();
      if (!photoRow) throw new ErrorResponse("FAILED_TO_CREATE");
      if (is_main) mainFileIndex = fileIndex;

      insertedRows.push({ id: photoRow.id, attachment_uuid: fileUuid, mime_type: "image/webp", createdAt: photoRow.createdAt });
    }

    const mainPhotoId = mainFileIndex !== null ? (insertedRows[mainFileIndex]?.id ?? null) : null;
    if (mainPhotoId !== null) await clearOtherMainPhotos(id, mainPhotoId);
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
    throw error;
  }

  await createAuditLog(
    { action: "submission_photos.create", table_name: "submission_photos", metadata: { submission_id: id }, new_values: insertedRows },
    req,
  );

  return res.code(201).send({
    data: insertedRows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
}

const uploadSubmissionPhotos: Route<RequestData, { id: number; attachment_uuid: string; mime_type: string; createdAt: string }[]> = {
  url: "/submissions/:id/photos",
  method: "POST",
  schema: schemaRoute,
  config: { permissions: ["write:submissions"] },
  handler,
};

export default uploadSubmissionPhotos;
