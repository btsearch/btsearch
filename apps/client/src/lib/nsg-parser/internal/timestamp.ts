export function parseNsgTimestampUs(timestampUs: string): bigint | null {
  try {
    return BigInt(timestampUs);
  } catch {
    return null;
  }
}

export function convertNsgTimestampUsToMs(timestampUs: bigint): number | null {
  const timestampMs = Number(timestampUs / 1000n) + Number(timestampUs % 1000n) / 1000;
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

export function parseNsgTimestampMs(timestampUs: string): number | null {
  const value = parseNsgTimestampUs(timestampUs);
  return value === null ? null : convertNsgTimestampUsToMs(value);
}

export function formatNsgTimestamp(timestampUs: string): string {
  const epochUs = BigInt(timestampUs);
  const date = new Date(Number(epochUs / 1000n));
  return `${date.toISOString().slice(0, 19)}.${(epochUs % 1_000_000n).toString().padStart(6, "0")}Z`;
}
