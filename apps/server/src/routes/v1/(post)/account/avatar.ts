import type { MultipartFile } from "@fastify/multipart";
import type { FastifyRequest } from "fastify/types/request.js";
import { fileTypeFromBuffer } from "file-type";
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type SharpInput, type SharpOptions } from "sharp";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { decodeHeicToRaw, isHeic } from "../../../../utils/image.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const AVATAR_SIZE = 256;

function isUploadedImage(image: string | null | undefined): boolean {
  if (!image) return false;
  return !image.startsWith("http") && image.endsWith(".webp");
}

const schemaRoute = {
  response: {
    200: z.object({
      data: z.object({ image: z.string() }),
    }),
  },
};

type ResponseBody = { image: string };

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");
  const userId = session.user.id;

  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");
  if (!isMultipart) throw new ErrorResponse("BAD_REQUEST", { message: "Expected multipart/form-data" });

  const currentUser = await db.query.users.findFirst({
    where: { id: userId },
    columns: { image: true },
  });

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  let newImageFilename: string | null = null;
  let savedPath: string | null = null;

  try {
    for await (const part of req.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })) {
      const anyPart = part as unknown as { type: string };
      if (anyPart.type !== "file") continue;

      const filePart = part as MultipartFile;

      const fileUuid = crypto.randomUUID();
      const filename = `${fileUuid}.webp`;
      const filePath = path.join(UPLOAD_DIR, filename);
      savedPath = filePath;

      const chunks: Buffer[] = [];
      for await (const chunk of filePart.file) chunks.push(chunk as Buffer);
      const inputBuffer = Buffer.concat(chunks);

      const detected = await fileTypeFromBuffer(inputBuffer);
      if (!detected || !detected.mime.startsWith("image/")) throw new ErrorResponse("BAD_REQUEST", { message: "Only image files are allowed" });

      let sharpInput: SharpInput;
      let sharpOptions: SharpOptions | undefined;
      if (isHeic(filePart.mimetype)) {
        const { data, width, height } = await decodeHeicToRaw(inputBuffer);
        sharpInput = data;
        sharpOptions = { raw: { width, height, channels: 4 } };
      } else sharpInput = inputBuffer;

      const outputBuffer = await sharp(sharpInput, sharpOptions)
        .rotate()
        .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: "cover", position: "attention" })
        .webp({ quality: 80 })
        .toBuffer();

      await fs.writeFile(filePath, outputBuffer);
      newImageFilename = filename;
      break;
    }
  } catch (error) {
    if (savedPath) {
      try {
        await fs.unlink(savedPath);
      } catch {}
    }
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }

  if (!newImageFilename) throw new ErrorResponse("BAD_REQUEST", { message: "No file provided" });

  if (isUploadedImage(currentUser?.image)) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, currentUser!.image!));
    } catch {}
  }

  return res.send({ data: { image: newImageFilename } });
}

const uploadAvatar: Route<Record<string, never>, ResponseBody> = {
  url: "/account/avatar",
  method: "POST",
  schema: schemaRoute,
  handler,
};

export default uploadAvatar;
