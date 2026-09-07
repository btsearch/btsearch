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
