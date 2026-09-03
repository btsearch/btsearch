import type { BandVariant, ratEnum } from "@openbts/drizzle";

type Rat = (typeof ratEnum.enumValues)[number];

export interface BandKey {
  rat: Rat;
  value: number;
  variant: (typeof BandVariant.enumValues)[number];
}

function parseCommercialRat(technology: string): Rat {
  switch (technology) {
    case "gsm":
      return "GSM";
    case "cdma":
      return "CDMA";
    case "umts":
      return "UMTS";
    case "lte":
      return "LTE";
    default:
      return "NR";
  }
}

export function parseBandFromLabel(label: string): BandKey | null {
  const normalized = label.trim().toLowerCase();
  const gsmrMatch = normalized.match(/^gsm-r\s*(\d{3,4})?/);

  if (gsmrMatch) {
    const value = gsmrMatch[1] ? Number(gsmrMatch[1]) : 900;
    return { rat: "GSM", value, variant: "railway" };
  }

  const firstToken = (normalized.split(/\s|-/)[0] ?? "").trim();
  if (!firstToken) return null;

  const match = firstToken.match(/^(gsm|cdma|umts|lte|5g)(\d{3,4})$/i);
  if (!match) return null;

  const technology = match[1]?.toLowerCase() ?? "";
  const value = Number(match[2] ?? "");
  if (!Number.isFinite(value)) return null;

  const rat = parseCommercialRat(technology);
  const bandValue = rat === "NR" && value === 3600 ? 3500 : value;
  return { rat, value: bandValue, variant: "commercial" };
}

export function getBandMapKey(band: BandKey): string {
  return `${band.rat}:${band.value}:${band.variant}`;
}
