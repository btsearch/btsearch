import { getOperatorColor } from "@/lib/operatorUtils";

const PIE_IMAGE_SIZE = 34;
const PIE_FILL_RADIUS = 13;
const PIE_STROKE_RADIUS = 15;
const PIE_STROKE_WIDTH = 4;

export function createPieChartImage(segments: { value: number; color: string }[], strokeColor = "#fff"): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = PIE_IMAGE_SIZE;
  canvas.height = PIE_IMAGE_SIZE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const center = PIE_IMAGE_SIZE / 2;
  const total = segments.reduce((sum, seg) => sum + seg.value, 0) || 1;

  let startAngle = -Math.PI / 2;
  for (const { value, color } of segments) {
    const endAngle = startAngle + (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, PIE_FILL_RADIUS + 0.5, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    startAngle = endAngle;
  }

  ctx.beginPath();
  ctx.arc(center, center, PIE_STROKE_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = PIE_STROKE_WIDTH;
  ctx.stroke();

  return ctx.getImageData(0, 0, PIE_IMAGE_SIZE, PIE_IMAGE_SIZE);
}

function parseOperators(operatorsJson: string | undefined): number[] {
  try {
    return JSON.parse(operatorsJson || "[]");
  } catch {
    return [];
  }
}

function createOperatorSegments(operators: number[], hasNullOperator?: boolean) {
  const segments = operators.map((mnc) => ({ value: 1, color: getOperatorColor(mnc) }));
  if (hasNullOperator) segments.push({ value: 1, color: getOperatorColor(-1) });
  return segments;
}

const PIN_W = 22;
const PIN_H = 34;
const PIN_CX = PIN_W / 2;
const PIN_CY = 10;
const PIN_R = 9;

function tracePinPath(ctx: CanvasRenderingContext2D) {
  const cx = PIN_CX,
    cy = PIN_CY,
    r = PIN_R,
    H = PIN_H;
  ctx.moveTo(cx, H);
  ctx.bezierCurveTo(cx - 3, H - 5, cx - r, cy + r + 2, cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0, false);
  ctx.bezierCurveTo(cx + r, cy + r + 2, cx + 3, H - 5, cx, H);
  ctx.closePath();
}

function createPinImage(segments: { value: number; color: string }[]): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = PIN_W;
  canvas.height = PIN_H;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const cx = PIN_CX,
    cy = PIN_CY,
    r = PIN_R;

  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let startAngle = -Math.PI / 2;
  for (const { value, color } of segments) {
    const endAngle = startAngle + (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 4, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    startAngle = endAngle;
  }

  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  tracePinPath(ctx);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.beginPath();
  tracePinPath(ctx);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return ctx.getImageData(0, 0, PIN_W, PIN_H);
}

export function syncMarkerImages(map: maplibregl.Map, features: GeoJSON.Feature[], addedImages: Set<string>): void {
  for (const feature of features) {
    const props = feature.properties;
    if (!props) continue;

    if (props.isMultiOperator) {
      const pieImageId = props.pieImageId;
      if (!pieImageId) continue;
      const imageId = `m${pieImageId}`;
      if (addedImages.has(imageId)) continue;
      if (map.hasImage(imageId)) {
        addedImages.add(imageId);
        continue;
      }
      const segments = createOperatorSegments(parseOperators(props.operators), props.hasNullOperator);
      const imageData = createPinImage(segments);
      if (imageData) {
        map.addImage(imageId, imageData);
        addedImages.add(imageId);
      }
    } else {
      const color = props.color;
      if (!color) continue;
      const imageId = `mpin-${color}`;
      if (addedImages.has(imageId)) continue;
      if (map.hasImage(imageId)) {
        addedImages.add(imageId);
        continue;
      }
      const imageData = createPinImage([{ value: 1, color }]);
      if (imageData) {
        map.addImage(imageId, imageData);
        addedImages.add(imageId);
      }
    }
  }
}

export function syncPieImages(map: maplibregl.Map, features: GeoJSON.Feature[], addedImages: Set<string>): void {
  for (const feature of features) {
    const pieImageId = feature.properties?.pieImageId;
    if (!pieImageId || addedImages.has(pieImageId)) continue;

    const operators = parseOperators(feature.properties?.operators);

    if (map.hasImage(pieImageId)) {
      addedImages.add(pieImageId);
      continue;
    }

    const status = feature.properties?.status;
    const strokeColor = status === "pending" ? "#eab308" : status === "inactive" ? "#ef4444" : "#fff";
    const segments = createOperatorSegments(operators, feature.properties?.hasNullOperator);
    const imageData = createPieChartImage(segments, strokeColor);

    if (imageData) {
      map.addImage(pieImageId, imageData);
      addedImages.add(pieImageId);
    }
  }
}
