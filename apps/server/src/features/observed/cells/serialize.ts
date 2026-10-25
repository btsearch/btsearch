import { type CatalogBand, bandsForChannel, nrChannelKhz } from "@openbts/shared/bandCatalog";
import {
  CID_RANGE,
  DEFAULT_GNBID_LENGTH,
  GNBID_MAX_LENGTH,
  GNBID_MIN_LENGTH,
  geoJsonMultiLineStringSchema,
  geoJsonPolygonSchema,
} from "@openbts/shared/contract";
import type { ObservedCellRecord } from "@openbts/shared/contract";

import { unique } from "../../../lib/collections.js";
import { isUnknownBand } from "../../bands/unknown.js";
import { bandOfChannel } from "../bandPlans.js";
import { NCI_BITS, gnbidOf } from "./identity.js";
import { CELLS_PER_ENB } from "./identity.js";
import type { ConfirmedValueRow, ObservedCellRecordRows } from "./read.js";

const CENTI = 100;
const LEVEL_RING_METERS = 250;
const LTE_UPLINK_CHANNEL_SHIFT = 18_000;
const LAST_LTE_BAND_WITH_UPLINK_SHIFT = 28;
const GNBID_LENGTHS = Array.from({ length: GNBID_MAX_LENGTH - GNBID_MIN_LENGTH + 1 }, (_, offset) => GNBID_MIN_LENGTH + offset);

type ValueField = ConfirmedValueRow["field"];

function byRecency(a: ConfirmedValueRow, b: ConfirmedValueRow): number {
  return b.lastSeenOn.localeCompare(a.lastSeenOn) || b.sampleCount - a.sampleCount || a.value - b.value;
}

function latestValues(values: readonly ConfirmedValueRow[]): Map<ValueField, number> {
  const latest = new Map<ValueField, number>();
  for (const { field, value } of values.toSorted(byRecency)) if (!latest.has(field)) latest.set(field, value);
  return latest;
}

function booleanOf(value: number | undefined): boolean | null {
  return value === undefined ? null : value === 1;
}

function fromCenti(value: number | null): number | null {
  return value === null ? null : value / CENTI;
}

function toTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function impliesUplink(band: CatalogBand, downlink: number, uplink: number): boolean {
  if (band.rat !== "NR") {
    if (band.duplex === "TDD") return uplink === downlink;
    return (
      band.duplex === "FDD" &&
      band.number !== null &&
      band.number <= LAST_LTE_BAND_WITH_UPLINK_SHIFT &&
      uplink === downlink + LTE_UPLINK_CHANNEL_SHIFT
    );
  }

  const downlinkKhz = nrChannelKhz(downlink);
  const uplinkKhz = nrChannelKhz(uplink);
  if (downlinkKhz === null || uplinkKhz === null) return false;
  if (band.duplex === "TDD") return uplinkKhz === downlinkKhz;
  if (band.duplex !== "FDD" || band.downlinkKhz === null || band.uplinkKhz === null) return false;
  return downlinkKhz - uplinkKhz === band.downlinkKhz[0] - band.uplinkKhz[0];
}

function shownUplink(rat: "LTE" | "NR", downlink: number | undefined, uplink: number | undefined): number | null {
  if (uplink === undefined) return null;
  if (downlink === undefined) return uplink;
  return bandsForChannel(rat, downlink).some((band) => impliesUplink(band, downlink, uplink)) ? null : uplink;
}

function cutNci(nci: number, siteGnbid: number | null, networkLength: number | null): { gnbid: number; clid: number } {
  const length = GNBID_LENGTHS.find((candidate) => gnbidOf(nci, candidate) === siteGnbid) ?? networkLength ?? DEFAULT_GNBID_LENGTH;
  const gnbid = gnbidOf(nci, length);
  return { gnbid, clid: nci - gnbid * 2 ** (NCI_BITS - length) };
}

function toGeometry({ shape, levels }: ObservedCellRecordRows): ObservedCellRecord["geometry"] {
  if (shape === null) return null;
  return {
    bearingDegrees: toTenths(shape.bearingDeg),
    spreadDegrees: toTenths(shape.spreadDeg),
    reachMeters: shape.reachM,
    reachByTimingAdvanceMeters: shape.reachTaM,
    meanRsrqDb: fromCenti(shape.meanQualityCentiDb),
    meanSinrDb: fromCenti(shape.meanSinrCentiDb),
    levelByDistance: levels.map((level) => ({
      fromMeters: level.distanceBand * LEVEL_RING_METERS,
      toMeters: (level.distanceBand + 1) * LEVEL_RING_METERS,
      meanDbm: level.meanLevelCentiDb / CENTI,
      meanSinrDb: fromCenti(level.meanSinrCentiDb),
    })),
  };
}

function bandIdOf(rows: ObservedCellRecordRows, channel: number | undefined): number | null {
  if (rows.matchedCell !== null && !isUnknownBand({ value: rows.matchedBandValue })) return rows.matchedCell.bandId;
  return channel === undefined ? null : bandOfChannel(rows.cell.rat, channel, rows.planBands);
}

export function toObservedCellRecord(rows: ObservedCellRecordRows): ObservedCellRecord | null {
  const { cell, site, match, matchedCell, summary } = rows;
  const latest = latestValues(rows.values);
  const areaCode = latest.get("areaCode") ?? null;
  const pci = latest.get("pci") ?? null;
  const channel = latest.get("channel");
  const bandwidthKhz = latest.get("bandwidth") ?? null;
  const ulBandwidthKhz = latest.get("ulBandwidth");
  const hasUplink = cell.rat === "LTE" || cell.rat === "NR";

  const base = {
    id: cell.id,
    observedSiteId: cell.observedSiteId,
    plmns: unique([cell.plmn, ...rows.listedNetworks]),
    copyOfObservedCellId: rows.copyOfObservedCellId,
    operatorId: rows.operatorId,
    bandId: bandIdOf(rows, channel),
    bandwidthKhz,
    reportedBandNumbers: unique(rows.values.filter((value) => value.field === "reportedBand").map((value) => value.value)).toSorted((a, b) => a - b),
    ulBandwidthKhz: hasUplink && ulBandwidthKhz !== undefined && ulBandwidthKhz !== bandwidthKhz ? ulBandwidthKhz : null,
    supportsEndc: booleanOf(latest.get("endcAvailable")),
    isAccessClosed: booleanOf(latest.get("accessClosed")),
    isBarred: booleanOf(latest.get("barred")),
    isReservedForOperatorUse: booleanOf(latest.get("reserved")),
    sampleCount: summary.samples,
    personCount: summary.people,
    squareCount: summary.squares,
    firstSeenOn: summary.firstSeenOn,
    lastSeenOn: summary.lastSeenOn,
    match: match?.kind ?? null,
    networkMatch: match?.networkMatch ?? null,
    matchedCellId: match?.cellId ?? null,
    matchedStationId: match?.stationId ?? matchedCell?.stationId ?? null,
    geometry: toGeometry(rows),
    ...(rows.footprint === undefined ? {} : { footprint: rows.footprint === null ? null : geoJsonPolygonSchema.parse(JSON.parse(rows.footprint)) }),
    ...(rows.edges === undefined
      ? {}
      : {
          edges: rows.edges.map((edge) => ({
            kind: edge.kind,
            lengthMeters: edge.lengthM,
            geometry: geoJsonMultiLineStringSchema.parse(JSON.parse(edge.edge)),
          })),
        }),
  };
  const key = cell.cellKey;

  switch (cell.rat) {
    case "GSM":
      return { ...base, rat: "gsm", lac: Math.floor(key / CID_RANGE), cid: key % CID_RANGE, bsic: pci, arfcn: channel ?? null };
    case "UMTS":
      return {
        ...base,
        rat: "umts",
        lac: areaCode,
        longCid: key,
        rnc: Math.floor(key / CID_RANGE),
        cid: key % CID_RANGE,
        psc: pci,
        uarfcn: channel ?? null,
      };
    case "LTE":
      return {
        ...base,
        rat: "lte",
        eci: key,
        enbid: Math.floor(key / CELLS_PER_ENB),
        clid: key % CELLS_PER_ENB,
        tac: areaCode,
        pci,
        earfcn: channel ?? null,
        ulEarfcn: shownUplink("LTE", channel, latest.get("ulChannel")),
      };
    case "NR": {
      const siteGnbid = site?.rat === "NR" ? site.nodeId : null;
      return {
        ...base,
        rat: "nr",
        nci: key,
        ...cutNci(key, siteGnbid, rows.gnbidLength),
        tac: areaCode,
        pci,
        arfcn: channel ?? null,
        ulArfcn: shownUplink("NR", channel, latest.get("ulChannel")),
      };
    }
    default:
      return null;
  }
}
