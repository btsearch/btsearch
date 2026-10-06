import { attachments } from "@openbts/drizzle";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod/v4";

import type { EncodedPhoto } from "./image.js";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export const photoFileColumns = {
  width: attachments.width,
  height: attachments.height,
  has_thumb: attachments.has_thumb,
  has_full: attachments.has_full,
};

export const photoFileShape = {
  width: z.number().nullable(),
  height: z.number().nullable(),
  has_thumb: z.boolean(),
  has_full: z.boolean(),
};

export type PhotoFileFields = { width: number | null; height: number | null; has_thumb: boolean; has_full: boolean };

export function photoFileFields(row: PhotoFileFields): PhotoFileFields {
  return { width: row.width, height: row.height, has_thumb: row.has_thumb, has_full: row.has_full };
}

const PHOTO_FILE_SUFFIXES = { display: ".webp", thumb: ".thumb.webp", full: ".full.avif" } as const;

export function photoFilePath(uuid: string, tier: keyof typeof PHOTO_FILE_SUFFIXES = "display") {
  return path.join(UPLOAD_DIR, `${uuid}${PHOTO_FILE_SUFFIXES[tier]}`);
}

export async function writePhotoFiles(uuid: string, photo: EncodedPhoto) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(photoFilePath(uuid), photo.display),
    fs.writeFile(photoFilePath(uuid, "thumb"), photo.thumb),
    photo.full ? fs.writeFile(photoFilePath(uuid, "full"), photo.full) : null,
  ]);
  return {
    size: photo.display.length + photo.thumb.length + (photo.full?.length ?? 0),
    width: photo.width,
    height: photo.height,
    has_thumb: true,
    has_full: photo.full !== null,
  };
}

export async function deletePhotoFiles(uuids: readonly string[]) {
  const paths = uuids.flatMap((uuid) => Object.values(PHOTO_FILE_SUFFIXES).map((suffix) => path.join(UPLOAD_DIR, `${uuid}${suffix}`)));
  await Promise.all(paths.map((filePath) => fs.unlink(filePath).catch(() => undefined)));
}
