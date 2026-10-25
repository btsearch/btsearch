import type { Map as MapLibreMap } from "maplibre-gl";

export type RingLook = { colors: readonly string[]; isDashed: boolean; isCrossed: boolean };

const RING_PIXEL_RATIO = 2;
const RING_IMAGE_SIZE = 40 * RING_PIXEL_RATIO;
const RING_RADIUS = 14 * RING_PIXEL_RATIO;
const RING_HALO_WIDTH = 7 * RING_PIXEL_RATIO;
const RING_WIDTH = 4 * RING_PIXEL_RATIO;
const RING_DASH = [5 * RING_PIXEL_RATIO, 3.8 * RING_PIXEL_RATIO];
const RING_CROSS_FROM = 11 * RING_PIXEL_RATIO;
const RING_CROSS_TO = 29 * RING_PIXEL_RATIO;
const RING_CROSS_HALO_WIDTH = 5 * RING_PIXEL_RATIO;
const RING_CROSS_WIDTH = 2.5 * RING_PIXEL_RATIO;
const RING_HALO_COLOR = "#ffffff";

function strokeRingCross(ctx: CanvasRenderingContext2D, color: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(RING_CROSS_FROM, RING_CROSS_TO);
  ctx.lineTo(RING_CROSS_TO, RING_CROSS_FROM);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function createRingImage({ colors, isDashed, isCrossed }: RingLook): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = RING_IMAGE_SIZE;
  canvas.height = RING_IMAGE_SIZE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const center = RING_IMAGE_SIZE / 2;
  ctx.beginPath();
  ctx.arc(center, center, RING_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = RING_HALO_COLOR;
  ctx.lineWidth = RING_HALO_WIDTH;
  ctx.stroke();

  const arc = (Math.PI * 2) / Math.max(colors.length, 1);
  ctx.lineWidth = RING_WIDTH;
  ctx.setLineDash(isDashed ? RING_DASH : []);
  colors.forEach((color, index) => {
    const startAngle = -Math.PI / 2 + index * arc;
    ctx.beginPath();
    ctx.arc(center, center, RING_RADIUS, startAngle, startAngle + arc);
    ctx.strokeStyle = color;
    ctx.stroke();
  });

  if (isCrossed) {
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    strokeRingCross(ctx, RING_HALO_COLOR, RING_CROSS_HALO_WIDTH);
    strokeRingCross(ctx, colors[0] ?? RING_HALO_COLOR, RING_CROSS_WIDTH);
  }

  return ctx.getImageData(0, 0, RING_IMAGE_SIZE, RING_IMAGE_SIZE);
}

export function getRingImageId({ colors, isDashed, isCrossed }: RingLook): string {
  return `estimated-ring:${colors.join(",")}:${isDashed ? "d" : "s"}${isCrossed ? ":x" : ""}`;
}

export function addRingImages(map: MapLibreMap, rings: Iterable<RingLook>): void {
  for (const ring of rings) {
    const imageId = getRingImageId(ring);
    if (map.hasImage(imageId)) continue;
    const imageData = createRingImage(ring);
    if (imageData) map.addImage(imageId, imageData, { pixelRatio: RING_PIXEL_RATIO });
  }
}
