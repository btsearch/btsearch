import type { KhzRange } from "@openbts/shared/bandCatalog";
import type { Band, Brand, Operator, SpectrumHolding } from "@openbts/shared/contract";

import { getBrandColor, getOperatorBrand } from "@/features/station-details/station/utils/brands";

export type { KhzRange };
export type SpectrumGroup = "low" | "mid" | "high";
export type BandDuplex = NonNullable<Band["duplex"]>;

export type SpectrumOperator = Pick<Operator, "id" | "name" | "sortPriority"> & { brand: Brand | null; color: string };

export type SpectrumHoldingWithOperator = SpectrumHolding & { operator: Operator };

export type PlacedHolding = {
  holding: SpectrumHolding;
  operator: SpectrumOperator;
  isUpcoming: boolean;
};

export type BandRanges = {
  key: string;
  labelMhz: number;
  duplex: BandDuplex;
  showsDuplex: boolean;
  codes: string[];
  bandIds: number[];
  downlinkKhz: KhzRange;
  uplinkKhz: KhzRange | null;
};

export type BandHoldings = BandRanges & { holdings: SpectrumHolding[] };

export type SpectrumSection = BandRanges & {
  group: SpectrumGroup;
  barHoldings: PlacedHolding[];
  laterHoldings: PlacedHolding[];
  regionalHoldings: PlacedHolding[];
  assignedKhz: number;
};

export type OperatorTotal = {
  operator: SpectrumOperator;
  pairedKhz: number;
  unpairedKhz: number;
  khzBySection: ReadonlyMap<string, number>;
};

export type CountrySpectrum = {
  sections: SpectrumSection[];
  totals: OperatorTotal[];
  sources: string[];
};

type CountrySpectrumInput = {
  holdings: readonly SpectrumHoldingWithOperator[];
  brands: readonly Brand[];
  planBands: readonly Band[];
  today: string;
};

const LOW_BAND_LIMIT_KHZ = 1_000_000;
const MID_BAND_LIMIT_KHZ = 3_000_000;
const RAT_ORDER: readonly Band["rat"][] = ["gsm", "umts", "lte", "nr"];
const UNRANKED_OPERATOR = Number.MAX_SAFE_INTEGER;

export function getLocalDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function displayBandCode(code: string): string {
  return /^B\d+$/.test(code) ? code.toLowerCase() : code;
}

export function widthKhz(range: KhzRange): number {
  return range[1] - range[0];
}

function rangesOverlap(left: KhzRange, right: KhzRange): boolean {
  return left[0] < right[1] && left[1] > right[0];
}

function compareSpectrumOperators(left: SpectrumOperator, right: SpectrumOperator): number {
  return (
    (left.sortPriority ?? UNRANKED_OPERATOR) - (right.sortPriority ?? UNRANKED_OPERATOR) || left.name.localeCompare(right.name) || left.id - right.id
  );
}

export function toSpectrumOperator(operator: Operator, brands: readonly Brand[]): SpectrumOperator {
  const brand = getOperatorBrand(operator, brands);
  return { id: operator.id, name: operator.name, sortPriority: operator.sortPriority, brand, color: getBrandColor(brand) };
}

function hasEnded(holding: SpectrumHolding, today: string): boolean {
  return holding.validTo !== null && holding.validTo < today;
}

function hasNotStarted(holding: SpectrumHolding, today: string): boolean {
  return holding.validFrom !== null && holding.validFrom > today;
}

function sectionUplink(band: Band): KhzRange | null {
  return band.duplex === "fdd" ? band.uplinkKhz : null;
}

export function listBandRanges(planBands: readonly Band[]): BandRanges[] {
  const byKey = new Map<string, Omit<BandRanges, "showsDuplex">>();
  const sortedBands = [...planBands].sort((left, right) => RAT_ORDER.indexOf(left.rat) - RAT_ORDER.indexOf(right.rat));

  for (const band of sortedBands) {
    const { downlinkKhz, duplex } = band;
    if (downlinkKhz === null || duplex === null) continue;

    const uplinkKhz = sectionUplink(band);
    const key = `${duplex}:${downlinkKhz.join("-")}:${uplinkKhz?.join("-") ?? ""}`;
    const entry = byKey.get(key) ?? {
      key,
      labelMhz: band.labelMhz ?? Math.round(downlinkKhz[0] / 1000),
      duplex,
      codes: [],
      bandIds: [],
      downlinkKhz,
      uplinkKhz,
    };
    if (band.code !== null) entry.codes.push(displayBandCode(band.code));
    entry.bandIds.push(band.id);
    byKey.set(key, entry);
  }

  const ranges = [...byKey.values()];

  return ranges
    .map((range) => ({ ...range, showsDuplex: ranges.some((other) => other.key !== range.key && other.labelMhz === range.labelMhz) }))
    .sort((left, right) => left.downlinkKhz[0] - right.downlinkKhz[0]);
}

export function groupHoldingsByBand(holdings: readonly SpectrumHolding[], planBands: readonly Band[]): BandHoldings[] {
  return listBandRanges(planBands)
    .map((ranges) => ({
      ...ranges,
      holdings: holdings
        .filter((holding) => ranges.bandIds.includes(holding.bandId))
        .sort((left, right) => left.downlinkKhz[0] - right.downlinkKhz[0]),
    }))
    .filter((group) => group.holdings.length > 0);
}

function groupOf(downlinkKhz: KhzRange): SpectrumGroup {
  if (downlinkKhz[0] < LOW_BAND_LIMIT_KHZ) return "low";
  return downlinkKhz[0] < MID_BAND_LIMIT_KHZ ? "mid" : "high";
}

type HoldingRanges = Pick<SpectrumHolding, "downlinkKhz" | "uplinkKhz">;

function holdingRanges(holding: HoldingRanges): KhzRange[] {
  return holding.uplinkKhz === null ? [holding.downlinkKhz] : [holding.downlinkKhz, holding.uplinkKhz];
}

export function holdingsOverlap(left: HoldingRanges, right: HoldingRanges): boolean {
  return holdingRanges(left).some((leftRange) => holdingRanges(right).some((rightRange) => rangesOverlap(leftRange, rightRange)));
}

function buildSection(band: BandHoldings, operatorById: ReadonlyMap<number, SpectrumOperator>, today: string): SpectrumSection {
  const placed = band.holdings.flatMap((holding): PlacedHolding[] => {
    const operator = operatorById.get(holding.operatorId);
    if (operator === undefined || hasEnded(holding, today)) return [];
    return [{ holding, operator, isUpcoming: hasNotStarted(holding, today) }];
  });
  const national = placed.filter((entry) => entry.holding.regionId === null);
  const current = national.filter((entry) => !entry.isUpcoming);
  const upcoming = national.filter((entry) => entry.isUpcoming);
  const freeUpcoming = upcoming.filter((entry) => !current.some((other) => holdingsOverlap(entry.holding, other.holding)));
  const barHoldings = [...current, ...freeUpcoming].sort((left, right) => left.holding.downlinkKhz[0] - right.holding.downlinkKhz[0]);

  return {
    ...band,
    group: groupOf(band.downlinkKhz),
    barHoldings,
    laterHoldings: upcoming.filter((entry) => !barHoldings.includes(entry)),
    regionalHoldings: placed.filter((entry) => entry.holding.regionId !== null),
    assignedKhz: current.reduce((sum, entry) => sum + widthKhz(entry.holding.downlinkKhz), 0),
  };
}

function buildTotals(sections: readonly SpectrumSection[]): OperatorTotal[] {
  const totals = new Map<number, { operator: SpectrumOperator; pairedKhz: number; unpairedKhz: number; khzBySection: Map<string, number> }>();

  for (const section of sections) {
    for (const { holding, operator, isUpcoming } of section.barHoldings) {
      if (isUpcoming) continue;

      const total = totals.get(operator.id) ?? { operator, pairedKhz: 0, unpairedKhz: 0, khzBySection: new Map<string, number>() };
      totals.set(operator.id, total);
      const width = widthKhz(holding.downlinkKhz);
      if (holding.uplinkKhz === null) total.unpairedKhz += width;
      else total.pairedKhz += width;
      total.khzBySection.set(section.key, (total.khzBySection.get(section.key) ?? 0) + width);
    }
  }

  return [...totals.values()].sort((left, right) => compareSpectrumOperators(left.operator, right.operator));
}

export function buildCountrySpectrum({ holdings, brands, planBands, today }: CountrySpectrumInput): CountrySpectrum {
  const operatorById = new Map(holdings.map(({ operator }) => [operator.id, toSpectrumOperator(operator, brands)]));
  const sections = groupHoldingsByBand(holdings, planBands)
    .map((group) => buildSection(group, operatorById, today))
    .filter((section) => section.barHoldings.length + section.laterHoldings.length + section.regionalHoldings.length > 0);
  const sources = [...new Set(holdings.map((holding) => holding.source).filter((source) => source !== null))];

  return { sections, totals: buildTotals(sections), sources };
}

export function countHoldingsByCountry(holdings: readonly SpectrumHoldingWithOperator[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { operator } of holdings) counts.set(operator.countryCode, (counts.get(operator.countryCode) ?? 0) + 1);
  return counts;
}
