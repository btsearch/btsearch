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
  const knownBits = MODULATION_BITS[normalized];
  if (knownBits !== undefined) return knownBits;
  if (normalized.includes("QPSK")) return 2;
  if (normalized.includes("BPSK")) return 1;
  const match = normalized.match(QAM_REGEX);
  if (match) {
    const bits = Math.log2(Number.parseInt(match[1]!, 10));
    if (Number.isInteger(bits) && bits >= 1 && bits <= 14) return bits;
  }
  return null;
}

export function calculateMicrowaveLinkSpeed(chWidth: number, modulationType: string): number | null {
  const bits = getModulationBits(modulationType);
  return bits === null ? null : chWidth * bits * 0.85;
}
