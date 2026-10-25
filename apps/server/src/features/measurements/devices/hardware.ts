import { boardSocs, deviceModels, socs } from "@openbts/drizzle";
import type {
  MeasurementDeviceCreate,
  MeasurementDeviceModel,
  MeasurementDeviceModelListQuery,
  MeasurementModemFamily,
  MeasurementSoc,
} from "@openbts/shared/contract";
import { and, asc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { encodeCursor, resolveOffset } from "../../../lib/cursor.js";
import type { DbTx } from "../../../types/global.js";
import { containsPattern } from "../../search/text.js";

const MODEM_FAMILIES_BY_SOC_MANUFACTURER: Record<string, MeasurementModemFamily> = {
  qti: "qualcomm",
  qualcomm: "qualcomm",
  mediatek: "mediatek",
  mtk: "mediatek",
  samsung: "samsung",
  unisoc: "unisoc",
  spreadtrum: "unisoc",
  hisilicon: "hisilicon",
};
const TENSORS_WITH_SAMSUNG_MODEMS = /^tensor( g[1-5])?$/i;

export function modemFamilyOf(socManufacturer: string, socModel: string): MeasurementModemFamily {
  const maker = socManufacturer.trim().toLowerCase();
  if (maker === "google") return TENSORS_WITH_SAMSUNG_MODEMS.test(socModel.trim()) ? "samsung" : "other";
  return MODEM_FAMILIES_BY_SOC_MANUFACTURER[maker] ?? "other";
}

export async function saveDeviceModel(tx: DbTx, hardware: MeasurementDeviceCreate["hardware"]): Promise<number> {
  const { manufacturer, model, board, socManufacturer, socModel } = hardware;
  let socId: number | null = null;
  if (socManufacturer !== undefined && socModel !== undefined) {
    const [soc] = await tx
      .insert(socs)
      .values({ manufacturer: socManufacturer, model: socModel, modemFamily: modemFamilyOf(socManufacturer, socModel) })
      .onConflictDoUpdate({ target: [socs.manufacturer, socs.model], set: { model: sql`excluded.model` } })
      .returning({ id: socs.id });
    socId = soc?.id ?? null;
  }

  const [deviceModel] = await tx
    .insert(deviceModels)
    .values({ manufacturer, model, board, socId })
    .onConflictDoUpdate({
      target: [deviceModels.manufacturer, deviceModels.model, deviceModels.socId],
      set: { board: sql`coalesce(excluded.board, ${deviceModels.board})`, updatedAt: sql`now()` },
    })
    .returning({ id: deviceModels.id });
  if (!deviceModel) throw new ErrorResponse("FAILED_TO_CREATE");
  return deviceModel.id;
}

export async function listSocs(): Promise<MeasurementSoc[]> {
  return db
    .select({ id: socs.id, manufacturer: socs.manufacturer, model: socs.model, modemFamily: socs.modemFamily })
    .from(socs)
    .orderBy(asc(socs.manufacturer), asc(socs.model), asc(socs.id));
}

export async function findDeviceModelPage(
  query: MeasurementDeviceModelListQuery,
): Promise<{ data: MeasurementDeviceModel[]; nextCursor: string | null }> {
  const { q, ids, limit } = query;
  const offset = resolveOffset(query);
  const rows = await db
    .select({
      id: deviceModels.id,
      manufacturer: deviceModels.manufacturer,
      model: deviceModels.model,
      socId: sql<number | null>`coalesce(${deviceModels.socId}, ${boardSocs.socId})`,
    })
    .from(deviceModels)
    .leftJoin(boardSocs, and(isNull(deviceModels.socId), eq(boardSocs.board, deviceModels.board)))
    .where(
      and(
        q === undefined ? undefined : ilike(sql`${deviceModels.manufacturer} || ' ' || ${deviceModels.model}`, containsPattern(q)),
        ids === undefined ? undefined : inArray(deviceModels.id, ids),
      ),
    )
    .orderBy(asc(deviceModels.manufacturer), asc(deviceModels.model), asc(deviceModels.id))
    .limit(limit + 1)
    .offset(offset);
  return { data: rows.slice(0, limit), nextCursor: rows.length > limit ? encodeCursor({ offset: offset + limit }) : null };
}
