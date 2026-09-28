import * as ExifReader from "exifreader";

import { ErrorResponse } from "../errors.js";

const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;
const EXIF_OFFSET_PATTERN = /^[+-]\d{2}:\d{2}$/;

export function extractExifDate(buffer: Buffer): Date | null {
  try {
    const tags = ExifReader.load(buffer);
    const original = tags["DateTimeOriginal"]?.description;
    const raw = original ?? tags["DateTimeDigitized"]?.description;
    if (!raw) return null;
    // EXIF date format: "YYYY:MM:DD HH:MM:SS"
    const [datePart, timePart] = raw.split(" ");
    if (!datePart || !timePart) return null;
    const offset = tags[original ? "OffsetTimeOriginal" : "OffsetTimeDigitized"]?.description;
    const zone = offset !== undefined && EXIF_OFFSET_PATTERN.test(offset) ? offset : "Z";
    const date = new Date(`${datePart.replaceAll(":", "-")}T${timePart}${zone}`);
    if (Number.isNaN(date.getTime())) return null;
    const now = Date.now();
    if (date.getTime() > now + MAX_UTC_OFFSET_MS) return null;
    return new Date(Math.min(date.getTime(), now));
  } catch {
    return null;
  }
}

export function parseTakenAt(raw: string): Date {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new ErrorResponse("BAD_REQUEST", { message: "Invalid takenAt date" });
  if (parsed.getTime() > Date.now()) throw new ErrorResponse("BAD_REQUEST", { message: "takenAt cannot be in the future" });
  return parsed;
}
