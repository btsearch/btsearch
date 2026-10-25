import { cellNetworks, observedCellValues, observedCells } from "@openbts/drizzle";
import { CID_RANGE, DEFAULT_GNBID_LENGTH } from "@openbts/shared/contract";
import type { CellApplyNewCell, CountryFeatures } from "@openbts/shared/contract";
import { and, eq, inArray } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import type { BandRow } from "../../../bands/serialize.js";
import { cellNetworkCodes } from "../../../cells/networks.js";
import { EXTRA_CODE_LIMITS, type KnownPlmns } from "../../../cells/networkWrites.js";
import { disabledCountryFeatures } from "../../../stations/countryFeatures.js";
import { bandsHolding } from "../../bandPlans.js";
import { CELLS_PER_ENB, MATCHED_FIELDS, type MatchedField, NCI_BITS, gnbidOf, isMatchedField } from "../../cells/identity.js";
import { narrowestBand } from "../bands.js";
import { confirmedListings, isSameCountry, knownCode } from "./networks.js";
import { type Sighting, latestConfirmedValue } from "./sightings.js";

export type NewCellSource = {
  rat: BandRow["rat"];
  plmn: string;
  cellKey: number;
  values: readonly (Sighting & { field: MatchedField; value: number })[];
  listedNetworks: readonly (Sighting & { plmn: string })[];
};
export type NewCellStation = {
  ownerCode: string | undefined;
  countryCode: string | null;
  planBands: readonly BandRow[];
  features?: Readonly<CountryFeatures>;
};
export type NewCellContext = { known: KnownPlmns; gnbidLengths: ReadonlyMap<string, number> };

export async function loadObservedCellValues(tx: DbTx, observedCellIds: readonly number[]): Promise<NewCellSource["values"]> {
  const rows = await tx
    .select({
      observedCellId: observedCellValues.observedCellId,
      observedSiteId: observedCells.observedSiteId,
      field: observedCellValues.field,
      value: observedCellValues.value,
      sampleCount: observedCellValues.sampleCount,
      contributorBits: observedCellValues.contributorBits,
      lastSeenOn: observedCellValues.lastSeenOn,
    })
    .from(observedCellValues)
    .innerJoin(observedCells, eq(observedCells.id, observedCellValues.observedCellId))
    .where(and(inArray(observedCellValues.observedCellId, [...observedCellIds]), inArray(observedCellValues.field, [...MATCHED_FIELDS])));
  return rows.flatMap(({ field, ...row }) => (isMatchedField(field) ? [{ ...row, field }] : []));
}

export async function loadListedNetworksByObservedCellId(tx: DbTx, observedCellIds: readonly number[]): Promise<NewCellSource["listedNetworks"]> {
  return tx
    .select({
      observedCellId: cellNetworks.observedCellId,
      observedSiteId: observedCells.observedSiteId,
      plmn: cellNetworks.plmn,
      sampleCount: cellNetworks.sampleCount,
      contributorBits: cellNetworks.contributorBits,
      lastSeenOn: cellNetworks.lastSeenOn,
    })
    .from(cellNetworks)
    .innerJoin(observedCells, eq(observedCells.id, cellNetworks.observedCellId))
    .where(inArray(cellNetworks.observedCellId, [...observedCellIds]));
}

function latestOf(source: NewCellSource, field: MatchedField): number | null {
  return latestConfirmedValue(source.values.filter((value) => value.field === field));
}

function networksOf(source: NewCellSource, station: NewCellStation, known: KnownPlmns): string[] {
  const listed = confirmedListings(source.listedNetworks, "").toSorted((a, b) => b.seen.samples - a.seen.samples);
  const byEvidence = [source.plmn, ...listed.map(({ code }) => code)];
  const guests = unique(
    byEvidence.map((code) => {
      const network = knownCode(code, known);
      const isGuest = network !== undefined && network !== station.ownerCode && isSameCountry(network, station.countryCode, known);
      return isGuest ? network : null;
    }),
  );
  return cellNetworkCodes(station.ownerCode, guests.slice(0, EXTRA_CODE_LIMITS[source.rat] ?? 0).toSorted());
}

export function buildNewCell(source: NewCellSource, station: NewCellStation, { known, gnbidLengths }: NewCellContext): CellApplyNewCell | null {
  const channel = latestOf(source, "channel");
  const band = channel === null ? undefined : narrowestBand(bandsHolding(source.rat, channel, station.planBands));
  if (channel === null || band === undefined) return null;

  const areaCode = latestOf(source, "areaCode");
  const pci = latestOf(source, "pci");
  const plmns = networksOf(source, station, known);
  const features = station.features ?? disabledCountryFeatures;
  if (source.rat === "GSM") {
    const lac = Math.floor(source.cellKey / CID_RANGE);
    return { rat: "gsm", bandId: band.id, lac, cid: source.cellKey % CID_RANGE, ...(features.bsic ? { bsic: pci } : {}), plmns };
  }
  if (source.rat === "UMTS") {
    const rnc = Math.floor(source.cellKey / CID_RANGE);
    return {
      rat: "umts",
      bandId: band.id,
      lac: areaCode,
      rnc,
      cid: source.cellKey % CID_RANGE,
      ...(features.psc ? { psc: pci } : {}),
      uarfcn: channel,
      plmns,
    };
  }
  if (source.rat === "LTE") {
    const enbid = Math.floor(source.cellKey / CELLS_PER_ENB);
    return { rat: "lte", bandId: band.id, tac: areaCode, enbid, clid: source.cellKey % CELLS_PER_ENB, pci, earfcn: channel, plmns };
  }
  if (source.rat === "NR") {
    const gnbidLength = gnbidLengths.get(source.plmn) ?? DEFAULT_GNBID_LENGTH;
    const gnbid = gnbidOf(source.cellKey, gnbidLength);
    const clid = source.cellKey - gnbid * 2 ** (NCI_BITS - gnbidLength);
    return { rat: "nr", bandId: band.id, mode: "sa", tac: areaCode, gnbid, gnbidLength, clid, pci, arfcn: channel, plmns };
  }
  return null;
}
