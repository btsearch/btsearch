mod common;

use std::time::Duration;

use common::{DATES_AND_BITS, Harness, corpus, fixture_upload, fixtures_directory};
use engine_corpus::{GeneratedUpload, read_fixtures};
use engine_store::outlines;
use engine_store::pipeline::Outcome;
use engine_store::runs::Done;

const POLAND_FROM_14_EAST: &str = "ST_Multi(ST_MakeEnvelope(14, 49, 24.5, 55, 4326))";
const POLAND_FROM_18_EAST: &str = "ST_Multi(ST_MakeEnvelope(18, 49, 24.5, 55, 4326))";

async fn add(harness: &Harness, upload: &GeneratedUpload, modem_family: &str) -> bool {
    harness.seed_phone(upload.device_id, modem_family).await;
    harness.store_upload(upload).await;
    matches!(harness.fold(upload.upload_id).await, Outcome::Processed(_))
}

async fn build_outlines(harness: &Harness) {
    let mut client = harness.store.database.pool.get().await.expect("a connection");
    outlines::build_when_changed(&mut client).await.expect("the outlines build");
}

async fn unfolded(harness: &Harness, upload: &GeneratedUpload) -> bool {
    let query = format!("SELECT count(*) FROM observations.upload_folds WHERE upload_id = '{}' AND unfolded_at IS NOT NULL", upload.upload_id);
    harness.count(&query).await == 1
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_withdrawal_returns_every_count_and_sum() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.store_and_fold(&corpus(24, 4, 11), "samsung").await;
    let before = harness.digest().await.without(&DATES_AND_BITS);

    let names: Vec<String> = read_fixtures(&fixtures_directory()).expect("the fixtures are readable").into_iter().map(|(name, _)| name).collect();
    for (index, name) in names.iter().enumerate() {
        let extra = fixture_upload(name, 100 + index as u64);
        let folded = add(&harness, &extra, "samsung").await;
        harness.set_status(extra.upload_id, "withdrawn").await;
        let done = harness.store.subtract_due(extra.upload_id).await.expect("the subtraction runs");
        assert_eq!(matches!(done, Done::Folded(_)), folded, "{name}: a folded upload is subtracted, a rejected one has nothing to subtract");
        assert_eq!(unfolded(&harness, &extra).await, folded, "{name}");
        assert_eq!(harness.digest().await.without(&DATES_AND_BITS), before, "{name}: the digest is what it was before the upload");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_exclusion_subtracts_and_a_restore_gives_the_digest_back() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.store_and_fold(&corpus(24, 4, 12), "samsung").await;
    let before = harness.digest().await.without(&DATES_AND_BITS);
    let extra = fixture_upload("appendix-a.json", 200);
    assert!(add(&harness, &extra, "samsung").await);
    let with_extra = harness.digest().await.without(&DATES_AND_BITS);

    harness.set_status(extra.upload_id, "excluded").await;
    assert!(matches!(harness.store.subtract_due(extra.upload_id).await.expect("the subtraction runs"), Done::Folded(_)));
    assert_eq!(harness.digest().await.without(&DATES_AND_BITS), before);

    harness.set_status(extra.upload_id, "processed").await;
    assert!(matches!(harness.store.restore_due(extra.upload_id).await.expect("the restore runs"), Done::Folded(_)));
    assert!(!unfolded(&harness, &extra).await);
    assert_eq!(harness.digest().await.without(&DATES_AND_BITS), with_extra);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_subtraction_reads_only_what_its_fold_recorded() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness
        .execute(&format!(
            "WITH region AS (INSERT INTO public.regions (name, code, country_code, iso_code) VALUES ('Engine test region', 'ZZT', 'PL', 'PL-ZZT') RETURNING id)
             INSERT INTO public.region_boundaries (region_id, geom, source) SELECT id, {POLAND_FROM_14_EAST}, 'engine test' FROM region"
        ))
        .await;
    build_outlines(&harness).await;
    harness.store_and_fold(&corpus(24, 4, 13), "samsung").await;
    let before = harness.digest().await.without(&DATES_AND_BITS);
    let extras: Vec<GeneratedUpload> = ["appendix-a.json", "nr-standalone.json", "umts.json"]
        .iter()
        .enumerate()
        .map(|(index, name)| fixture_upload(name, 300 + index as u64))
        .collect();
    for extra in &extras {
        assert!(add(&harness, extra, "samsung").await);
    }
    assert!(harness.count("SELECT count(*) FROM observations.contributor_months").await > 0, "the outlines give readings a country");

    harness.execute("UPDATE observations.socs SET modem_family = 'qualcomm'").await;
    harness.execute("UPDATE public.countries SET tools = '{analyzer}' WHERE code = 'PL'").await;
    harness
        .execute(&format!(
            "UPDATE public.region_boundaries SET geom = {POLAND_FROM_18_EAST}, updated_at = now()
             WHERE region_id = (SELECT id FROM public.regions WHERE code = 'ZZT')"
        ))
        .await;
    build_outlines(&harness).await;
    assert_eq!(harness.count("SELECT count(*) FROM observations.country_outline_versions").await, 2, "the first version stays while folds name it");

    for extra in &extras {
        harness.set_status(extra.upload_id, "withdrawn").await;
        assert!(matches!(harness.store.subtract_due(extra.upload_id).await.expect("the subtraction runs"), Done::Folded(_)));
    }
    assert_eq!(harness.digest().await.without(&DATES_AND_BITS), before);
}

const OUR_CONFIRMED_CELL: &str = "
    WITH region AS (
      INSERT INTO public.regions (name, code, country_code, iso_code) VALUES ('Engine test region', 'ZZT', 'PL', 'PL-ZZT') RETURNING id
    ),
    location AS (INSERT INTO public.locations (region_id, city, longitude, latitude) SELECT id, 'engine-test', 21.0, 52.0 FROM region RETURNING id),
    band AS (INSERT INTO public.bands (rat, name, value) VALUES ('LTE', 'engine-test', 0) RETURNING id),
    station AS (
      INSERT INTO public.stations (station_id, location_id, is_confirmed, status)
      SELECT 'engine-test', id, true, 'published' FROM location RETURNING id
    ),
    cell AS (INSERT INTO public.cells (station_id, band_id, rat) SELECT station.id, band.id, 'LTE' FROM station, band RETURNING id),
    lte AS (INSERT INTO public.lte_cells (cell_id, enbid, clid, tac, pci, earfcn) SELECT cell.id, 123456, 11, 7395, 304, 1300 FROM cell)
    INSERT INTO observations.cell_matches (observed_cell_id, kind, network_match, cell_id)
    SELECT c.id, 'cell', 'own', cell.id FROM observations.observed_cells c, cell WHERE c.cell_key = 31604747";

const WITHOUT_OUR_CELL: &str = "
    DELETE FROM public.stations WHERE station_id = 'engine-test';
    DELETE FROM public.locations WHERE city = 'engine-test';
    DELETE FROM public.bands WHERE name = 'engine-test';";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn how_values_differed_from_our_station_stays_with_the_upload_after_a_subtraction() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.store_and_fold(&[fixture_upload("appendix-a.json", 800)], "qualcomm").await;
    harness.execute(OUR_CONFIRMED_CELL).await;
    let compared = fixture_upload("appendix-a.json", 801);
    let folded = add(&harness, &compared, "qualcomm").await;
    let patterns = format!("SELECT count(*) FROM observations.upload_value_patterns WHERE upload_id = '{}'", compared.upload_id);
    let written = harness.count(&patterns).await;
    let swapped =
        harness.count(&format!("{patterns} AND field = 'areaCode' AND pattern = 'bytesSwapped' AND value_count = 1 AND cell_count = 1")).await;

    harness.set_status(compared.upload_id, "withdrawn").await;
    let subtracted = matches!(harness.store.subtract_due(compared.upload_id).await.expect("the subtraction runs"), Done::Folded(_));
    let kept = harness.count(&patterns).await;
    harness.execute(WITHOUT_OUR_CELL).await;

    assert!(folded && subtracted);
    assert_eq!(written, 4, "the TAC and the PCI differed, each counted by its pattern and as the constant read");
    assert_eq!(swapped, 1, "our TAC 0x1CE3 was read as 0xE31C");
    assert_eq!(kept, written, "a subtraction neither reads nor removes them");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_exclusion_whose_file_is_gone_rebuilds_the_cells_it_touched() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let base = corpus(24, 4, 14);
    let excluded = fixture_upload("appendix-a.json", 400);

    harness.store_and_fold(&base, "samsung").await;
    let without_it = harness.digest().await.cell_tables();

    harness.reset().await;
    harness.store_and_fold(&base, "samsung").await;
    assert!(add(&harness, &excluded, "samsung").await);
    assert_ne!(harness.digest().await.cell_tables(), without_it);

    harness.delete_raw_file(excluded.upload_id).await;
    harness.set_status(excluded.upload_id, "excluded").await;
    assert!(matches!(harness.store.subtract_due(excluded.upload_id).await.expect("the subtraction runs"), Done::FileGone));
    assert_eq!(harness.count("SELECT count(*) FROM observations.engine_runs WHERE kind = 'rebuild' AND started_at IS NULL").await, 1);

    assert!(matches!(harness.store.rebuild(excluded.upload_id).await.expect("the rebuild runs"), Done::Rebuilt { .. }));
    assert!(unfolded(&harness, &excluded).await);
    assert_eq!(harness.digest().await.cell_tables(), without_it, "the cells hold what the uploads still kept give them");
}

const MATCHER_HOLDS_EVERY_CELL: &str = "SELECT id FROM observations.observed_cells ORDER BY id FOR NO KEY UPDATE";
const MATCHER_MARKS_EVERY_SITE: &str =
    "INSERT INTO observations.dirty_sites (observed_site_id) SELECT id FROM observations.observed_sites ORDER BY id ON CONFLICT DO NOTHING";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_rebuild_takes_its_cells_before_it_marks_their_sites_dirty() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.store_and_fold(&corpus(24, 4, 15), "samsung").await;
    let excluded = fixture_upload("appendix-a.json", 402);
    assert!(add(&harness, &excluded, "samsung").await);
    harness.set_status(excluded.upload_id, "excluded").await;
    harness.execute("DELETE FROM observations.dirty_sites").await;

    let mut matcher = harness.store.database.pool.get().await.expect("a connection");
    let matching = matcher.transaction().await.expect("a transaction");
    matching.batch_execute("SET LOCAL lock_timeout = '100ms'").await.expect("a lock timeout");
    matching.execute(MATCHER_HOLDS_EVERY_CELL, &[]).await.expect("the matcher holds the cells");

    let (store, upload_id) = (harness.store.clone(), excluded.upload_id);
    let rebuilding = tokio::spawn(async move { store.rebuild(upload_id).await });
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(!rebuilding.is_finished(), "the rebuild waits for the cells the matcher holds");

    matching.execute(MATCHER_MARKS_EVERY_SITE, &[]).await.expect("the matcher marks the sites without waiting for the rebuild");
    matching.commit().await.expect("the matcher commits");
    assert!(matches!(rebuilding.await.expect("the rebuild finishes").expect("the rebuild runs"), Done::Rebuilt { .. }));
}
