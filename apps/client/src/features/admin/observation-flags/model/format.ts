import type { Band, Cell, ObservedSite, Operator } from "@openbts/shared/contract";
import type { CellRat } from "@openbts/shared/contract/constants";

import type { FlagOfKind } from "./kinds";
import { getEstimatedSiteName } from "@/features/map/crowd/sites/estimatedSites";
import { type MapLookups, getOperatorLook } from "@/features/map/data/mapLookups";
import { RAT_CELL_SPECS } from "@/features/shared/rat";
import { getBandCode, getBandLabel, toRatType } from "@/features/station-details/station/utils/bands";
import { TEXT_SEPARATOR } from "@/features/station-editing/model/changes";

type MeasuredField = FlagOfKind<"valueDiffers">["evidence"]["field"];
export type NumberedItem = Readonly<Record<string, unknown>>;

type CellLike = Pick<Cell, "rat" | "bandId">;
type NamedStation = { id: number; siteId: string | null; nodeName: string | null };

const PERCENT: Intl.NumberFormatOptions = { style: "percent", maximumFractionDigits: 0 };
const FIELD_CODES: Record<MeasuredField, Record<CellRat, string>> = {
  areaCode: { gsm: "LAC", umts: "LAC", lte: "TAC", nr: "TAC" },
  pci: { gsm: "BSIC", umts: "PSC", lte: "PCI", nr: "PCI" },
  channel: { gsm: "ARFCN", umts: "UARFCN", lte: "EARFCN", nr: "ARFCN" },
};
const NODE_CODES: Record<CellRat, string> = { gsm: "LAC", umts: "RNC", lte: "eNBID", nr: "gNBID" };
const CELL_ID_CODES: Record<CellRat, string> = { gsm: "CID", umts: "CID", lte: "CLID", nr: "CLID" };
const CELL_ID_FIELDS: Record<CellRat, "cid" | "clid"> = { gsm: "cid", umts: "cid", lte: "clid", nr: "clid" };

function listFilled(parts: readonly (string | null)[]): string[] {
  return parts.filter((part): part is string => part !== null && part !== "");
}

export function joinParts(parts: readonly (string | null)[]): string {
  return listFilled(parts).join(TEXT_SEPARATOR);
}

export function joinWords(parts: readonly (string | null)[]): string {
  return listFilled(parts).join(" ");
}

export function formatShare(share: number, language: string): string {
  return share.toLocaleString(language, PERCENT);
}

export function formatDegrees(degrees: number): string {
  return `${Math.round(degrees)}°`;
}

export function getRatName(rat: CellRat): string {
  return RAT_CELL_SPECS[toRatType(rat)].label;
}

export function getRatGeneration(rat: CellRat): string {
  return RAT_CELL_SPECS[toRatType(rat)].gen;
}

export function getFieldCode(field: MeasuredField, rat: CellRat): string {
  return FIELD_CODES[field][rat];
}

export function getNodeCode(rat: CellRat): string {
  return NODE_CODES[rat];
}

export function getCellIdCode(rat: CellRat): string {
  return CELL_ID_CODES[rat];
}

export function findBand(bandId: number | null | undefined, lookups: MapLookups | undefined): Band | undefined {
  return bandId === null || bandId === undefined ? undefined : lookups?.bandsById.get(bandId);
}

export function formatBand(bandId: number | null | undefined, lookups: MapLookups | undefined, language: string): string | null {
  const band = findBand(bandId, lookups);
  const label = getBandLabel(band, language);
  if (label === null) return null;
  const code = getBandCode(band);
  return code === null ? label : `${label} ${code}`;
}

export function formatCellBand(cell: CellLike, lookups: MapLookups | undefined, language: string): string {
  return joinWords([getRatName(cell.rat), formatBand(cell.bandId, lookups, language)]);
}

export function findNetworkOperator(network: string, lookups: MapLookups | undefined): Operator | undefined {
  return lookups?.operators.find((operator) => operator.primaryPlmn === network);
}

export function formatNetwork(network: string, lookups: MapLookups | undefined): string {
  const operator = findNetworkOperator(network, lookups);
  return operator === undefined ? network : `${network} (${operator.name})`;
}

export function getOperatorName(operatorId: number | null | undefined, lookups: MapLookups | undefined): string | null {
  return getOperatorLook(lookups, operatorId).operator?.name ?? null;
}

export function formatStationLabel(station: NamedStation): string {
  return station.siteId ?? station.nodeName ?? `#${station.id}`;
}

export function formatSiteLabel(site: ObservedSite, lookups: MapLookups | undefined): string {
  return joinWords([getOperatorName(site.operatorId, lookups), getEstimatedSiteName(site)]);
}

export function listOtherSiteNames(observedSiteId: number | null, sites: readonly ObservedSite[]): string[] {
  return sites.filter((site) => site.id !== observedSiteId).map(getEstimatedSiteName);
}

export function readItemNumber(item: NumberedItem, field: string): number | null {
  const value = item[field];
  return typeof value === "number" ? value : null;
}

export function readCellId(cell: NumberedItem & { rat: CellRat }): number | null {
  return readItemNumber(cell, CELL_ID_FIELDS[cell.rat]);
}
