use engine_fold::deltas::DIRTY_TILE_ZOOM;
use engine_geo::Point;
use engine_geo::square::Tile;
use tokio_postgres::{IsolationLevel, Transaction};

use crate::StoreError;
use crate::pipeline::Store;

const PYRAMID_LOCK: i64 = 0x0b75_c0de_0002;
const PARENT_ZOOMS: [i32; 4] = [18, 16, 14, 12];
const TILES_PER_TRANSACTION: usize = 64;

const CLAIM_DIRTY_TILES: &str = "
    DELETE FROM observations.trail_dirty_tiles
    WHERE tile IN (SELECT tile FROM observations.trail_dirty_tiles ORDER BY tile LIMIT $1 FOR UPDATE SKIP LOCKED)
    RETURNING tile";

const FORGET_LEVEL: &str = "
    DELETE FROM observations.trail_squares s
    USING unnest($1::bigint[]) AS dirty (tile)
    WHERE s.zoom = $2::int
      AND s.bin BETWEEN dirty.tile << (2 * ($2::int - 12)) AND ((dirty.tile + 1) << (2 * ($2::int - 12))) - 1";

const BUILD_SQUARES_FROM_CHILDREN: &str = "
    INSERT INTO observations.trail_squares (plmn, rat, channel, zoom, bin, held, contributor_bits, last_seen_on)
    SELECT s.plmn, s.rat, s.channel, $2::int::smallint, s.bin >> 4, s.held, bit_or(s.contributor_bits), max(s.last_seen_on)
    FROM unnest($1::bigint[]) AS dirty (tile)
    JOIN observations.trail_squares s
      ON s.zoom = $2::int + 2
     AND s.bin BETWEEN dirty.tile << (2 * ($2::int - 10)) AND ((dirty.tile + 1) << (2 * ($2::int - 10))) - 1
    GROUP BY s.plmn, s.rat, s.channel, s.bin >> 4, s.held
    ORDER BY 1, 5, 2, 3, 6";

const BUILD_LEVELS_FROM_CHILDREN: &str = "
    INSERT INTO observations.trail_levels (plmn, rat, channel, zoom, bin, held, level_bucket, sample_count)
    SELECT l.plmn, l.rat, l.channel, $2::int::smallint, l.bin >> 4, l.held, l.level_bucket, sum(l.sample_count)::int
    FROM unnest($1::bigint[]) AS dirty (tile)
    JOIN observations.trail_levels l
      ON l.zoom = $2::int + 2
     AND l.bin BETWEEN dirty.tile << (2 * ($2::int - 10)) AND ((dirty.tile + 1) << (2 * ($2::int - 10))) - 1
    GROUP BY l.plmn, l.rat, l.channel, l.bin >> 4, l.held, l.level_bucket
    ORDER BY 1, 5, 2, 3, 6, 7";

pub fn tiles_covering(west: f64, south: f64, east: f64, north: f64) -> Vec<i64> {
    let north_west = Tile::at(Point::new(north, west), DIRTY_TILE_ZOOM);
    let south_east = Tile::at(Point::new(south, east), DIRTY_TILE_ZOOM);
    let mut tiles = Vec::new();
    for x in north_west.x..=south_east.x {
        for y in north_west.y..=south_east.y {
            tiles.push(Tile { zoom: DIRTY_TILE_ZOOM, x, y }.quadkey() as i64);
        }
    }
    tiles
}

impl Store {
    pub async fn rebuild_dirty_tiles(&self) -> Result<usize, StoreError> {
        let mut rebuilt = 0;
        loop {
            let mut client = self.database.pool.get().await?;
            let transaction = client.build_transaction().isolation_level(IsolationLevel::RepeatableRead).start().await?;
            if !transaction.query_one("SELECT pg_try_advisory_xact_lock($1)", &[&PYRAMID_LOCK]).await?.get::<_, bool>(0) {
                return Ok(rebuilt);
            }
            let tiles: Vec<i64> = transaction.query(CLAIM_DIRTY_TILES, &[&(TILES_PER_TRANSACTION as i64)]).await?.iter().map(|row| row.get(0)).collect();
            if tiles.is_empty() {
                return Ok(rebuilt);
            }
            rebuild_tiles(&transaction, &tiles).await?;
            transaction.commit().await?;
            rebuilt += tiles.len();
        }
    }

    pub async fn rebuild_trails_in(&self, west: f64, south: f64, east: f64, north: f64) -> Result<usize, StoreError> {
        let tiles = tiles_covering(west, south, east, north);
        for chunk in tiles.chunks(TILES_PER_TRANSACTION) {
            let mut client = self.database.pool.get().await?;
            let transaction = client.build_transaction().isolation_level(IsolationLevel::RepeatableRead).start().await?;
            transaction.execute("SELECT pg_advisory_xact_lock($1)", &[&PYRAMID_LOCK]).await?;
            rebuild_tiles(&transaction, chunk).await?;
            transaction.execute("DELETE FROM observations.trail_dirty_tiles WHERE tile = ANY($1)", &[&chunk]).await?;
            transaction.commit().await?;
        }
        Ok(tiles.len())
    }
}

async fn rebuild_tiles(transaction: &Transaction<'_>, tiles: &[i64]) -> Result<(), StoreError> {
    for zoom in PARENT_ZOOMS {
        transaction.execute(FORGET_LEVEL, &[&tiles, &zoom]).await?;
        transaction.execute(BUILD_SQUARES_FROM_CHILDREN, &[&tiles, &zoom]).await?;
        transaction.execute(BUILD_LEVELS_FROM_CHILDREN, &[&tiles, &zoom]).await?;
    }
    Ok(())
}
