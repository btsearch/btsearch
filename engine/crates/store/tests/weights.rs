mod common;

use common::{DATES_AND_BITS, Harness, corpus};
use engine_corpus::GeneratedUpload;
use engine_store::runs::Done;
use uuid::Uuid;

const VOUCH_FOR_EVERYONE: &str = "INSERT INTO observations.vouches (user_id, weight, reason) SELECT user_id, 1.5, 'engine test' FROM observations.contributors";

async fn weight_of(harness: &Harness, device_id: Uuid) -> (f32, String) {
    let client = harness.store.database.pool.get().await.expect("a connection");
    let row = client
        .query_one("SELECT weight, basis FROM observations.device_weights_now WHERE device_id = $1", &[&device_id])
        .await
        .expect("the device's weight");
    (row.get(0), row.get(1))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_admins_device_weight_wins_over_the_vouch_which_wins_over_the_tier_times_the_score() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let device_id = Uuid::from_u128(0x0b75_0010);
    harness.seed_phone(device_id, "qualcomm").await;
    assert_eq!(weight_of(&harness, device_id).await, (0.1, "computed".to_string()), "a phone without attestation weighs 0.1");

    let client = harness.store.database.pool.get().await.expect("a connection");
    client
        .execute(
            "INSERT INTO observations.device_scores (device_id, scored_on, readings, ta_on_confirmed, ta_within_tolerance, dropped_implausible, mock_readings, phantom_cells, factor)
             VALUES ($1, current_date - 1, 10, 0, 0, 0, 0, 0, 1.2), ($1, current_date, 10, 0, 0, 0, 0, 0, 0.2)",
            &[&device_id],
        )
        .await
        .expect("two scores");
    assert_eq!(weight_of(&harness, device_id).await, (0.05, "computed".to_string()), "the latest score counts, and the weight stays above 0.05");

    client
        .execute(
            "INSERT INTO observations.vouches (user_id, weight, reason) SELECT user_id, 1.5, 'known to us' FROM observations.devices WHERE id = $1",
            &[&device_id],
        )
        .await
        .expect("a vouch");
    assert_eq!(weight_of(&harness, device_id).await, (1.5, "vouch".to_string()));

    harness.execute("UPDATE observations.vouches SET vouched_at = now() - interval '2 days', until = now() - interval '1 day'").await;
    assert_eq!(weight_of(&harness, device_id).await, (0.05, "computed".to_string()), "an ended vouch counts no more");
    harness.execute("UPDATE observations.vouches SET until = NULL").await;

    client
        .execute("INSERT INTO observations.device_weights (device_id, weight, reason) VALUES ($1, 0.3, 'a test phone')", &[&device_id])
        .await
        .expect("a device weight");
    assert_eq!(weight_of(&harness, device_id).await, (0.3, "device".to_string()));
}

async fn store_and_fold(harness: &Harness, uploads: &[GeneratedUpload], vouched: bool, left_out: Option<Uuid>) {
    harness.seed_phones(uploads, "qualcomm").await;
    if vouched {
        harness.execute(VOUCH_FOR_EVERYONE).await;
    }
    let folded: Vec<&GeneratedUpload> = uploads.iter().filter(|upload| Some(upload.upload_id) != left_out).collect();
    for upload in &folded {
        harness.store_upload(upload).await;
    }
    for upload in &folded {
        harness.fold(upload.upload_id).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_vouch_refolded_gives_what_folding_with_it_gives_and_a_withdrawal_still_subtracts_exactly() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let uploads = corpus(12, 3, 51);
    let without_dates_bits_and_new_squares: Vec<&str> = DATES_AND_BITS.iter().copied().chain(["new_squares"]).collect();

    store_and_fold(&harness, &uploads, false, None).await;
    harness.execute(VOUCH_FOR_EVERYONE).await;
    for upload in &uploads {
        let done = harness.store.refold(upload.upload_id).await.expect("the refold runs");
        assert_eq!(matches!(done, Done::Folded(_)), harness.status(upload.upload_id).await.0 == "processed");
    }
    assert_eq!(harness.count("SELECT count(*) FROM observations.upload_folds WHERE weight_milli <> 1500").await, 0, "every refold weighs with the vouch");
    let refolded = harness.digest().await.without(&["new_squares"]);

    let mut withdrawn = None;
    for upload in &uploads {
        if harness.status(upload.upload_id).await.0 == "processed" {
            withdrawn = Some(upload.upload_id);
            break;
        }
    }
    let withdrawn = withdrawn.expect("the corpus has a processed upload");
    harness.set_status(withdrawn, "withdrawn").await;
    assert!(matches!(harness.store.subtract_due(withdrawn).await.expect("the subtraction runs"), Done::Folded(_)));
    let after_withdrawal = harness.digest().await.without(&without_dates_bits_and_new_squares);

    harness.reset().await;
    store_and_fold(&harness, &uploads, true, None).await;
    assert_eq!(harness.digest().await.without(&["new_squares"]), refolded);

    harness.reset().await;
    store_and_fold(&harness, &uploads, true, Some(withdrawn)).await;
    assert_eq!(harness.digest().await.without(&without_dates_bits_and_new_squares), after_withdrawal);
}
