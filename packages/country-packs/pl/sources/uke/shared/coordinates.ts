const DMS_COORDINATE = /^(\d{1,3})([NSEW])(\d{1,2})'(\d{1,2}(?:\.\d+)?)'*"*$/;
const COMPACT_COORDINATE_LENGTH = 6;

export function parseDmsCoordinate(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const match = value.trim().match(DMS_COORDINATE);
  if (!match) return null;

  const [, degreesText = "", hemisphere, minutesText = "", secondsText = ""] = match;
  const minutes = Number.parseInt(minutesText, 10);
  const seconds = Number.parseFloat(secondsText);
  if (minutes >= 60 || seconds >= 60) return null;

  const decimalDegrees = Number.parseInt(degreesText, 10) + minutes / 60 + seconds / 3600;
  return Number((hemisphere === "S" || hemisphere === "W" ? -decimalDegrees : decimalDegrees).toFixed(6));
}

export function parseCompactCoordinate(value: string | undefined, hemisphere: "N" | "E"): number | null {
  const digits = value?.trim() ?? "";
  if (digits.length !== COMPACT_COORDINATE_LENGTH) return null;

  return parseDmsCoordinate(`${digits.slice(0, 2)}${hemisphere}${digits.slice(2, 4)}'${digits.slice(4, 6)}''`);
}
