import sharp, { type SharpInput, type SharpOptions } from "sharp";

export function encodeCommentPhoto(input: SharpInput, options?: SharpOptions): Promise<Buffer> {
  return sharp(input, options)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}
