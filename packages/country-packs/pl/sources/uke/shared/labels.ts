import type { LabelRat, LabelVariant, PermitLabel } from "../../../../core/sources.ts";

const RAILWAY_FILE_LABEL = /^gsm-r\s*(\d{3,4})?/;
const COMMERCIAL_FILE_LABEL = /^(gsm|cdma|umts|lte|5g)(\d{3,4})$/;
const SYSTEM_TYPE = /^(GSM|UMTS|LTE|5G|IOT)(\d{3,4})$/;
const DEFAULT_RAILWAY_MHZ = 900;

const FILE_LABEL_RATS: Readonly<Record<string, LabelRat>> = { gsm: "GSM", cdma: "CDMA", umts: "UMTS", lte: "LTE", "5g": "NR" };
const SYSTEM_TYPE_RATS: Readonly<Record<string, LabelRat>> = { GSM: "GSM", UMTS: "UMTS", LTE: "LTE", "5G": "NR", IOT: "IOT" };
const LABEL_RATS: readonly LabelRat[] = ["GSM", "CDMA", "UMTS", "LTE", "NR", "IOT"];
const LABEL_VARIANTS: readonly LabelVariant[] = ["commercial", "railway"];

function commercialLabel(rat: LabelRat | undefined, digits: string | undefined): PermitLabel | null {
  if (rat === undefined || digits === undefined) return null;

  const mhz = Number(digits);
  return { rat, mhz: rat === "NR" && mhz === 3600 ? 3500 : mhz, variant: "commercial" };
}

export function parseFileLabel(linkText: string): PermitLabel | null {
  const normalized = linkText.trim().toLowerCase();
  const railwayMatch = normalized.match(RAILWAY_FILE_LABEL);
  if (railwayMatch) return { rat: "GSM", mhz: railwayMatch[1] ? Number(railwayMatch[1]) : DEFAULT_RAILWAY_MHZ, variant: "railway" };

  const firstWord = normalized.split(/\s|-/)[0] ?? "";
  const commercialMatch = firstWord.match(COMMERCIAL_FILE_LABEL);
  return commercialMatch ? commercialLabel(FILE_LABEL_RATS[commercialMatch[1] ?? ""], commercialMatch[2]) : null;
}

export function parseSystemTypeLabel(systemType: string | undefined): PermitLabel | null {
  const match = systemType?.trim().toUpperCase().match(SYSTEM_TYPE);
  return match ? commercialLabel(SYSTEM_TYPE_RATS[match[1] ?? ""], match[2]) : null;
}

export function labelSliceKey(label: PermitLabel): string {
  return `${label.rat}:${label.mhz}:${label.variant}`;
}

export function labelFromSliceKey(sliceKey: string): PermitLabel {
  const [ratText, mhzText, variantText] = sliceKey.split(":");
  const rat = LABEL_RATS.find((known) => known === ratText);
  const variant = LABEL_VARIANTS.find((known) => known === variantText);
  const mhz = Number(mhzText);
  if (rat === undefined || variant === undefined || !Number.isFinite(mhz) || mhz <= 0) throw new Error(`"${sliceKey}" is not a permit label`);

  return { rat, mhz, variant };
}
