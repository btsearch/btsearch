import { capabilitiesFor } from "@openbts/country-packs";
import { cellPlmns, cells, operators, plmns, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbClient as Client } from "../../types/global.js";
import { stationCountries } from "../stations/country.js";
import { extraCodesByCell } from "./networks.js";

type KnownPlmn = { id: number; code: string; countryCode: string };

export type NetworkOwner = { operatorId: number | null; mainCode: string | null; countryCode: string | null };
export type KnownPlmns = ReadonlyMap<string, KnownPlmn>;
export type ExtraCodesWrite = { cellId: number; extras: readonly string[] };

const EXTRA_CODE_LIMITS: Partial<Record<string, number>> = { GSM: 0, UMTS: 5, LTE: 5, NR: 11 };

function refusal(message: string): ErrorResponse {
  return new ErrorResponse("BAD_REQUEST", { message });
}

export function allowsCellNetworks(countryCode: string | null): boolean {
  return countryCode === null || capabilitiesFor(countryCode).cellNetworks;
}

export function extraCodeLimit(rat: string, countryCode: string | null): number {
  return allowsCellNetworks(countryCode) ? (EXTRA_CODE_LIMITS[rat] ?? 0) : 0;
}

export async function loadNetworkOwner(client: Client, operatorId: number | null, countryCode: string | null): Promise<NetworkOwner> {
  if (operatorId === null) return { operatorId, mainCode: null, countryCode };

  const [row] = await client
    .select({ ownerCode: plmns.code })
    .from(plmns)
    .where(and(eq(plmns.operatorId, operatorId), eq(plmns.role, "primary")))
    .limit(1);
  return { operatorId, mainCode: row?.ownerCode ?? null, countryCode };
}

export async function loadStationNetworkOwner(client: Client, stationId: number): Promise<NetworkOwner> {
  const [row] = await client
    .select({ operatorId: stations.operator_id, countryCode: stationCountries.countryCode })
    .from(stations)
    .innerJoin(stationCountries.table, eq(stations.id, stationCountries.stationId))
    .where(eq(stations.id, stationId))
    .limit(1);
  return loadNetworkOwner(client, row?.operatorId ?? null, row?.countryCode ?? null);
}

export async function loadKnownPlmns(client: Client, codes: readonly string[]): Promise<KnownPlmns> {
  if (codes.length === 0) return new Map();

  const rows = await client
    .select({ id: plmns.id, code: plmns.code, countryCode: operators.countryCode })
    .from(plmns)
    .innerJoin(operators, eq(operators.id, plmns.operatorId))
    .where(inArray(plmns.code, [...new Set(codes)]));
  return new Map(rows.map((row) => [row.code, row]));
}

export async function loadExtraCodes(client: Client, cellIds: readonly number[]): Promise<Map<number, string[]>> {
  if (cellIds.length === 0) return new Map();

  const rows = await client
    .select({ cellId: cellPlmns.cellId, code: plmns.code })
    .from(cellPlmns)
    .innerJoin(plmns, eq(plmns.id, cellPlmns.plmnId))
    .where(inArray(cellPlmns.cellId, [...new Set(cellIds)]));
  return extraCodesByCell(rows);
}

export function assertCodesKnown(codes: readonly string[], owner: NetworkOwner, known: KnownPlmns): void {
  for (const code of codes) {
    const plmn = known.get(code);
    if (!plmn) throw refusal(`Network code ${code} does not exist`);
    if (owner.countryCode !== null && plmn.countryCode !== owner.countryCode) throw refusal(`Network code ${code} belongs to another country`);
  }
}

export function extraCodesFromSent(rat: string | null | undefined, codes: readonly string[], owner: NetworkOwner, known: KnownPlmns): string[] {
  assertCodesKnown(codes, owner, known);
  if (owner.mainCode !== null && !codes.includes(owner.mainCode)) {
    throw refusal(`A cell's networks must include the station owner's main code ${owner.mainCode}`);
  }
  const extras = cappedExtraCodes(rat, codes, owner);
  if (extras.length > 0 && !allowsCellNetworks(owner.countryCode)) throw refusal("Cells in this country cannot broadcast other networks");
  return extras;
}

export function extraCodesFromStored(rat: string | null | undefined, codes: readonly string[], owner: NetworkOwner, known: KnownPlmns): string[] {
  assertCodesKnown(codes, owner, known);
  return cappedExtraCodes(rat, codes, owner);
}

function cappedExtraCodes(rat: string | null | undefined, codes: readonly string[], owner: NetworkOwner): string[] {
  const extras = withoutOwnerCode(codes, owner);
  const limit = EXTRA_CODE_LIMITS[rat ?? ""] ?? 0;
  if (limit === 0 && extras.length > 0) throw refusal("This cell cannot broadcast other networks");
  if (extras.length > limit) throw refusal(`A ${rat} cell can broadcast at most ${limit} networks besides the owner's`);
  return extras;
}

export function cellNetworkKeys(owner: NetworkOwner, extras: readonly string[]): string[] {
  return [owner.mainCode ?? `operator:${owner.operatorId}`, ...extras];
}

export function withoutOwnerCode(codes: readonly string[], owner: NetworkOwner): string[] {
  return codes.filter((code) => code !== owner.mainCode).sort();
}

export async function replaceExtraCodes(client: Client, writes: readonly ExtraCodesWrite[], known: KnownPlmns): Promise<void> {
  if (writes.length === 0) return;

  await client.delete(cellPlmns).where(
    inArray(
      cellPlmns.cellId,
      writes.map((write) => write.cellId),
    ),
  );
  const rows = writes.flatMap(({ cellId, extras }) =>
    extras.flatMap((code) => {
      const plmn = known.get(code);
      return plmn ? [{ cellId, plmnId: plmn.id }] : [];
    }),
  );
  if (rows.length > 0) await client.insert(cellPlmns).values(rows);
}

export async function writeExtraCodes(client: Client, cellId: number, extras: readonly string[], known: KnownPlmns): Promise<void> {
  await replaceExtraCodes(client, [{ cellId, extras }], known);
  await client.update(cells).set({ updatedAt: new Date() }).where(eq(cells.id, cellId));
}
