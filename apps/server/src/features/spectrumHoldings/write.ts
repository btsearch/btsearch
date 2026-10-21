import { bands, countryBands, operators, regions, spectrumHoldings } from "@openbts/drizzle";
import { type KhzRange, findCatalogBand } from "@openbts/shared/bandCatalog";
import { type SQL, type SQLWrapper, and, eq, gt, gte, isNull, lt, lte, ne, or } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { type SpectrumHoldingRow, uplinkKhzOf } from "./serialize.js";

export type SpectrumHoldingValues = Pick<
  SpectrumHoldingRow,
  | "operatorId"
  | "jointOperatorId"
  | "bandId"
  | "regionId"
  | "downlinkLowKhz"
  | "downlinkHighKhz"
  | "uplinkLowKhz"
  | "uplinkHighKhz"
  | "validFrom"
  | "validTo"
>;

export async function findOperatorCountry(operatorId: number): Promise<string> {
  const [operator] = await db.select({ countryCode: operators.countryCode }).from(operators).where(eq(operators.id, operatorId)).limit(1);
  if (!operator) throw new ErrorResponse("BAD_REQUEST", { message: "Operator not found" });
  return operator.countryCode;
}

function assertWithin(range: KhzRange, band: KhzRange | null, message: string): void {
  if (band === null || range[0] < band[0] || range[1] > band[1]) throw new ErrorResponse("BAD_REQUEST", { message });
}

async function assertBandFits(tx: DbTx, countryCode: string, next: SpectrumHoldingValues): Promise<void> {
  const [band] = await tx
    .select({ code: bands.code, planBandId: countryBands.bandId })
    .from(bands)
    .leftJoin(countryBands, and(eq(countryBands.bandId, bands.id), eq(countryBands.countryCode, countryCode)))
    .where(eq(bands.id, next.bandId))
    .limit(1);
  if (!band || band.planBandId === null) {
    throw new ErrorResponse("BAD_REQUEST", { message: "The band is not in the band plan of the operator's country" });
  }

  const catalog = findCatalogBand(band.code);
  if (!catalog?.downlinkKhz) throw new ErrorResponse("BAD_REQUEST", { message: "The band has no frequency ranges in the 3GPP catalogue" });
  assertWithin([next.downlinkLowKhz, next.downlinkHighKhz], catalog.downlinkKhz, "The downlink range lies outside the band");

  const uplink = uplinkKhzOf(next);
  if (catalog.duplex === "FDD" && uplink === null) {
    throw new ErrorResponse("BAD_REQUEST", { message: "A holding in an FDD band needs an uplink range" });
  }
  if (catalog.duplex !== "FDD" && uplink !== null) {
    throw new ErrorResponse("BAD_REQUEST", { message: "Only a holding in an FDD band can have an uplink range" });
  }
  if (uplink !== null) assertWithin(uplink, catalog.uplinkKhz, "The uplink range lies outside the band");
}

async function assertRegionInCountry(tx: DbTx, countryCode: string, regionId: number): Promise<void> {
  const [region] = await tx.select({ countryCode: regions.countryCode }).from(regions).where(eq(regions.id, regionId)).limit(1);
  if (region?.countryCode !== countryCode) throw new ErrorResponse("BAD_REQUEST", { message: "The region is not in the operator's country" });
}

async function assertJointOperator(tx: DbTx, countryCode: string, operatorId: number, jointOperatorId: number): Promise<void> {
  if (jointOperatorId === operatorId) throw new ErrorResponse("BAD_REQUEST", { message: "The joint operator must be another operator" });
  const [operator] = await tx.select({ countryCode: operators.countryCode }).from(operators).where(eq(operators.id, jointOperatorId)).limit(1);
  if (operator?.countryCode !== countryCode) {
    throw new ErrorResponse("BAD_REQUEST", { message: "The joint operator is not in the operator's country" });
  }
}

function overlaps(low: SQLWrapper, high: SQLWrapper, range: KhzRange): SQL | undefined {
  return and(lt(low, range[1]), gt(high, range[0]));
}

function rangesMeet(next: SpectrumHoldingValues): SQL | undefined {
  const downlink: KhzRange = [next.downlinkLowKhz, next.downlinkHighKhz];
  const uplink = uplinkKhzOf(next);
  const ranges = uplink === null ? [downlink] : [downlink, uplink];

  return or(
    ...ranges.flatMap((range) => [
      overlaps(spectrumHoldings.downlinkLowKhz, spectrumHoldings.downlinkHighKhz, range),
      overlaps(spectrumHoldings.uplinkLowKhz, spectrumHoldings.uplinkHighKhz, range),
    ]),
  );
}

function periodsMeet({ validFrom, validTo }: SpectrumHoldingValues): SQL | undefined {
  return and(
    validTo === null ? undefined : or(isNull(spectrumHoldings.validFrom), lte(spectrumHoldings.validFrom, validTo)),
    validFrom === null ? undefined : or(isNull(spectrumHoldings.validTo), gte(spectrumHoldings.validTo, validFrom)),
  );
}

async function assertNoOverlap(tx: DbTx, countryCode: string, next: SpectrumHoldingValues, updatedId?: number): Promise<void> {
  const [clash] = await tx
    .select({ id: spectrumHoldings.id })
    .from(spectrumHoldings)
    .innerJoin(operators, eq(operators.id, spectrumHoldings.operatorId))
    .where(
      and(
        eq(operators.countryCode, countryCode),
        rangesMeet(next),
        next.regionId === null ? undefined : or(isNull(spectrumHoldings.regionId), eq(spectrumHoldings.regionId, next.regionId)),
        periodsMeet(next),
        updatedId === undefined ? undefined : ne(spectrumHoldings.id, updatedId),
      ),
    )
    .limit(1);
  if (clash) throw new ErrorResponse("CONFLICT", { message: "The range overlaps another spectrum holding in this country" });
}

export async function validateSpectrumHoldingWrite(tx: DbTx, countryCode: string, next: SpectrumHoldingValues, updatedId?: number): Promise<void> {
  await assertBandFits(tx, countryCode, next);
  if (next.jointOperatorId !== null) await assertJointOperator(tx, countryCode, next.operatorId, next.jointOperatorId);
  if (next.regionId !== null) await assertRegionInCountry(tx, countryCode, next.regionId);
  await assertNoOverlap(tx, countryCode, next, updatedId);
}
