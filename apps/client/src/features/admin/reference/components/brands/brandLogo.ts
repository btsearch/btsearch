import { BRAND_LOGO_MAX_BYTES, BRAND_LOGO_TYPES } from "../../api/brands";
import type { BrandLogo } from "../../types";
import { formatFileSize } from "@/lib/format";

type BrandLogoFileProblem = "type" | "size";

const FILE_EXTENSION = /\.([a-z0-9]+)(?:[?#]|$)/i;
const LOGO_FORMAT_NAMES: ReadonlyMap<string, string> = new Map([
  ["svg", "SVG"],
  ["png", "PNG"],
  ["webp", "WebP"],
]);
const UNMEASURED_LOGO_SIDE = 1;

function getLogoFormat(url: string): string | null {
  const extension = FILE_EXTENSION.exec(url)?.[1]?.toLowerCase();
  if (extension === undefined) return null;
  return LOGO_FORMAT_NAMES.get(extension) ?? extension.toUpperCase();
}

export function getLogoFileProblem(file: File): BrandLogoFileProblem | null {
  if (!BRAND_LOGO_TYPES.includes(file.type)) return "type";
  return file.size > BRAND_LOGO_MAX_BYTES ? "size" : null;
}

export function toLocalLogo(previewUrl: string): BrandLogo {
  return { url: previewUrl, width: UNMEASURED_LOGO_SIDE, height: UNMEASURED_LOGO_SIDE };
}

export function formatLogoInfo(logo: BrandLogo): string {
  const size = `${logo.width} x ${logo.height}`;
  const format = getLogoFormat(logo.url);
  return format === null ? size : `${format}, ${size}`;
}

export function formatLogoFileInfo(file: File): string {
  return `${file.name}, ${formatFileSize(file.size)}`;
}
