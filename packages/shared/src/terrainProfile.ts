export const TERRAIN_RECEIVER_BOUNDS = {
  latitude: { min: 48.8, max: 55.2 },
  longitude: { min: 13.8, max: 24.5 },
  mountedHeight: { min: 1, max: 100 },
} as const;

export const ANTENNA_AZIMUTH_TOLERANCE_DEG = 60;

export function circularAzimuthDeltaDeg(a: number, b: number): number {
  const diff = Math.abs((((a % 360) + 360) % 360) - (((b % 360) + 360) % 360));
  return Math.min(diff, 360 - diff);
}
