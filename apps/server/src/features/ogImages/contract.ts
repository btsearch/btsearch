import { z } from "zod";

export const OG_RENDER_ROUTE = "/internal/og/render";
export const OG_RENDER_HEALTH_ROUTE = "/health";
export const OG_RENDER_OUTCOME_HEADER = "x-og-render-outcome";
export const OG_RENDER_MAX_AGE_HEADER = "x-og-max-age";
export const OG_RENDER_BODY_LIMIT_BYTES = 4 * 1024;
export const OG_RENDER_MAX_AGE_SECONDS = 60 * 60;
export const OG_RENDER_LIST_MAX_AGE_SECONDS = 5 * 60;
export const OG_LIST_NAME_MAX_LENGTH = 200;

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const MAX_MERCATOR_LATITUDE = 85.051_128_78;
const colorSchema = z.string().regex(/^#[\dA-Fa-f]{6}$/);
const baseRequestShape = {
  version: z.literal(1),
  id: z.number().int().min(1).max(MAX_POSTGRES_INTEGER),
  latitude: z.number().finite().min(-MAX_MERCATOR_LATITUDE).max(MAX_MERCATOR_LATITUDE),
  longitude: z.number().finite().min(-180).max(180),
};
const listOperatorSchema = z.strictObject({
  name: z.string().min(1).max(100),
  count: z.number().int().min(1),
  color: colorSchema,
  logoFile: z
    .string()
    .regex(/^[\da-f-]{36}\.(?:svg|webp)$/)
    .nullable(),
});

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
  z.strictObject({
    version: z.literal(1),
    kind: z.literal("list"),
    id: z.string().regex(/^[\w-]{14}$/),
    name: z.string().min(1).max(OG_LIST_NAME_MAX_LENGTH),
    ownerUsername: z.string().min(1).max(25).nullable(),
    stationCount: z.number().int().min(0),
    microwaveLinkCount: z.number().int().min(0),
    operators: z.array(listOperatorSchema).max(4),
    otherOperators: z.strictObject({ count: z.number().int().min(1), stationCount: z.number().int().min(1) }).nullable(),
  }),
]);

export type OGRenderRequest = z.infer<typeof OGRenderRequestSchema>;
export type OGListRenderRequest = Extract<OGRenderRequest, { kind: "list" }>;
export type OGMapRenderRequest = Exclude<OGRenderRequest, OGListRenderRequest>;

export const OGRenderOutcomeSchema = z.enum(["image", "fallback"]);

export type OGRenderOutcome = z.infer<typeof OGRenderOutcomeSchema>;

export type OGRenderResult = {
  buffer: Buffer;
  maxAgeSeconds: number;
  outcome: OGRenderOutcome;
};

export type OGImageRenderer = (request: OGRenderRequest) => Promise<OGRenderResult>;
