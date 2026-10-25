import { bands, cellShapes, cells, observationFlags, trailSquares } from "@openbts/drizzle";
import { and, eq, isNull, sql } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { syncDecommissionedFlags } from "../../../../../src/features/observed/flags/cells/decommissioned.js";
import { quadkeyOf, tileAt } from "../../../../../src/features/observed/tiles/squares.js";
import type { DbTx } from "../../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../helpers/crowdDatabase.js";
import { addCountry, addObservedCell, addOperator, addRegion, addStation, added, matchObservedCell } from "../../../../helpers/crowdWorld.js";

vi.mock("../../../../../src/database/psql.js", async () => (await import("../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QQ";
const NETWORK = "99975";
const OTHER_NETWORK = "99976";
const B3_CHANNEL = 1850;
const B20_CHANNEL = 6300;
const MEASURED_ZOOM = 18;
const FOOTPRINT = "POLYGON((-31.2 41.1, -31.0 41.1, -31.0 41.3, -31.2 41.3, -31.2 41.1))";

type Measured = { plmn?: string; channel?: number; held?: boolean };

async function addQuietCell(tx: DbTx): Promise<number> {
  await addCountry(tx, COUNTRY_CODE);
  const operatorId = await addOperator(tx, COUNTRY_CODE, Number(NETWORK));
  const band = added(
    await tx.insert(bands).values({ rat: "LTE", value: 1800, duplex: "FDD", variant: "railway", name: "ZY rail 1800" }).returning({ id: bands.id }),
    "The band",
  );
  const stationId = await addStation(tx, { operatorId, regionId: await addRegion(tx, COUNTRY_CODE), at: [-31.1, 41.2] });
  const cell = added(await tx.insert(cells).values({ station_id: stationId, band_id: band.id, rat: "LTE" }).returning({ id: cells.id }), "The cell");
  const observedCellId = await addObservedCell(tx, { plmn: NETWORK, cellKey: 24494 * 256 + 1, observedSiteId: null, seen: null });
  await matchObservedCell(tx, observedCellId, cell.id);
  await tx.insert(cellShapes).values({
    observedCellId,
    shapeVersion: 1,
    bearingDeg: 90,
    spreadDeg: 60,
    reachM: 1500,
    footprint: sql`ST_GeomFromText(${FOOTPRINT}, 4326)`,
  });
  return cell.id;
}

async function measureTwelveSquares(tx: DbTx, { plmn = NETWORK, channel = B3_CHANNEL, held = false }: Measured = {}): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await tx.insert(trailSquares).values(
    Array.from({ length: 12 }, (_, index) => ({
      plmn,
      rat: "LTE" as const,
      channel,
      zoom: MEASURED_ZOOM,
      bin: quadkeyOf(tileAt({ latitude: 41.15 + 0.01 * (index % 4), longitude: -31.15 + 0.03 * Math.floor(index / 4) }, MEASURED_ZOOM)),
      held,
      contributorBits: index % 2 === 0 ? 0b01n : 0b10n,
      lastSeenOn: today,
    })),
  );
}

async function openFlagOf(tx: DbTx, cellId: number) {
  const [flag] = await tx
    .select({ evidence: observationFlags.evidence })
    .from(observationFlags)
    .where(and(eq(observationFlags.kind, "possiblyDecommissioned"), eq(observationFlags.cellId, cellId), isNull(observationFlags.closedReason)));
  return flag;
}

describeOnCrowdDatabase("the possiblyDecommissioned pass", () => {
  it("opens for a cell never seen whose network two people measured on its band in twelve squares of its footprint", () =>
    rolledBack(async (tx) => {
      const cellId = await addQuietCell(tx);
      await measureTwelveSquares(tx);

      await syncDecommissionedFlags();

      expect((await openFlagOf(tx, cellId))?.evidence).toMatchObject({ lastSeenOn: null, measuredSquareCount: 12 });
    }));

  it("counts no square of another network, of another band, or held back", () =>
    rolledBack(async (tx) => {
      const cellId = await addQuietCell(tx);
      await measureTwelveSquares(tx, { plmn: OTHER_NETWORK });
      await measureTwelveSquares(tx, { channel: B20_CHANNEL });
      await measureTwelveSquares(tx, { held: true });

      await syncDecommissionedFlags();

      expect(await openFlagOf(tx, cellId)).toBeUndefined();
    }));
});
