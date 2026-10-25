mod common;

use common::{DATES_AND_BITS, Harness, corpus, fixture_upload};
use engine_store::runs::Done;

const LAUNCH_BLOCK_OFF: &str = "UPDATE observations.reading_blocks SET disabled_at = now() WHERE modem_family = 'samsung'";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_block_switched_off_and_refolded_leaves_what_a_fold_without_it_gives() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let uploads = corpus(16, 4, 21);

    harness.execute(LAUNCH_BLOCK_OFF).await;
    harness.store_and_fold(&uploads, "samsung").await;
    let without_the_block = harness.digest().await.without(&["new_squares"]);

    harness.reset().await;
    harness.store_and_fold(&uploads, "samsung").await;
    assert!(harness.count("SELECT count(*) FROM observations.cell_values WHERE held").await > 0, "the launch block holds Samsung values");

    harness.execute(LAUNCH_BLOCK_OFF).await;
    for upload in &uploads {
        let done = harness.store.refold(upload.upload_id).await.expect("the refold runs");
        assert_eq!(matches!(done, Done::Folded(_)), harness.status(upload.upload_id).await.0 == "processed");
    }
    assert_eq!(harness.count("SELECT count(*) FROM observations.cell_values WHERE held").await, 0);
    assert_eq!(harness.count("SELECT count(*) FROM observations.upload_blocked_values").await, 0);
    assert_eq!(harness.digest().await.without(&["new_squares"]), without_the_block);

    let refolded = harness.digest().await.without(&DATES_AND_BITS);
    let extra = fixture_upload("appendix-a.json", 500);
    harness.seed_phone(extra.device_id, "samsung").await;
    harness.store_upload(&extra).await;
    harness.fold(extra.upload_id).await;
    harness.set_status(extra.upload_id, "withdrawn").await;
    assert!(matches!(harness.store.subtract_due(extra.upload_id).await.expect("the subtraction runs"), Done::Folded(_)));
    assert_eq!(harness.digest().await.without(&DATES_AND_BITS), refolded);
}

const CURRENT_PCI: &str = "SELECT count(*) FROM observations.observed_cell_values v
     JOIN observations.observed_cells c ON c.id = v.observed_cell_id
     WHERE c.cell_key = 31604747 AND v.field = 'pci'";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_held_value_counts_only_where_a_plain_one_agrees() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let from_samsung = fixture_upload("appendix-a.json", 600);
    harness.store_and_fold(std::slice::from_ref(&from_samsung), "samsung").await;
    assert_eq!(harness.count("SELECT count(*) FROM observations.cell_values WHERE held AND field = 'pci'").await, 1);
    assert_eq!(harness.count(CURRENT_PCI).await, 0, "a held PCI alone is not a value of the cell");

    let from_qualcomm = fixture_upload("appendix-a.json", 601);
    harness.store_and_fold(std::slice::from_ref(&from_qualcomm), "qualcomm").await;
    assert_eq!(harness.count(CURRENT_PCI).await, 1, "a plain PCI from another phone confirms it");
    let samples = harness
        .count("SELECT v.sample_count FROM observations.observed_cell_values v JOIN observations.observed_cells c ON c.id = v.observed_cell_id WHERE c.cell_key = 31604747 AND v.field = 'pci'")
        .await;
    assert_eq!(samples, 2, "the held sample counts once the value is confirmed");
}

const OUR_MATCHED_CELL: &str = "
    WITH band AS (INSERT INTO public.bands (rat, name, value) VALUES ('LTE', 'engine-test', 0) RETURNING id),
    station AS (INSERT INTO public.stations (station_id) VALUES ('engine-test') RETURNING id),
    cell AS (INSERT INTO public.cells (station_id, band_id, rat) SELECT station.id, band.id, 'LTE' FROM station, band RETURNING id),
    lte AS (INSERT INTO public.lte_cells (cell_id, enbid, clid, pci) SELECT cell.id, 123456, 11, $1::int FROM cell)
    INSERT INTO observations.cell_matches (observed_cell_id, kind, network_match, cell_id)
    SELECT c.id, 'cell', 'own', cell.id FROM observations.observed_cells c, cell WHERE c.cell_key = 31604747";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_held_value_counts_where_our_matched_cell_has_it() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let from_samsung = fixture_upload("appendix-a.json", 602);
    harness.store_and_fold(std::slice::from_ref(&from_samsung), "samsung").await;
    assert_eq!(harness.count(CURRENT_PCI).await, 0);

    let mut client = harness.store.database.pool.get().await.expect("a connection");
    let transaction = client.transaction().await.expect("a transaction");
    let held: i32 = transaction
        .query_one("SELECT v.value FROM observations.cell_values v JOIN observations.observed_cells c ON c.id = v.observed_cell_id WHERE c.cell_key = 31604747 AND v.field = 'pci' AND v.held", &[])
        .await
        .expect("the held PCI")
        .get(0);
    transaction.execute(OUR_MATCHED_CELL, &[&((held + 1) % 504)]).await.expect("our cell, matched");
    assert_eq!(current_pci_count(&transaction).await, 0, "our cell has another PCI");

    transaction.execute("UPDATE public.lte_cells SET pci = $1 WHERE enbid = 123456 AND clid = 11", &[&held]).await.expect("our PCI changes");
    assert_eq!(current_pci_count(&transaction).await, 1, "our cell has the held PCI");
}

async fn current_pci_count(transaction: &deadpool_postgres::Transaction<'_>) -> i64 {
    transaction.query_one(CURRENT_PCI, &[]).await.expect("the view").get(0)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_new_whole_reading_block_on_a_reader_version_refolds_the_uploads_read_with_it() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let uploads = corpus(8, 2, 23);
    harness.store_and_fold(&uploads, "qualcomm").await;

    let client = harness.store.database.pool.get().await.expect("a connection");
    let version: i16 =
        client.query_one("SELECT min(reader_version_id) FROM observations.upload_readers", &[]).await.expect("a reader version").get(0);
    let read_with_it: Vec<uuid::Uuid> = client
        .query(
            "SELECT u.id FROM observations.uploads u JOIN observations.upload_readers r ON r.upload_id = u.id
             WHERE r.reader_version_id = $1 AND u.status = 'processed' ORDER BY u.received_at, u.id",
            &[&version],
        )
        .await
        .expect("the uploads read with it")
        .iter()
        .map(|row| row.get(0))
        .collect();
    let block: i16 = client
        .query_one("INSERT INTO observations.reading_blocks (reader_version_id, mode, reason) VALUES ($1, 'drop', 'engine test') RETURNING id", &[&version])
        .await
        .expect("a whole-reading block")
        .get(0);
    drop(client);

    let candidates = harness.store.refold_candidates(&serde_json::json!({ "readingBlockId": block })).await.expect("the candidates");
    assert!(!candidates.is_empty());
    assert_eq!(candidates, read_with_it);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_refold_that_keeps_nothing_rejects_the_upload_and_takes_back_what_it_added() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let upload = fixture_upload("appendix-a.json", 603);
    harness.store_and_fold(std::slice::from_ref(&upload), "qualcomm").await;
    assert!(harness.count("SELECT count(*) FROM observations.cell_contributors").await > 0);

    harness
        .execute(
            "INSERT INTO observations.reading_blocks (reader_version_id, mode, reason)
             SELECT DISTINCT reader_version_id, 'drop'::reading_block_mode, 'engine test' FROM observations.upload_readers",
        )
        .await;
    let done = harness.store.refold(upload.upload_id).await.expect("the refold runs");

    assert!(matches!(done, Done::Rejected));
    assert_eq!(harness.status(upload.upload_id).await, ("rejected".to_owned(), Some("noSamples".to_owned())));
    assert_eq!(harness.count("SELECT count(*) FROM observations.upload_folds").await, 0);
    assert_eq!(harness.count("SELECT count(*) FROM observations.cell_contributors").await, 0);
    assert_eq!(harness.count("SELECT sum(sample_count) FROM observations.upload_drops WHERE reason = 'readingBlock'").await, 3);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_upload_whose_every_reading_is_dropped_is_rejected_with_its_drop_counts() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.execute("INSERT INTO observations.reading_blocks (modem_family, mode, reason) VALUES ('qualcomm', 'drop', 'engine test')").await;
    let upload = fixture_upload("appendix-a.json", 605);
    harness.store_and_fold(std::slice::from_ref(&upload), "qualcomm").await;

    assert_eq!(harness.status(upload.upload_id).await, ("rejected".to_owned(), Some("noSamples".to_owned())));
    assert_eq!(harness.count("SELECT count(*) FROM observations.upload_folds").await, 0);
    assert_eq!(harness.count("SELECT sum(sample_count) FROM observations.upload_drops WHERE reason = 'readingBlock'").await, 3);
}
