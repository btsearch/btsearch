import { fileTypeFromBuffer } from "file-type";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { optimize } from "svgo";

import { ErrorResponse } from "../../errors.js";
import { UPLOAD_DIR } from "../../utils/photoFiles.js";

const RASTER_MIME_TYPES = new Set(["image/png", "image/webp"]);
const MAX_RASTER_WIDTH = 768;
const MAX_RASTER_HEIGHT = 128;
const MIN_RASTER_HEIGHT = 48;
const MAX_RASTER_PIXELS = 16_000_000;
const LARGEST_SVG_SIDE = 100_000;
const VIEW_BOX_PATTERN = /<svg\b[^>]*?\sviewBox="([^"]*)"/;
const UNSUPPORTED_LOGO_MESSAGE = "The logo must be an SVG, PNG or WebP image";

type EncodedLogo = { data: Buffer; extension: "svg" | "webp"; width: number; height: number };

function encodeVector(input: Buffer): EncodedLogo {
  const { data } = optimize(input.toString("utf8"), {
    multipass: true,
    plugins: [
      { name: "preset-default", params: { overrides: { removeComments: { preservePatterns: false } } } },
      "removeDimensions",
      "removeScripts",
    ],
  });

  const viewBox = VIEW_BOX_PATTERN.exec(data)?.[1] ?? "";
  const [, , width = 0, height = 0] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const isSized = [width, height].every((side) => side >= 1 && side <= LARGEST_SVG_SIDE);
  if (!isSized) throw new ErrorResponse("BAD_REQUEST", { message: "The SVG logo needs a viewBox, or a width and a height in pixels" });

  return { data: Buffer.from(data, "utf8"), extension: "svg", width: Math.ceil(width), height: Math.ceil(height) };
}

async function encodeRaster(input: Buffer): Promise<EncodedLogo> {
  const image = sharp(input, { limitInputPixels: MAX_RASTER_PIXELS });
  const { height } = await image.metadata();
  if (height < MIN_RASTER_HEIGHT) throw new ErrorResponse("BAD_REQUEST", { message: `The logo must be at least ${MIN_RASTER_HEIGHT} pixels high` });

  const { data, info } = await image
    .resize({ width: MAX_RASTER_WIDTH, height: MAX_RASTER_HEIGHT, fit: "inside", withoutEnlargement: true })
    .webp({ lossless: true })
    .toBuffer({ resolveWithObject: true });

  return { data, extension: "webp", width: info.width, height: info.height };
}

export async function encodeBrandLogo(input: Buffer): Promise<EncodedLogo> {
  try {
    const detected = await fileTypeFromBuffer(input);
    if (detected === undefined || detected.mime === "application/xml") return encodeVector(input);
    if (!RASTER_MIME_TYPES.has(detected.mime)) throw new ErrorResponse("BAD_REQUEST", { message: UNSUPPORTED_LOGO_MESSAGE });

    return await encodeRaster(input);
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("BAD_REQUEST", { message: UNSUPPORTED_LOGO_MESSAGE, cause: error });
  }
}

export async function writeBrandLogo(fileName: string, data: Buffer): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, fileName), data);
}

export async function deleteBrandLogo(fileName: string | null): Promise<void> {
  if (fileName === null) return;
  await fs.unlink(path.join(UPLOAD_DIR, fileName)).catch(() => undefined);
}
