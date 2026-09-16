import { ApiResponseError } from "./api";

export function photoQualityErrorKey(error: unknown): "photos.tooSmall" | "photos.tooBlurry" | null {
  if (error instanceof ApiResponseError) {
    if (error.errors.some(({ code }) => code === "PHOTO_TOO_SMALL")) return "photos.tooSmall";
    if (error.errors.some(({ code }) => code === "PHOTO_TOO_BLURRY")) return "photos.tooBlurry";
  }
  return null;
}
