import { countries, operators, personTrailBins, trailLevels, trailSquares } from "@openbts/drizzle";
import type { MyTrailTileQuery, TrailTileQuery } from "@openbts/shared/contract";
import { type SQL, and, between, eq, inArray, or, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import type { BandRow } from "../../bands/serialize.js";
import { splitBandFilter } from "../../bands/unknown.js";
import { operatedBy } from "../../operators/sharing.js";
import { DATABASE_RATS } from "../../stations/serialize.js";
import { channelBandIntervals, loadBandPlans } from "../bandPlans.js";
import { findOperatorCodes, selectReportedCodes } from "../networks.js";
import type { Tile } from "./squares.js";
import { EMPTY_TILE, PERSON_TRAIL_ZOOM, TRAIL_MIN_ZOOM, type TileSquares, buildTile, squareOutline, squareZoom, tileSquares } from "./vectorTiles.js";

type TrailView = "public" | "staff";
type TrailNetwork = { plmn: string; operatorId: number; countryCode: string; isPublic: boolean };

const LEVEL_BUCKETS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const SAMPLE_CAP = 100;

function loadTrailNetworks(operatorIds: readonly number[]): Promise<TrailNetwork[]> {
  const reported = selectReportedCodes();
  return db
    .select({
      plmn: reported.reportedCode,
      operatorId: reported.operatorId,
      countryCode: operators.countryCode,
      isPublic: sql<boolean>`${countries.isVisible} AND ${countries.observationsPublic}`,
    })
    .from(reported)
    .innerJoin(operators, eq(operators.id, reported.operatorId))
    .innerJoin(countries, eq(countries.code, operators.countryCode))
    .where(operatedBy(reported.operatorId, operatorIds));
}

function databaseRats(rats: TrailTileQuery["rats"]) {
  return rats?.map((rat) => DATABASE_RATS[rat]);
}

function levelOfHistogram(): SQL {
  const steps = LEVEL_BUCKETS.filter((bucket) => bucket > 0).toReversed();
  const atOrAbove = (bucket: number) =>
    sql.raw(
      LEVEL_BUCKETS.filter((other) => other >= bucket)
        .map((other) => `banded.n${other}`)
        .join(" + "),
    );
  const cases = steps.map((bucket) => sql`WHEN 10 * (${atOrAbove(bucket)}) >= 9 * banded.total THEN ${sql.raw(String(bucket))}`);
  return sql`CASE ${sql.join(cases, sql` `)} ELSE 0 END`;
}

function bandFilter(bandIds: TrailTileQuery["bandIds"]): SQL | undefined {
  if (bandIds === undefined) return undefined;
  const selection = splitBandFilter(bandIds);
  return (
    or(
      selection.bandIds.length > 0 ? inArray(sql`banded.band_id`, selection.bandIds) : undefined,
      selection.includesUnknownBand ? sql`banded.band_id IS NULL` : undefined,
    ) ?? sql`false`
  );
}

function trailFeatures(squares: TileSquares, networks: readonly TrailNetwork[], plans: ReadonlyMap<string, BandRow[]>, query: TrailTileQuery): SQL {
  const ratType = sql.raw(trailSquares.rat.getSQLType());
  const networkRows = networks.map((network) => ({ plmn: network.plmn, operator_id: network.operatorId, country_code: network.countryCode }));
  const bandRows = unique(networks.map((network) => network.countryCode)).flatMap((countryCode) =>
    channelBandIntervals(plans.get(countryCode) ?? []).map((band) => ({
      country_code: countryCode,
      rat: band.rat,
      first_channel: band.firstChannel,
      last_channel: band.lastChannel,
      band_id: band.bandId,
    })),
  );
  const rats = databaseRats(query.rats);
  const counts = LEVEL_BUCKETS.map(
    (bucket) =>
      sql`coalesce(sum(${trailLevels.sampleCount}) FILTER (WHERE ${trailLevels.levelBucket} = ${sql.raw(String(bucket))}), 0) AS ${sql.raw(`n${bucket}`)}`,
  );
  const sums = LEVEL_BUCKETS.map((bucket) => sql.raw(`sum(square.n${bucket}) AS n${bucket}`));
  const where = bandFilter(query.bandIds);

  return sql`
    WITH square AS (
      SELECT network.operator_id, network.country_code, ${trailSquares.rat} AS rat, ${trailSquares.channel} AS channel, ${trailSquares.bin} AS bin,
        max(${trailSquares.lastSeenOn}) AS last_seen_on, ${sql.join(counts, sql`, `)}, sum(${trailLevels.sampleCount}) AS total
      FROM jsonb_to_recordset(${sql.param(networkRows)}::jsonb) AS network (plmn varchar(6), operator_id integer, country_code char(2))
      JOIN ${trailSquares}
        ON ${and(
          eq(trailSquares.plmn, sql`network.plmn`),
          eq(trailSquares.zoom, squares.zoom),
          between(trailSquares.bin, squares.first, squares.last),
          rats ? inArray(trailSquares.rat, rats) : undefined,
        )}
      JOIN ${trailLevels}
        ON ${and(
          eq(trailLevels.plmn, trailSquares.plmn),
          eq(trailLevels.zoom, squares.zoom),
          between(trailLevels.bin, squares.first, squares.last),
          eq(trailLevels.rat, trailSquares.rat),
          eq(trailLevels.channel, trailSquares.channel),
          eq(trailLevels.bin, trailSquares.bin),
          eq(trailLevels.held, trailSquares.held),
        )}
      GROUP BY network.operator_id, network.country_code, ${trailSquares.rat}, ${trailSquares.channel}, ${trailSquares.bin}
    ),
    channel_band AS (
      SELECT channel.country_code, channel.rat, channel.channel, band.band_id
      FROM (SELECT DISTINCT square.country_code, square.rat, square.channel FROM square) AS channel
      LEFT JOIN jsonb_to_recordset(${sql.param(bandRows)}::jsonb)
        AS band (country_code char(2), rat ${ratType}, first_channel integer, last_channel integer, band_id integer)
        ON band.country_code = channel.country_code AND band.rat = channel.rat AND channel.channel BETWEEN band.first_channel AND band.last_channel
    )
    SELECT banded.operator_id AS "operatorId", lower(banded.rat::text) AS "rat", banded.band_id AS "bandId", ${levelOfHistogram()} AS "level",
      least(banded.total, ${sql.raw(String(SAMPLE_CAP))})::int AS "samples", to_char(banded.last_seen_on, 'YYYY-MM-DD') AS "lastSeenOn",
      ${squareOutline(squares, sql`banded.bin`)} AS geom
    FROM (
      SELECT square.operator_id, square.rat, channel_band.band_id, square.bin, max(square.last_seen_on) AS last_seen_on,
        ${sql.join(sums, sql`, `)}, sum(square.total) AS total
      FROM square
      JOIN channel_band USING (country_code, rat, channel)
      GROUP BY square.operator_id, square.rat, channel_band.band_id, square.bin
    ) AS banded
    ${where ? sql`WHERE ${where}` : sql``}
  `;
}

export async function loadTrailTile(tile: Tile, query: TrailTileQuery, view: TrailView): Promise<Buffer> {
  const zoom = squareZoom(tile.zoom, TRAIL_MIN_ZOOM);
  if (zoom === null) return EMPTY_TILE;

  const [networks, plans] = await Promise.all([loadTrailNetworks(query.operatorIds), loadBandPlans()]);
  const shown = view === "public" ? networks.filter((network) => network.isPublic) : networks;
  if (shown.length === 0) return EMPTY_TILE;
  return buildTile("trails", trailFeatures(tileSquares(tile, zoom, zoom), shown, plans, query));
}

export async function loadMyTrailTile(tile: Tile, userId: string, query: MyTrailTileQuery): Promise<Buffer> {
  const zoom = squareZoom(tile.zoom, TRAIL_MIN_ZOOM, PERSON_TRAIL_ZOOM);
  if (zoom === null) return EMPTY_TILE;

  const codes = query.operatorIds ? await findOperatorCodes(query.operatorIds) : null;
  if (codes?.length === 0) return EMPTY_TILE;
  const squares = tileSquares(tile, zoom, PERSON_TRAIL_ZOOM);
  const rats = databaseRats(query.rats);
  const conditions = and(
    eq(personTrailBins.userId, userId),
    between(personTrailBins.bin, squares.first, squares.last),
    codes ? inArray(personTrailBins.plmn, codes) : undefined,
    rats ? inArray(personTrailBins.rat, rats) : undefined,
  );

  const network = selectReportedCodes();

  return buildTile(
    "trails",
    sql`
      SELECT mine.plmn AS "plmn", ${network.operatorId} AS "operatorId", lower(mine.rat::text) AS "rat",
        least(mine.samples, ${sql.raw(String(SAMPLE_CAP))})::int AS "samples", to_char(mine.last_seen_on, 'YYYY-MM-DD') AS "lastSeenOn",
        ${squareOutline(squares, sql`mine.square`)} AS geom
      FROM (
        SELECT ${personTrailBins.plmn} AS plmn, ${personTrailBins.rat} AS rat, ${personTrailBins.bin} >> ${sql.raw(String(squares.shift))} AS square,
          sum(${personTrailBins.sampleCount}) AS samples, max(${personTrailBins.lastSeenOn}) AS last_seen_on
        FROM ${personTrailBins}
        WHERE ${conditions}
        GROUP BY ${personTrailBins.plmn}, ${personTrailBins.rat}, ${personTrailBins.bin} >> ${sql.raw(String(squares.shift))}
      ) AS mine
      LEFT JOIN ${network} ON ${network.reportedCode} = mine.plmn
    `,
  );
}
