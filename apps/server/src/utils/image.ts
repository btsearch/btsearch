import libheif from "libheif-js";
import sharp from "sharp";

import { ErrorResponse } from "../errors.js";

const HEIC_MIMES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const MIN_PHOTO_SHORT_SIDE = 480;
const MIN_PHOTO_LONG_SIDE = 640;
const QUALITY_CHECK_SIZE = 1024;
const QUALITY_TILE_COUNT = 4;
const MIN_PHOTO_SHARPNESS = 1.5;

export function isHeic(mimetype: string): boolean {
  return HEIC_MIMES.has(mimetype.toLowerCase());
}

export async function decodeHeicToRaw(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(buffer);
  const image = images[0];
  if (!image) throw new Error("No image found in HEIC file");

  const width = image.get_width();
  const height = image.get_height();

  const rgba = await new Promise<Uint8ClampedArray>((resolve, reject) => {
    image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (result) => {
      if (!result) return reject(new Error("Failed to decode HEIC image"));
      resolve(result.data);
    });
  });

  return { data: Buffer.from(rgba.buffer), width, height };
}

export async function assertStationPhotoQuality(photo: Buffer): Promise<void> {
  const { width, height } = await sharp(photo).metadata();
  if (!width || !height || Math.min(width, height) < MIN_PHOTO_SHORT_SIDE || Math.max(width, height) < MIN_PHOTO_LONG_SIDE)
    throw new ErrorResponse("PHOTO_TOO_SMALL");

  const { data, info } = await sharp(photo)
    .resize({ width: QUALITY_CHECK_SIZE, height: QUALITY_CHECK_SIZE, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .png()
    .toBuffer({ resolveWithObject: true });

  if ((await sharp(data).stats()).sharpness >= MIN_PHOTO_SHARPNESS) return;

  const tileSharpness = await Promise.all(
    Array.from({ length: QUALITY_TILE_COUNT ** 2 }, async (_, index) => {
      const row = Math.floor(index / QUALITY_TILE_COUNT);
      const column = index % QUALITY_TILE_COUNT;
      const left = Math.floor((column * info.width) / QUALITY_TILE_COUNT);
      const top = Math.floor((row * info.height) / QUALITY_TILE_COUNT);
      const width = Math.floor(((column + 1) * info.width) / QUALITY_TILE_COUNT) - left;
      const height = Math.floor(((row + 1) * info.height) / QUALITY_TILE_COUNT) - top;
      const tile = await sharp(data).extract({ left, top, width, height }).png().toBuffer();
      return (await sharp(tile).stats()).sharpness;
    }),
  );
  if (tileSharpness.some((score) => score >= MIN_PHOTO_SHARPNESS)) return;

  throw new ErrorResponse("PHOTO_TOO_BLURRY");
}
