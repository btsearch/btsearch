const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
export const EARTH_RADIUS_M = 6_371_000;

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

export function formatFrequency(freqMhz: number): string {
  if (freqMhz < 1000) return `${freqMhz} MHz`;
  const ghz = freqMhz / 1000;
  return `${Number.isInteger(ghz) ? ghz : ghz.toFixed(1)} GHz`;
}

export function formatSpeed(mbps: number): string {
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(2)} Gbps` : `${Math.round(mbps)} Mbps`;
}

export function formatBandwidth(bandwidth: string): string {
  const num = Number(bandwidth);
  if (Number.isNaN(num)) return bandwidth;
  return num >= 1000 ? `${(num / 1000).toFixed(2)} Gbps` : `${num} Mbps`;
}

const MODULATION_NORMALIZE_REGEX = /[\s\-_]/g;
const QAM_REGEX = /(\d+)QAM/;

const MODULATION_BITS: Record<string, number> = {
  BPSK: 1,
  QPSK: 2,
  "4QAM": 2,
  "8QAM": 3,
  "16QAM": 4,
  "32QAM": 5,
  "64QAM": 6,
  "128QAM": 7,
  "256QAM": 8,
  "512QAM": 9,
  "1024QAM": 10,
  "2048QAM": 11,
  "4096QAM": 12,
};

export function getModulationBits(modulationType: string): number | null {
  const normalized = modulationType.toUpperCase().replace(MODULATION_NORMALIZE_REGEX, "");
  if (MODULATION_BITS[normalized] != null) return MODULATION_BITS[normalized];
  if (normalized.includes("QPSK")) return 2;
  if (normalized.includes("BPSK")) return 1;
  const match = normalized.match(QAM_REGEX);
  if (match) {
    const bits = Math.log2(Number.parseInt(match[1]!, 10));
    if (Number.isInteger(bits) && bits >= 1 && bits <= 14) return bits;
  }
  return null;
}

export function calculateRadiolineSpeed(chWidth: number, modulationType: string): number | null {
  const n = getModulationBits(modulationType);
  return n !== null ? chWidth * n * 0.85 : null;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;
  const dLatRad = (lat2 - lat1) * DEG_TO_RAD;
  const dLonRad = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(dLatRad / 2) ** 2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLonRad / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function destinationPoint(lat: number, lon: number, bearingDeg: number, distanceM: number): [number, number] {
  const lat1Rad = lat * DEG_TO_RAD;
  const lon1Rad = lon * DEG_TO_RAD;
  const bearingRad = bearingDeg * DEG_TO_RAD;
  const angDist = distanceM / EARTH_RADIUS_M;
  const lat2Rad = Math.asin(Math.sin(lat1Rad) * Math.cos(angDist) + Math.cos(lat1Rad) * Math.sin(angDist) * Math.cos(bearingRad));
  const lon2Rad =
    lon1Rad + Math.atan2(Math.sin(bearingRad) * Math.sin(angDist) * Math.cos(lat1Rad), Math.cos(angDist) - Math.sin(lat1Rad) * Math.sin(lat2Rad));
  return [lat2Rad * RAD_TO_DEG, lon2Rad * RAD_TO_DEG];
}

export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;
  const dLonRad = (lon2 - lon1) * DEG_TO_RAD;
  const y = Math.sin(dLonRad) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLonRad);
  return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360;
}
