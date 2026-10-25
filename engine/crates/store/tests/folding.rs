mod common;

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use common::{Harness, corpus, fixture_upload, fold};
use engine_corpus::GeneratedUpload;
use engine_store::pipeline::{Finish, Outcome};
use engine_store::queue::{self, Claimed};
use serde_json::json;
use uuid::Uuid;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_upload_is_folded_once_with_its_own_rows() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let upload = fixture_upload("appendix-a.json", 1);
    harness.seed_phone(upload.device_id, "samsung").await;
    harness.store_upload(&upload).await;

    let Outcome::Processed(folded) = harness.fold(upload.upload_id).await else {
        panic!("Appendix A's upload is folded");
    };
    assert_eq!(harness.status(upload.upload_id).await, ("processed".to_owned(), None));
    assert!(folded.report.kept_samples() > 0);
    let id = upload.upload_id;
    assert_eq!(harness.count(&format!("SELECT count(*) FROM observations.upload_folds WHERE upload_id = '{id}'")).await, 1);
    assert_eq!(harness.count(&format!("SELECT count(*) FROM observations.upload_ta_groups WHERE upload_id = '{id}'")).await, 1);
    assert_eq!(harness.count("SELECT count(*) FROM observations.cell_values WHERE held").await, 2, "the Samsung modem's serving PCI and channel are held");
    assert_eq!(harness.count(&format!("SELECT sum(held_count) FROM observations.upload_blocked_values WHERE upload_id = '{id}'")).await, 6);
    assert_eq!(harness.count("SELECT count(*) FROM observations.observed_sites WHERE node_id = 123456").await, 1, "eNB 123456 is a site at once");
    assert_eq!(harness.count("SELECT count(*) FROM observations.match_queue").await, 1);
    assert_eq!(harness.count("SELECT count(*) FROM observations.dirty_sites").await, 1);
    assert_eq!(harness.count("SELECT count(*) FROM observations.observed_cell_summaries").await, 1);

    let mut client = harness.store.database.pool.get().await.expect("a connection");
    assert!(matches!(queue::claim_upload(&mut client).await.expect("the queue reads"), Claimed::Nothing), "a processed upload is not claimed again");
}

const QUEUED_SERVING_CELL: &str = "SELECT count(*) FROM observations.match_queue q
     JOIN observations.observed_cells c ON c.id = q.observed_cell_id
     WHERE c.cell_key = 31604747";

fn from_the_same_phone(first: &GeneratedUpload, seed: u64) -> GeneratedUpload {
    let mut upload = fixture_upload("appendix-a.json", seed);
    upload.device_id = first.device_id;
    upload.document["deviceId"] = first.device_id.hyphenated().to_string().into();
    upload
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_second_person_seeing_a_value_of_a_cell_queues_it_and_the_first_persons_second_reading_does_not() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let first = fixture_upload("appendix-a.json", 700);
    harness.store_and_fold(std::slice::from_ref(&first), "qualcomm").await;
    harness.execute("DELETE FROM observations.match_queue").await;

    let again = from_the_same_phone(&first, 701);
    harness.store_upload(&again).await;
    assert!(matches!(harness.fold(again.upload_id).await, Outcome::Processed(_)));
    assert_eq!(harness.count(QUEUED_SERVING_CELL).await, 0, "the same person saw the cell's values again");

    let other = fixture_upload("appendix-a.json", 702);
    harness.store_and_fold(std::slice::from_ref(&other), "qualcomm").await;
    assert_eq!(harness.count(QUEUED_SERVING_CELL).await, 1, "a second person saw them");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_value_new_to_a_cell_queues_it_even_from_the_same_person() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let first = fixture_upload("appendix-a.json", 703);
    harness.store_and_fold(std::slice::from_ref(&first), "qualcomm").await;
    harness.execute("DELETE FROM observations.match_queue").await;

    let mut replanned = from_the_same_phone(&first, 704);
    replanned.document["cells"][0]["pci"] = 302.into();
    harness.store_upload(&replanned).await;
    assert!(matches!(harness.fold(replanned.upload_id).await, Outcome::Processed(_)));
    assert_eq!(harness.count(QUEUED_SERVING_CELL).await, 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_second_person_reading_only_the_networks_of_a_cell_queues_it() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let mut first = fixture_upload("appendix-a.json", 710);
    first.document["cells"][0]["additionalPlmns"] = json!(["26003"]);
    harness.store_and_fold(std::slice::from_ref(&first), "qualcomm").await;
    assert_eq!(harness.count("SELECT count(*) FROM observations.cell_networks").await, 2, "its own network and the one it lists");
    harness.execute("DELETE FROM observations.match_queue").await;

    let mut other = fixture_upload("appendix-a.json", 712);
    other.document["cells"][0] = json!({ "rat": "lte", "plmn": "26006", "eci": 31_604_747, "additionalPlmns": ["26003"] });
    harness.store_and_fold(std::slice::from_ref(&other), "qualcomm").await;
    assert_eq!(harness.count("SELECT count(*) FROM observations.cell_values WHERE sample_count > 1").await, 0, "the second reading had no values");
    assert_eq!(harness.count(QUEUED_SERVING_CELL).await, 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn uploads_that_cannot_be_used_are_rejected_with_their_reason() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let minimal = fixture_upload("minimal.json", 2);
    let missing = fixture_upload("appendix-a.json", 3);
    let tampered = fixture_upload("appendix-a.json", 4);
    for upload in [&minimal, &missing, &tampered] {
        harness.seed_phone(upload.device_id, "qualcomm").await;
        harness.store_upload(upload).await;
    }
    harness.delete_raw_file(missing.upload_id).await;
    harness.execute(&format!("UPDATE observations.uploads SET body_bytes = body_bytes + 1 WHERE id = '{}'", tampered.upload_id)).await;

    for (upload, reason) in [(&minimal, "noSamples"), (&missing, "fileMissing"), (&tampered, "bodyMismatch")] {
        assert!(matches!(harness.fold(upload.upload_id).await, Outcome::Rejected { .. }));
        assert_eq!(harness.status(upload.upload_id).await, ("rejected".to_owned(), Some(reason.to_owned())));
    }
    assert_eq!(harness.count("SELECT count(*) FROM observations.upload_folds").await, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_withdrawal_during_a_fold_never_waits_and_the_fold_writes_nothing() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let upload = fixture_upload("appendix-a.json", 5);
    harness.seed_phone(upload.device_id, "samsung").await;
    harness.store_upload(&upload).await;
    let site_id = harness.count("WITH site AS (INSERT INTO observations.observed_sites (plmn, rat, node_id) VALUES ('26006', 'LTE', 123456) RETURNING id) SELECT id::bigint FROM site").await;

    let mut blocker = harness.store.database.pool.get().await.expect("a connection");
    let held = blocker.transaction().await.expect("a transaction");
    held.execute("INSERT INTO observations.dirty_sites (observed_site_id) VALUES ($1)", &[&i32::try_from(site_id).expect("a site id")]).await.expect("the site is held");

    let claim = harness.claim(upload.upload_id).await;
    let store = harness.store.clone();
    let folding = tokio::spawn(async move { store.fold_upload(&claim.upload, Finish::Commit(&claim)).await });
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(!folding.is_finished(), "the fold waits on the held site, after its digest writes");

    let mut withdrawing = harness.store.database.pool.get().await.expect("a connection");
    let withdrawal = withdrawing.transaction().await.expect("a transaction");
    withdrawal.batch_execute("SET LOCAL lock_timeout = '100ms'").await.expect("a lock timeout");
    let withdrawn = withdrawal
        .execute("UPDATE observations.uploads SET status = 'withdrawn', status_changed_at = now() WHERE id = $1", &[&upload.upload_id])
        .await
        .expect("the withdrawal does not wait for the fold");
    assert_eq!(withdrawn, 1);
    withdrawal.commit().await.expect("the withdrawal commits");

    held.rollback().await.expect("the site is let go");
    let outcome = folding.await.expect("the fold finishes").expect("the fold runs");
    assert!(matches!(outcome, Outcome::Lost));
    assert_eq!(harness.status(upload.upload_id).await.0, "withdrawn");
    assert_eq!(harness.count("SELECT count(*) FROM observations.observed_cells").await, 0);
    assert_eq!(harness.count("SELECT count(*) FROM observations.upload_folds").await, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_claim_taken_over_after_ten_minutes_rolls_the_first_fold_back() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let upload = fixture_upload("appendix-a.json", 6);
    harness.seed_phone(upload.device_id, "samsung").await;
    harness.store_upload(&upload).await;

    let first = harness.claim(upload.upload_id).await;
    harness.execute(&format!("UPDATE observations.uploads SET claimed_at = now() - interval '11 minutes' WHERE id = '{}'", upload.upload_id)).await;
    let second = {
        let mut client = harness.store.database.pool.get().await.expect("a connection");
        let Claimed::Upload(second) = queue::claim_upload(&mut client).await.expect("the queue reads") else {
            panic!("a claim older than ten minutes is taken over");
        };
        second
    };
    assert_eq!(second.attempts, 2);

    assert!(matches!(harness.store.fold_upload(&first.upload, Finish::Commit(&first)).await.expect("the first fold runs"), Outcome::Lost));
    assert_eq!(harness.count("SELECT count(*) FROM observations.upload_folds").await, 0);
    assert!(matches!(harness.store.fold_upload(&second.upload, Finish::Commit(&second)).await.expect("the second fold runs"), Outcome::Processed(_)));
    assert_eq!(harness.count("SELECT count(*) FROM observations.upload_folds").await, 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_upload_that_failed_five_times_is_rejected() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let upload = fixture_upload("appendix-a.json", 7);
    harness.seed_phone(upload.device_id, "samsung").await;
    harness.store_upload(&upload).await;
    harness.execute(&format!("UPDATE observations.uploads SET attempts = 5, last_error = 'the fold stopped' WHERE id = '{}'", upload.upload_id)).await;

    let mut client = harness.store.database.pool.get().await.expect("a connection");
    assert!(matches!(queue::claim_upload(&mut client).await.expect("the queue reads"), Claimed::GaveUp { upload_id } if upload_id == upload.upload_id));
    assert_eq!(harness.status(upload.upload_id).await, ("rejected".to_owned(), Some("processingFailed".to_owned())));
}

async fn fold_in_parallel(harness: &Harness, order: Vec<Uuid>, workers: usize) {
    let queue = Arc::new(Mutex::new(VecDeque::from(order)));
    let mut tasks = Vec::new();
    for _ in 0..workers {
        let (store, queue) = (harness.store.clone(), queue.clone());
        tasks.push(tokio::spawn(async move {
            loop {
                let next = queue.lock().expect("the queue is never poisoned").pop_front();
                let Some(upload_id) = next else {
                    break;
                };
                fold(&store, upload_id).await;
            }
        }));
    }
    for task in tasks {
        task.await.expect("a worker finishes");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_workers_folding_uploads_that_share_cells_do_not_deadlock() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let uploads = corpus(40, 2, 8);
    harness.seed_phones(&uploads, "samsung").await;
    for upload in &uploads {
        harness.store_upload(upload).await;
    }
    fold_in_parallel(&harness, uploads.iter().map(|upload| upload.upload_id).collect(), 2).await;
    assert_eq!(harness.count("SELECT count(*) FROM observations.uploads WHERE status = 'processing'").await, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_fold_orders_give_one_digest() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let uploads = corpus(120, 6, 9);
    let ids: Vec<Uuid> = uploads.iter().map(|upload| upload.upload_id).collect();

    harness.seed_phones(&uploads, "samsung").await;
    for upload in &uploads {
        harness.store_upload(upload).await;
    }
    fold_in_parallel(&harness, ids.clone(), 1).await;
    let in_order = harness.digest().await.without(&["new_squares"]);

    harness.reset().await;
    harness.seed_phones(&uploads, "samsung").await;
    for upload in uploads.iter().rev() {
        harness.store_upload(upload).await;
    }
    fold_in_parallel(&harness, ids.into_iter().rev().collect(), 3).await;
    let reversed = harness.digest().await.without(&["new_squares"]);

    assert!(in_order.len() > 100, "the corpus fills the digest");
    assert_eq!(in_order, reversed);
}

const SUMMARIES_MISCOUNTING_SQUARES: &str = "SELECT count(*) FROM observations.observed_cell_summaries s
     WHERE s.square_count <> (SELECT count(*) FROM observations.cell_bins b WHERE b.observed_cell_id = s.observed_cell_id)";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_cells_summary_counts_its_squares_after_a_fold_and_after_a_rebuild() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.store_and_fold(&corpus(12, 3, 17), "qualcomm").await;
    assert!(
        harness.count("SELECT count(*) FROM observations.observed_cell_summaries WHERE square_count > 1").await > 0,
        "cells cover several squares"
    );
    assert_eq!(harness.count(SUMMARIES_MISCOUNTING_SQUARES).await, 0, "a fold counts the squares of the cells it touched");

    harness.execute("UPDATE observations.observed_cell_summaries SET square_count = 0").await;
    harness.store.rebuild_read_models().await.expect("the read models rebuild");
    assert_eq!(harness.count(SUMMARIES_MISCOUNTING_SQUARES).await, 0, "a rebuild counts them again");
}
