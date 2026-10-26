mod common;

use common::{DATES_AND_BITS, Harness, corpus, fixture_upload};
use engine_store::nightly::calibrate::recalibrate;
use engine_store::nightly::evaluate::evaluate;
use engine_store::pipeline::Outcome;
use engine_store::runs::Done;

async fn fold_corpus(harness: &Harness, seed: u64) {
    let uploads = corpus(24, 4, seed);
    harness.seed_phones(&uploads, "qualcomm").await;
    for upload in &uploads {
        harness.store_upload(upload).await;
    }
    harness.fold_all(&uploads).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_model_given_its_own_group_after_a_fold_still_subtracts_exactly() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    fold_corpus(&harness, 21).await;
    let before = harness.digest().await.without(&DATES_AND_BITS);

    let extra = fixture_upload("appendix-a.json", 500);
    harness.seed_phone(extra.device_id, "qualcomm").await;
    harness.store_upload(&extra).await;
    assert!(matches!(harness.fold(extra.upload_id).await, Outcome::Processed(_)));
    harness
        .execute(&format!(
            "INSERT INTO observations.ta_groups (source, device_model_id)
             SELECT g.source, d.model_id FROM observations.upload_ta_groups u
             JOIN observations.ta_groups g ON g.id = u.ta_group_id
             JOIN observations.devices d ON d.id = '{}'
             WHERE u.upload_id = '{}'",
            extra.device_id, extra.upload_id
        ))
        .await;

    harness.set_status(extra.upload_id, "withdrawn").await;
    assert!(matches!(harness.store.subtract_due(extra.upload_id).await.expect("the subtraction runs"), Done::Folded(_)));
    assert_eq!(harness.digest().await.without(&DATES_AND_BITS), before, "the subtraction used the group its fold recorded");

    let mut later = fixture_upload("appendix-a.json", 501);
    later.device_id = extra.device_id;
    later.document["deviceId"] = extra.device_id.hyphenated().to_string().into();
    harness.store_upload(&later).await;
    assert!(matches!(harness.fold(later.upload_id).await, Outcome::Processed(_)));
    let query = format!(
        "SELECT count(*) FROM observations.upload_ta_groups u JOIN observations.ta_groups g ON g.id = u.ta_group_id
         WHERE u.upload_id = '{}' AND g.device_model_id IS NOT NULL",
        later.upload_id
    );
    assert!(harness.count(&query).await > 0, "a new upload of the model folds into its own group");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn one_nightly_run_writes_its_reports_on_the_corpus() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    fold_corpus(&harness, 22).await;
    let client = harness.store.database.pool.get().await.expect("a connection");
    let ids: Vec<i32> = client
        .query("SELECT id FROM observations.observed_sites WHERE retired_at IS NULL ORDER BY id", &[])
        .await
        .expect("the sites")
        .iter()
        .map(|row| row.get(0))
        .collect();
    drop(client);
    harness.store.estimate_sites(&ids).await.expect("the sites are estimated");

    let first = recalibrate(&harness.store.database).await.expect("a calibration runs");
    let second = recalibrate(&harness.store.database).await.expect("a second calibration runs");
    let halves =
        harness.count(&format!("SELECT count(DISTINCT station_half) FROM observations.calibration_runs WHERE id IN ({first}, {second})")).await;
    assert_eq!(halves, 2, "the even and odd halves swap every night");

    let run_id = evaluate(&harness.store.database, true).await.expect("an evaluation runs");
    let count = |table: &str| format!("SELECT count(*) FROM observations.{table} WHERE evaluation_run_id = {run_id}");
    assert!(harness.count(&count("reader_scores")).await > 0, "every reader version of the corpus is scored");
    assert!(
        harness.count("SELECT count(*) FROM observations.device_scores WHERE scored_on = current_date").await > 0,
        "every device with uploads is scored"
    );
    eprintln!(
        "evaluation results {}, gNB length tests {}",
        harness.count(&count("evaluation_results")).await,
        harness.count(&count("gnb_length_tests")).await
    );
}
