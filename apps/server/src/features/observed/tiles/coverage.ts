import { cellBins, cellCopies, observedCells } from "@openbts/drizzle";
import { type SQL, and, between, eq, inArray, notInArray, sql } from "drizzle-orm";

import type { Tile } from "./squares.js";
import { COVERAGE_MIN_ZOOM, EMPTY_TILE, TRAIL_ZOOM, type TileSquares, buildTile, squareOutline, squareZoom, tileSquares } from "./vectorTiles.js";

const TENTH_PERCENTILE_Z = 1.2815516;
const SAMPLE_CAP = 100;

function tenthPercentileDb(wsum: string, wsq: string, weight: string): SQL {
  const mean = `(${wsum}::float8 / nullif(${weight}, 0))`;
  return sql.raw(`((${mean} - ${TENTH_PERCENTILE_Z} * sqrt(greatest(${wsq}::float8 / nullif(${weight}, 0) - ${mean} * ${mean}, 0))) / 100)`);
}

function coverageFeatures(squares: TileSquares, observedCellIds: readonly number[], shownCells: SQL | undefined): SQL {
  const ids = [...observedCellIds];
  const members = sql`
    SELECT requested.id AS observed_cell_id, requested.id AS member_id
    FROM requested
    UNION ALL
    SELECT ${cellCopies.primaryCellId}, ${cellCopies.observedCellId}
    FROM ${cellCopies}
    WHERE ${cellCopies.primaryCellId} IN (SELECT requested.id FROM requested) AND ${notInArray(cellCopies.observedCellId, ids)}
  `;

  return sql`
    WITH requested AS (SELECT ${observedCells.id} AS id FROM ${observedCells} WHERE ${and(inArray(observedCells.id, ids), shownCells)}),
    member AS (${members}),
    shown AS (
      SELECT member.observed_cell_id, ${cellBins.bin} AS bin, sum(${cellBins.sampleCount}) AS samples, sum(${cellBins.weightMilli}) AS weight,
        sum(${cellBins.servingWeightMilli}) AS serving, sum(${cellBins.levelWsum}) AS level_wsum, sum(${cellBins.levelWsq}) AS level_wsq,
        sum(${cellBins.sinrWeightMilli}) AS sinr_weight, sum(${cellBins.sinrWsum}) AS sinr_wsum, sum(${cellBins.sinrWsq}) AS sinr_wsq,
        max(${cellBins.lastSeenOn}) AS last_seen_on
      FROM member
      JOIN ${cellBins} ON ${and(eq(cellBins.observedCellId, sql`member.member_id`), between(cellBins.bin, squares.first, squares.last))}
      GROUP BY member.observed_cell_id, ${cellBins.bin}
      HAVING 2 * sum(${cellBins.stationaryCount}) < sum(${cellBins.sampleCount})
    ),
    square AS (
      SELECT shown.observed_cell_id, shown.bin >> ${sql.raw(String(squares.shift))} AS square, sum(shown.samples) AS samples,
        sum(shown.weight) AS weight, sum(shown.serving) AS serving, sum(shown.level_wsum) AS level_wsum, sum(shown.level_wsq) AS level_wsq,
        sum(shown.sinr_weight) AS sinr_weight, sum(shown.sinr_wsum) AS sinr_wsum, sum(shown.sinr_wsq) AS sinr_wsq, max(shown.last_seen_on) AS last_seen_on
      FROM shown
      GROUP BY shown.observed_cell_id, shown.bin >> ${sql.raw(String(squares.shift))}
    ),
    ranked AS (
      SELECT square.*,
        ${tenthPercentileDb("square.level_wsum", "square.level_wsq", "square.weight")} AS level_db,
        ${tenthPercentileDb("square.sinr_wsum", "square.sinr_wsq", "square.sinr_weight")} AS sinr_db,
        row_number() OVER (PARTITION BY square.square ORDER BY square.serving DESC, square.samples DESC, square.observed_cell_id) AS rank,
        count(*) OVER (PARTITION BY square.square) AS cell_count,
        sum(square.serving) OVER (PARTITION BY square.square) AS square_serving
      FROM square
    )
    SELECT ranked.observed_cell_id AS "featureId", ranked.observed_cell_id AS "observedCellId",
      CASE WHEN ranked.level_db < -120 THEN 0 WHEN ranked.level_db >= -120 THEN least(7, floor((ranked.level_db + 120) / 10)::int + 1) END AS "level",
      CASE WHEN ranked.sinr_db < 0 THEN 0 WHEN ranked.sinr_db >= 0 THEN least(5, floor(ranked.sinr_db / 5)::int + 1) END AS "sinr",
      CASE WHEN ranked.square_serving > 0 THEN round(ranked.serving / ranked.square_serving, 2)::float8 ELSE 0::float8 END AS "servingShare",
      least(ranked.samples, ${sql.raw(String(SAMPLE_CAP))})::int AS "samples", ranked.cell_count::int AS "cellCount",
      to_char(ranked.last_seen_on, 'YYYY-MM-DD') AS "lastSeenOn", ${squareOutline(squares, sql`ranked.square`)} AS geom
    FROM ranked
    WHERE ranked.rank = 1
  `;
}

export async function loadCoverageTile(tile: Tile, observedCellIds: readonly number[], shownCells: SQL | undefined): Promise<Buffer> {
  const zoom = squareZoom(tile.zoom, COVERAGE_MIN_ZOOM);
  if (zoom === null) return EMPTY_TILE;
  return buildTile("coverage", coverageFeatures(tileSquares(tile, zoom, TRAIL_ZOOM), observedCellIds, shownCells), "featureId");
}
