mod common;

use common::{Harness, corpus};

const DIRTY_LONG_ENOUGH: &str = "UPDATE observations.dirty_sites SET dirty_since = now() - interval '3 minutes'";

const ESTIMATES_BY_IDENTITY: &str = "
    SELECT concat_ws(' ', s.plmn, s.rat, s.node_id, e.algorithm_version, ST_AsText(e.point), e.uncertainty_m, e.ellipse_major_m,
      e.ellipse_minor_m, e.ellipse_azimuth_deg, ST_AsText(e.alternative_point), e.is_consistent, e.sample_count, e.contributor_count,
      e.person_count, e.bin_count, e.ta_sample_count, e.angular_coverage_deg, e.distinct_days, e.max_distance_m, e.leave_out_shift_m, e.evidence_class,
      e.ellipse_scale)
    FROM observations.site_estimates e JOIN observations.observed_sites s ON s.id = e.observed_site_id
    ORDER BY 1";

const AROUND_THE_SITES: [&str; 8] = [
    "SELECT concat_ws(' ', observed_site_id, lead_site_id) FROM observations.site_groups ORDER BY 1",
    "SELECT concat_ws(' ', lead_site_id, ST_AsText(point), uncertainty_m, is_consistent, sample_count) FROM observations.group_estimates ORDER BY 1",
    "SELECT concat_ws(' ', observed_site_id, location_id, official_site_id, other_site_id, candidate_id, difference, probability, is_snap)
     FROM observations.snap_tests ORDER BY 1",
    "SELECT concat_ws(' ', observed_site_id, ST_AsText(origin), cell_m, columns, rows, md5(cost)) FROM observations.site_evidence_grids ORDER BY 1",
    "SELECT concat_ws(' ', observed_cell_id, bearing_deg, spread_deg, reach_m, reach_ta_m, mean_quality_centi_db, mean_sinr_centi_db, ST_AsText(footprint))
     FROM observations.cell_shapes ORDER BY 1",
    "SELECT concat_ws(' ', observed_cell_id, distance_band, mean_level_centi_db, mean_sinr_centi_db, sample_count) FROM observations.cell_level_profiles ORDER BY 1",
    "SELECT concat_ws(' ', observed_cell_id, kind, length_m, ST_AsText(edge)) FROM observations.cell_edges ORDER BY 1",
    "SELECT concat_ws(' ', plmn, rat, channel, pci, bin, observed_cell_id) FROM observations.resolved_neighbours ORDER BY 1",
];

const FORGET_THE_SITES: &str = "
    TRUNCATE observations.site_estimates, observations.group_estimates, observations.cell_shapes, observations.resolved_neighbours,
      observations.dirty_sites CASCADE";

async fn rows_around_the_sites(harness: &Harness) -> Vec<String> {
    let client = harness.store.database.pool.get().await.expect("a connection");
    let mut rows = Vec::new();
    for query in AROUND_THE_SITES {
        rows.push(format!("-- {query}"));
        rows.extend(client.query(query, &[]).await.expect("the rows").iter().map(|row| row.get::<_, String>(0)));
    }
    rows
}

async fn settle(harness: &Harness) {
    let client = harness.store.database.pool.get().await.expect("a connection");
    for _ in 0..10 {
        let rows = client.query("DELETE FROM observations.dirty_sites RETURNING observed_site_id", &[]).await.expect("the dirty sites");
        let mut dirty: Vec<i32> = rows.iter().map(|row| row.get(0)).collect();
        if dirty.is_empty() {
            return;
        }
        dirty.sort_unstable();
        harness.store.estimate_sites(&dirty).await.expect("the dirty sites are estimated");
    }
    panic!("the sites kept marking each other dirty");
}

async fn estimates(harness: &Harness) -> Vec<String> {
    let client = harness.store.database.pool.get().await.expect("a connection");
    client.query(ESTIMATES_BY_IDENTITY, &[]).await.expect("the estimates").iter().map(|row| row.get(0)).collect()
}

async fn site_ids(harness: &Harness) -> Vec<i32> {
    let client = harness.store.database.pool.get().await.expect("a connection");
    let rows = client.query("SELECT id FROM observations.observed_sites WHERE retired_at IS NULL ORDER BY id", &[]).await.expect("the sites");
    rows.iter().map(|row| row.get(0)).collect()
}

async fn fold_corpus(harness: &Harness) {
    let uploads = corpus(30, 4, 61);
    harness.seed_phones(&uploads, "qualcomm").await;
    for upload in &uploads {
        harness.store_upload(upload).await;
    }
    harness.fold_all(&uploads).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_corpus_gets_estimates_and_confirmations() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    fold_corpus(&harness).await;
    assert!(harness.count("SELECT count(*) FROM observations.dirty_sites").await > 0, "the folds mark their sites");
    assert_eq!(harness.store.estimate_dirty_sites().await.expect("the site loop runs"), 0, "a site waits two minutes after it changed");

    harness.execute(DIRTY_LONG_ENOUGH).await;
    let mut estimated = 0;
    loop {
        let batch = harness.store.estimate_dirty_sites().await.expect("the site loop runs");
        if batch == 0 {
            break;
        }
        estimated += batch;
    }
    assert!(estimated > 0);
    assert_eq!(harness.count("SELECT count(*) FROM observations.site_estimates").await as usize, estimated);
    assert_eq!(harness.count("SELECT count(*) FROM observations.dirty_sites WHERE dirty_since <= now() - interval '2 minutes'").await, 0);
    assert!(
        harness.count("SELECT count(*) FROM observations.site_confirmations").await > 0,
        "four devices of four people on several days confirm sites"
    );
    assert!(harness.count("SELECT count(*) FROM observations.match_queue").await > 0, "estimated sites go back to the matcher");

    harness
        .execute(
            "INSERT INTO observations.dirty_sites (observed_site_id, dirty_since) SELECT id, now() - interval '3 minutes' FROM observations.observed_sites
             ON CONFLICT (observed_site_id) DO UPDATE SET dirty_since = excluded.dirty_since",
        )
        .await;
    assert_eq!(harness.store.estimate_dirty_sites().await.expect("the site loop runs"), 0, "a site estimated within ten minutes waits");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn estimating_in_another_order_gives_the_same_rows() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    fold_corpus(&harness).await;
    let ids = site_ids(&harness).await;
    for id in &ids {
        harness.store.estimate_sites(&[*id]).await.expect("a site is estimated");
    }
    let forward = estimates(&harness).await;
    assert!(!forward.is_empty());

    harness.execute("DELETE FROM observations.site_estimates").await;
    harness.store.estimate_sites(&ids.iter().rev().copied().collect::<Vec<_>>()).await.expect("the sites are estimated");
    assert_eq!(estimates(&harness).await, forward);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_rows_around_the_sites_do_not_depend_on_the_order() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    fold_corpus(&harness).await;
    let ids = site_ids(&harness).await;
    harness.store.estimate_sites(&ids).await.expect("the sites are estimated");
    settle(&harness).await;
    assert!(harness.count("SELECT count(*) FROM observations.site_evidence_grids").await > 0, "every estimate gets its evidence grid");
    harness
        .execute(
            "INSERT INTO observations.candidate_sources (source, licence, may_copy_coordinates) VALUES ('osm', 'ODbL', true);
             INSERT INTO observations.candidates (source, ref, point)
             SELECT 'osm', 'engine-test', e.point FROM observations.site_estimates e
             WHERE NOT EXISTS (SELECT 1 FROM observations.site_groups g WHERE g.observed_site_id = e.observed_site_id)
             ORDER BY e.observed_site_id LIMIT 1",
        )
        .await;

    harness.execute(FORGET_THE_SITES).await;
    for id in &ids {
        harness.store.estimate_sites(&[*id]).await.expect("a site is estimated");
    }
    settle(&harness).await;
    let (forward_estimates, forward) = (estimates(&harness).await, rows_around_the_sites(&harness).await);
    assert!(
        harness.count("SELECT count(*) FROM observations.snap_tests WHERE candidate_id IS NOT NULL AND is_snap").await > 0,
        "a mast where the site stands is snapped to"
    );

    harness.execute(FORGET_THE_SITES).await;
    harness.store.estimate_sites(&ids.iter().rev().copied().collect::<Vec<_>>()).await.expect("the sites are estimated");
    settle(&harness).await;
    assert_eq!(estimates(&harness).await, forward_estimates);
    assert_eq!(rows_around_the_sites(&harness).await, forward);
    eprintln!(
        "groups {}, shapes {}, edges {}, snap tests {}, resolved neighbours {}",
        harness.count("SELECT count(*) FROM observations.site_groups").await,
        harness.count("SELECT count(*) FROM observations.cell_shapes").await,
        harness.count("SELECT count(*) FROM observations.cell_edges").await,
        harness.count("SELECT count(*) FROM observations.snap_tests").await,
        harness.count("SELECT count(*) FROM observations.resolved_neighbours").await,
    );
}

const REGION_UNDER_THE_CORPUS: &str = "
    WITH region AS (
      INSERT INTO public.regions (name, code, country_code, iso_code) VALUES ('Engine test region', 'ZZT', 'PL', 'PL-ZZT') RETURNING id
    ),
    outline AS (
      INSERT INTO public.region_boundaries (region_id, geom, source)
      SELECT id, ST_Multi(ST_MakeEnvelope(13, 49, 24.5, 55, 4326)), 'engine test' FROM region
      RETURNING region_id, geom
    )
    INSERT INTO public.region_lookup (region_id, geom) SELECT region_id, (ST_Dump(geom)).geom FROM outline";

const ESTIMATES_OUTSIDE_THE_REGION: &str = "
    SELECT count(*) FROM (
      SELECT region_id FROM observations.site_estimates UNION ALL SELECT region_id FROM observations.group_estimates
    ) estimate
    WHERE region_id IS DISTINCT FROM (SELECT id FROM public.regions WHERE code = 'ZZT')";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn every_estimate_keeps_the_region_its_point_is_in() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    fold_corpus(&harness).await;
    harness.execute(REGION_UNDER_THE_CORPUS).await;
    harness.store.estimate_sites(&site_ids(&harness).await).await.expect("the sites are estimated");
    settle(&harness).await;
    assert!(harness.count("SELECT count(*) FROM observations.site_estimates").await > 0);
    assert_eq!(harness.count(ESTIMATES_OUTSIDE_THE_REGION).await, 0, "the estimates' trigger looks their region up");
}
