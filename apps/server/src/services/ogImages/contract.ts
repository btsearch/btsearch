import { z } from "zod";

export const OG_RENDER_ROUTE = "/internal/og/render";
export const OG_RENDER_HEALTH_ROUTE = "/health";
export const OG_RENDER_OUTCOME_HEADER = "x-og-render-outcome";
export const OG_RENDER_MAX_AGE_HEADER = "x-og-max-age";
export const OG_RENDER_BODY_LIMIT_BYTES = 4 * 1024;
export const OG_RENDER_MAX_AGE_SECONDS = 60 * 60;

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const MAX_MERCATOR_LATITUDE = 85.051_128_78;
const colorSchema = z.string().regex(/^#[\dA-Fa-f]{6}$/);
const baseRequestShape = {
  version: z.literal(1),
  id: z.number().int().min(1).max(MAX_POSTGRES_INTEGER),
  latitude: z.number().finite().min(-MAX_MERCATOR_LATITUDE).max(MAX_MERCATOR_LATITUDE),
  longitude: z.number().finite().min(-180).max(180),
};

export const OGRenderRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...baseRequestShape,
    kind: z.literal("station"),
    colors: z.tuple([colorSchema]),
  }),
  z.strictObject({
    ...baseRequestShape,
    kind: z.literal("location"),
    colors: z.array(colorSchema).max(32),
  }),
]);

export type OGRenderRequest = z.infer<typeof OGRenderRequestSchema>;

export const OGRenderOutcomeSchema = z.enum(["image", "fallback"]);

export type OGRenderOutcome = z.infer<typeof OGRenderOutcomeSchema>;

export type OGRenderResult = {
  buffer: Buffer;
  maxAgeSeconds: number;
  outcome: OGRenderOutcome;
};

export type OGImageRenderer = (request: OGRenderRequest) => Promise<OGRenderResult>;
