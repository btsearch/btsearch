mod common;

use common::{Harness, corpus, fixture_upload};
use engine_store::runs::Done;

const PARENTS_THAT_DISAGREE: &str = "
    WITH children AS (
      SELECT p.plmn, p.rat, p.channel, p.zoom, p.bin, p.held, p.level_bucket, p.sample_count AS parent_count, sum(c.sample_count) AS child_count
      FROM observations.trail_levels p
      LEFT JOIN observations.trail_levels c
        ON c.zoom = 20 AND c.plmn = p.plmn AND c.rat = p.rat AND c.channel = p.channel AND c.held = p.held
        AND c.level_bucket = p.level_bucket AND (c.bin >> (2 * (20 - p.zoom))) = p.bin
      WHERE p.zoom < 20
      GROUP BY p.plmn, p.rat, p.channel, p.zoom, p.bin, p.held, p.level_bucket, p.sample_count
    )
    SELECT count(*) FROM children WHERE child_count IS DISTINCT FROM parent_count";

const PARENT_SQUARES_THAT_DISAGREE: &str = "
    WITH children AS (
      SELECT p.contributor_bits, p.last_seen_on, bit_or(c.contributor_bits) AS child_bits, max(c.last_seen_on) AS child_last_seen_on
      FROM observations.trail_squares p
      LEFT JOIN observations.trail_squares c
        ON c.zoom = 20 AND c.plmn = p.plmn AND c.rat = p.rat AND c.channel = p.channel AND c.held = p.held
        AND (c.bin >> (2 * (20 - p.zoom))) = p.bin
      WHERE p.zoom < 20
      GROUP BY p.plmn, p.rat, p.channel, p.zoom, p.bin, p.held, p.contributor_bits, p.last_seen_on
    )
    SELECT count(*) FROM children WHERE child_bits IS DISTINCT FROM contributor_bits OR child_last_seen_on IS DISTINCT FROM last_seen_on";

const PARENT_SQUARES_WITHOUT_LEVELS: &str = "
    SELECT count(*) FROM observations.trail_squares p
    WHERE p.zoom < 20 AND NOT EXISTS (
      SELECT 1 FROM observations.trail_levels l
      WHERE l.plmn = p.plmn AND l.rat = p.rat AND l.channel = p.channel AND l.zoom = p.zoom AND l.bin = p.bin AND l.held = p.held
    )";

const CHILDREN_WITHOUT_PARENTS: &str = "
    SELECT count(*) FROM observations.trail_levels c
    WHERE c.zoom = 20 AND NOT EXISTS (
      SELECT 1 FROM observations.trail_levels p
      WHERE p.zoom = 12 AND p.plmn = c.plmn AND p.rat = c.rat AND p.channel = c.channel AND p.held = c.held
        AND p.level_bucket = c.level_bucket AND p.bin = c.bin >> 16
    )";

const TILE: i64 = 9_000_000;
const OTHER_TILE: i64 = 9_000_001;

const SEED_TWO_TILES: &str = "
    INSERT INTO observations.trail_squares (plmn, rat, channel, zoom, bin, held, contributor_bits, last_seen_on)
    SELECT '26001', 'LTE', 1300, 20, (tile << 16) + child, false, 1::bigint << (child % 3), DATE '2099-01-01' + child % 7
    FROM unnest('{9000000,9000001}'::bigint[]) AS tile, unnest('{0,1,4,5,65535}'::int[]) AS child;
    INSERT INTO observations.trail_levels (plmn, rat, channel, zoom, bin, held, level_bucket, sample_count)
    SELECT plmn, rat, channel, zoom, bin, held, bucket, 1 + (bin % 5)::int
    FROM observations.trail_squares, unnest('{2,5}'::smallint[]) AS bucket
    WHERE zoom = 20;
    INSERT INTO observations.trail_dirty_tiles (tile) VALUES (9000000), (9000001);";

const CHANGE_CHILDREN_OF_BOTH: &str = "
    UPDATE observations.trail_squares SET contributor_bits = contributor_bits | 8, last_seen_on = last_seen_on + 30 WHERE zoom = 20;
    UPDATE observations.trail_levels SET sample_count = sample_count + 10 WHERE zoom = 20;";

const PARENTS_OF_TILE: &str = "
    SELECT concat_ws(' ', s.plmn, s.rat, s.channel, s.zoom, s.bin, s.held, s.contributor_bits, s.last_seen_on, l.level_bucket, l.sample_count)
    FROM observations.trail_squares s
    JOIN observations.trail_levels l USING (plmn, rat, channel, zoom, bin, held)
    WHERE s.zoom < 20 AND (s.bin >> (2 * (s.zoom - 12))) = $1
    ORDER BY s.zoom, s.bin, l.level_bucket";

async fn parents_of(harness: &Harness, tile: i64) -> Vec<String> {
    let client = harness.store.database.pool.get().await.expect("a connection");
    client.query(PARENTS_OF_TILE, &[&tile]).await.expect("the parents read").iter().map(|row| row.get(0)).collect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn every_parent_is_the_sum_of_its_children_after_folds_and_subtractions() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let uploads = corpus(40, 4, 31);
    harness.store_and_fold(&uploads, "samsung").await;
    assert!(harness.count("SELECT count(*) FROM observations.trail_levels WHERE zoom = 20").await > 0, "the corpus leaves public trails");

    assert!(harness.store.rebuild_dirty_tiles().await.expect("the pyramid builds") > 0);
    assert_eq!(harness.count("SELECT count(*) FROM observations.trail_dirty_tiles").await, 0);
    assert_eq!(harness.count(PARENTS_THAT_DISAGREE).await, 0);
    assert_eq!(harness.count(PARENT_SQUARES_THAT_DISAGREE).await, 0);
    assert_eq!(harness.count(CHILDREN_WITHOUT_PARENTS).await, 0);

    let withdrawn = &uploads[3];
    harness.set_status(withdrawn.upload_id, "withdrawn").await;
    if matches!(harness.store.subtract_due(withdrawn.upload_id).await.expect("the subtraction runs"), Done::Folded(_)) {
        assert!(harness.count("SELECT count(*) FROM observations.trail_dirty_tiles").await > 0, "a subtraction marks its tiles");
    }
    harness.store.rebuild_dirty_tiles().await.expect("the pyramid builds");
    assert_eq!(harness.count(PARENTS_THAT_DISAGREE).await, 0);
    assert_eq!(harness.count(PARENT_SQUARES_THAT_DISAGREE).await, 0);
    assert_eq!(harness.count(PARENT_SQUARES_WITHOUT_LEVELS).await, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_rebuild_leaves_the_parents_of_other_tiles_alone() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.execute(SEED_TWO_TILES).await;
    assert_eq!(harness.store.rebuild_dirty_tiles().await.expect("the pyramid builds"), 2);
    assert_eq!(harness.count(PARENTS_THAT_DISAGREE).await, 0);
    assert_eq!(harness.count(PARENT_SQUARES_THAT_DISAGREE).await, 0);

    harness.execute(CHANGE_CHILDREN_OF_BOTH).await;
    harness.execute(&format!("INSERT INTO observations.trail_dirty_tiles (tile) VALUES ({TILE})")).await;
    let other_before = parents_of(&harness, OTHER_TILE).await;
    assert_eq!(harness.store.rebuild_dirty_tiles().await.expect("the pyramid builds"), 1);
    let rebuilt = parents_of(&harness, TILE).await;
    assert_eq!(parents_of(&harness, OTHER_TILE).await, other_before, "a tile nobody marked keeps its parents");

    harness.execute(&format!("INSERT INTO observations.trail_dirty_tiles (tile) VALUES ({OTHER_TILE})")).await;
    harness.store.rebuild_dirty_tiles().await.expect("the pyramid builds");
    assert_eq!(harness.count(PARENTS_THAT_DISAGREE).await, 0);
    assert_eq!(harness.count(PARENT_SQUARES_THAT_DISAGREE).await, 0);
    assert_eq!(parents_of(&harness, TILE).await, rebuilt, "the marked tile was rebuilt in full the first time");
    assert_ne!(parents_of(&harness, OTHER_TILE).await, other_before, "the other tile's children had changed");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn trip_ends_stay_out_of_public_trails_and_in_the_persons() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let unmarked = fixture_upload("appendix-a.json", 700);
    harness.seed_phone(unmarked.device_id, "samsung").await;
    harness.store_upload(&unmarked).await;
    harness.fold(unmarked.upload_id).await;
    harness.store.rebuild_dirty_tiles().await.expect("the pyramid builds");

    assert_eq!(harness.count("SELECT count(*) FROM observations.trail_levels").await, 0, "its one reading lies in the first 100 m");
    assert_eq!(harness.count("SELECT sum(sample_count) FROM observations.person_trail_bins").await, 1);
}
