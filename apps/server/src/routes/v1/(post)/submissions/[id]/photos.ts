import type { MultipartFile } from "@fastify/multipart";
import { attachments, submissionLocationPhotoSelections, submissionPhotos } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";
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
import { auditContextFromRequest, runAuditedOperation } from "../../../../../services/audit/index.js";
import { getRuntimeSettings } from "../../../../../services/settings.service.js";
import { decodeHeicToRaw, isHeic } from "../../../../../utils/image.js";

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
type PendingPhoto = {
  attachment: typeof attachments.$inferInsert;
  attachmentUuid: string;
  note: string | null;
  takenAt: Date | null;
  isMain: boolean;
};
type InsertedPhoto = { id: number; attachment_uuid: string; mime_type: string; createdAt: Date };
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

  await ensureUploadDir();

  const savedPaths: string[] = [];
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

      const fileIndex = pendingPhotos.length;
      const note = notes[fileIndex]?.trim().slice(0, 100) || null;
      const takenAtRaw = takenAts[fileIndex];
      let takenAt: Date | null = null;
      if (takenAtRaw) {
        const parsed = new Date(takenAtRaw);
        if (Number.isNaN(parsed.getTime())) throw new ErrorResponse("BAD_REQUEST", { message: "Invalid takenAt date" });
        takenAt = parsed;
      } else if (exifDate) takenAt = exifDate;

      const isMain = mainFileIndex === null && (isMains[fileIndex] ?? false);
      pendingPhotos.push({
        attachment: {
          uuid: fileUuid,
          name: filePart.filename ?? filename,
          author_id: userId,
          mime_type: "image/webp",
          size: stats.size,
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
          if (!photo) throw new ErrorResponse("FAILED_TO_CREATE");
          return { id: photo.id, attachment_uuid: pendingPhoto.attachmentUuid, mime_type: "image/webp", createdAt: photo.createdAt };
        });
      },
    );
  } catch (error) {
    await Promise.all(savedPaths.map((filePath) => fs.unlink(filePath).catch(() => {})));
    if (error instanceof ErrorResponse) throw error;
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
