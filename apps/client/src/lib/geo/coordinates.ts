import type { GpsFormat } from "@/hooks/usePreferences";

export function formatCoordinates(lat: number, lng: number, format: GpsFormat): string {
  if (format === "dms") {
    return `${toDms(lat, "lat")} ${toDms(lng, "lng")}`;
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function toDms(decimal: number, axis: "lat" | "lng"): string {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesDecimal = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesDecimal);
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(1);

  const direction = axis === "lat" ? (decimal >= 0 ? "N" : "S") : decimal >= 0 ? "E" : "W";

  return `${degrees}°${minutes}'${seconds}"${direction}`;
}
