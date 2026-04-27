import { ukeOperators, ukeRadiolines } from "@openbts/drizzle";
import { type SQL, and, count, eq, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const manufacturerSchema = z.object({ id: z.number(), name: z.string() });
const equipmentTypeSchema = z.object({ id: z.number(), name: z.string(), manufacturer: manufacturerSchema.optional() });
const txSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
  height: z.number(),
  eirp: z.number().optional(),
  antenna_attenuation: z.number().optional(),
  transmitter: z.object({ type: equipmentTypeSchema.optional() }).optional(),
  antenna: z
    .object({
      type: equipmentTypeSchema.optional(),
      gain: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
});
const rxSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
  height: z.number(),
  type: equipmentTypeSchema.optional(),
  gain: z.number().optional(),
  height_antenna: z.number().optional(),
  noise_figure: z.number().optional(),
  atpc_attenuation: z.number().optional(),
});
const linkSchema = z.object({
  freq: z.number(),
  ch_num: z.number().optional(),
  plan_symbol: z.string().optional(),
  ch_width: z.number().optional(),
  polarization: z.string().optional(),
  modulation_type: z.string().optional(),
  bandwidth: z.string().optional(),
});
const operatorSchema = createSelectSchema(ukeOperators);
const permitSchema = z.object({
  number: z.string().optional(),
  decision_type: z.string().optional(),
  expiry_date: z.date(),
});
const radioLineResponseSchema = z.object({
  id: z.number(),
  tx: txSchema,
  rx: rxSchema,
  link: linkSchema,
  operator: operatorSchema.optional(),
  permit: permitSchema,
  updatedAt: z.date(),
  createdAt: z.date(),
});

type RadioLineResponse = z.infer<typeof radioLineResponseSchema>;
type ResponseBody = { data: RadioLineResponse[]; totalCount: number };
const schemaRoute = {
  querystring: z.object({
    bounds: z
      .string()
      .regex(/^-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+$/)
      .optional()
      .transform((val): number[] | undefined => (val ? val.split(",").map(Number) : undefined)),
    limit: z.coerce.number().min(1).max(1000).optional().default(150),
    page: z.coerce.number().min(1).default(1),
    operators: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .optional()
      .transform((val): number[] | undefined =>
        val
          ? val
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined,
      ),
    permit_number: z.string().optional(),
    decision_type: z.literal(["zmP", "P"]).optional(),
    new: z
      .string()
      .optional()
      .transform((val): number | null => {
        if (!val || val === "false" || val === "0") return null;
        if (val === "true") return 30;
        const n = Number(val);
        return n >= 1 && n <= 30 ? n : null;
      }),
  }),
  response: {
    200: z.object({
      data: z.array(radioLineResponseSchema),
      totalCount: z.number(),
    }),
  },
};
type ReqQuery = {
  Querystring: z.infer<typeof schemaRoute.querystring>;
};

const SIMILARITY_THRESHOLD = 0.6;

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const { limit = undefined, page = 1, bounds, operators, permit_number, decision_type, new: recentDays } = req.query;
  const offset = limit ? (page - 1) * limit : undefined;

  try {
    function buildConditions(f: typeof ukeRadiolines) {
      const conditions: (SQL<unknown> | undefined)[] = [];

      if (bounds) {
        const [la1, lo1, la2, lo2] = bounds as [number, number, number, number];
        const [west, south] = [Math.min(lo1, lo2), Math.min(la1, la2)];
        const [east, north] = [Math.max(lo1, lo2), Math.max(la1, la2)];

        const envelope = sql`ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`;
        const txPoint = sql`ST_SetSRID(ST_MakePoint(${f.tx_longitude}, ${f.tx_latitude}), 4326)`;
        const rxPoint = sql`ST_SetSRID(ST_MakePoint(${f.rx_longitude}, ${f.rx_latitude}), 4326)`;
        conditions.push(sql`(ST_Intersects(${txPoint}, ${envelope}) OR ST_Intersects(${rxPoint}, ${envelope}))`);
      }
      if (permit_number) {
        const like = `%${permit_number}%`;
        conditions.push(sql`(${f.permit_number} ILIKE ${like} OR similarity(${f.permit_number}, ${permit_number}) > ${SIMILARITY_THRESHOLD})`);
      }
      if (decision_type) conditions.push(eq(f.decision_type, decision_type));
      if (operators) conditions.push(inArray(f.operator_id, operators));
      if (recentDays) {
        const cutoff = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);
        conditions.push(sql`${f.createdAt} >= ${cutoff.toISOString()}`);
      }

      return conditions;
    }

    const [countResult, radioLinesRes] = await Promise.all([
      db
        .select({ count: count() })
        .from(ukeRadiolines)
        .where(and(...buildConditions(ukeRadiolines)) ?? undefined),
      db.query.ukeRadiolines.findMany({
        where: {
          RAW: (fields) => and(...buildConditions(fields)) ?? sql`true`,
        },
        columns: {
          operator_id: false,
        },
        with: {
          operator: true,
          txTransmitterType: { with: { manufacturer: true } },
          txAntennaType: { with: { manufacturer: true } },
          rxAntennaType: { with: { manufacturer: true } },
        },
        limit: limit,
        offset: offset,
      }),
    ]);

    const mapType = (t: { id: number; name: string; manufacturer: { id: number; name: string } | null } | null | undefined) =>
      t
        ? {
            id: t.id,
            name: t.name,
            manufacturer: t.manufacturer ? { id: t.manufacturer.id, name: t.manufacturer.name } : undefined,
          }
        : undefined;

    const data: RadioLineResponse[] = radioLinesRes.map((radioLine) => ({
      id: radioLine.id,
      tx: {
        longitude: radioLine.tx_longitude,
        latitude: radioLine.tx_latitude,
        height: radioLine.tx_height,
        eirp: radioLine.tx_eirp ?? undefined,
        antenna_attenuation: radioLine.tx_antenna_attenuation ?? undefined,
        transmitter: { type: mapType(radioLine.txTransmitterType) },
        antenna: {
          type: mapType(radioLine.txAntennaType),
          gain: radioLine.tx_antenna_gain ?? undefined,
          height: radioLine.tx_antenna_height ?? undefined,
        },
      },
      rx: {
        longitude: radioLine.rx_longitude,
        latitude: radioLine.rx_latitude,
        height: radioLine.rx_height,
        type: mapType(radioLine.rxAntennaType),
        gain: radioLine.rx_antenna_gain ?? undefined,
        height_antenna: radioLine.rx_antenna_height ?? undefined,
        noise_figure: radioLine.rx_noise_figure ?? undefined,
        atpc_attenuation: radioLine.rx_atpc_attenuation ?? undefined,
      },
      link: {
        freq: radioLine.freq,
        ch_num: radioLine.ch_num ?? undefined,
        plan_symbol: radioLine.plan_symbol ?? undefined,
        ch_width: radioLine.ch_width ?? undefined,
        polarization: radioLine.polarization ?? undefined,
        modulation_type: radioLine.modulation_type ?? undefined,
        bandwidth: radioLine.bandwidth ?? undefined,
      },
      operator: radioLine.operator ?? undefined,
      permit: {
        number: radioLine.permit_number ?? undefined,
        decision_type: radioLine.decision_type ?? undefined,
        expiry_date: radioLine.expiry_date,
      },
      updatedAt: radioLine.updatedAt,
      createdAt: radioLine.createdAt,
    }));

    const totalCount = countResult[0]?.count ?? 0;

    res.send({ data, totalCount });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR");
  }
}

const getukeRadiolines: Route<ReqQuery, ResponseBody> = {
  url: "/uke/radiolines",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:uke_radiolines"], allowGuestAccess: true },
  handler,
};

export default getukeRadiolines;
