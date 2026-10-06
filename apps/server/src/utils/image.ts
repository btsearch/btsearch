import { fileTypeFromBuffer } from "file-type";
import libheif from "libheif-js";
import type { Readable } from "node:stream";
import sharp, { type Sharp, type SharpInput, type SharpOptions } from "sharp";

import { ErrorResponse, MALFORMED_MULTIPART_MESSAGE } from "../errors.js";

const HEIC_MIMES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const MIN_PHOTO_SHORT_SIDE = 480;
const MIN_PHOTO_LONG_SIDE = 640;
const QUALITY_CHECK_SIZE = 1024;
const QUALITY_TILE_COUNT = 4;
const MIN_PHOTO_SHARPNESS = 1.25;
const FULL_MAX_SIDE = 4096;
const FULL_MIN_SOURCE_SIDE = 2560;
const DISPLAY_MAX_SIDE = 2048;
const THUMB_SHORT_SIDE = 640;
const THUMB_MAX_LONG_SIDE = 1280;
const DISPLAY_WEBP = { quality: 85, effort: 6, smartSubsample: true };
const THUMB_WEBP = { quality: 80, effort: 6, smartSubsample: true };
const FULL_AVIF = { quality: 70, effort: 4, chromaSubsampling: "4:2:0" };

type PhotoInput = { input: SharpInput; options?: SharpOptions };

export type EncodedPhoto = {
  display: Buffer;
  thumb: Buffer;
  full: Buffer | null;
  width: number;
  height: number;
};

export function isHeic(mimetype: string): boolean {
  return HEIC_MIMES.has(mimetype.toLowerCase());
}

export async function readUploadedFile(file: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of file) chunks.push(chunk as Buffer);
  } catch (cause) {
    throw new ErrorResponse("BAD_REQUEST", { message: MALFORMED_MULTIPART_MESSAGE, cause });
  }
  return Buffer.concat(chunks);
}

export function isUntouchedFileInput(filename: string, content: Buffer): boolean {
  return filename === "" && content.length === 0;
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

export async function refusingUnreadableImage<Decoded>(decode: () => Promise<Decoded>): Promise<Decoded> {
  try {
    return await decode();
  } catch (cause) {
    throw new ErrorResponse("BAD_REQUEST", { message: "The file is not a readable image", cause });
  }
}

export async function decodePhotoInput(buffer: Buffer): Promise<PhotoInput> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !detected.mime.startsWith("image/")) throw new ErrorResponse("BAD_REQUEST", { message: "Only image files are allowed" });
  if (!isHeic(detected.mime)) return { input: buffer };

  const { data, width, height } = await refusingUnreadableImage(() => decodeHeicToRaw(buffer));
  return { input: data, options: { raw: { width, height, channels: 4 } } };
}

function encodeThumb(image: Sharp, width: number, height: number) {
  const scale = Math.min(1, THUMB_SHORT_SIDE / Math.min(width, height), THUMB_MAX_LONG_SIDE / Math.max(width, height));
  return image
    .resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), fit: "fill" })
    .webp(THUMB_WEBP)
    .toBuffer();
}

export async function encodeStationPhoto({ input, options }: PhotoInput): Promise<EncodedPhoto> {
  // Every tier is encoded from raw pixels, which carry no EXIF/GPS/XMP, so no output can leak metadata
  const { data, info } = await refusingUnreadableImage(() =>
    sharp(input, options)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: FULL_MAX_SIDE, height: FULL_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true }),
  );
  const pixels = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });

  const display = await pixels()
    .resize({ width: DISPLAY_MAX_SIDE, height: DISPLAY_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp(DISPLAY_WEBP)
    .toBuffer({ resolveWithObject: true });
  await assertStationPhotoQuality(display.data);

  const hasFull = Math.max(info.width, info.height) > FULL_MIN_SOURCE_SIDE;
  const [thumb, full] = await Promise.all([encodeThumb(pixels(), info.width, info.height), hasFull ? pixels().avif(FULL_AVIF).toBuffer() : null]);

  return {
    display: display.data,
    thumb,
    full,
    width: hasFull ? info.width : display.info.width,
    height: hasFull ? info.height : display.info.height,
  };
}

export async function encodeLegacyPhotoThumb(display: Buffer) {
  const { width, height } = await sharp(display).metadata();
  if (!width || !height) throw new Error("Unreadable photo");

  return { thumb: await encodeThumb(sharp(display), width, height), width, height };
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
