use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use engine_store::StoreError;
use engine_store::pipeline::{Finish, Outcome, Store, new_square_total};
use engine_store::queue::{self, Claim, Claimed, PROCESSING_FAILED};

use crate::backoff::Backoff;
use crate::shutdown::Shutdown;
use crate::wake::Wake;

const LOOK_EVERY: Duration = Duration::from_secs(30);
const RETRY_IN_PLACE_FOR: Duration = Duration::from_secs(8 * 60);

pub async fn fold_worker(store: Arc<Store>, wake: Arc<Wake>, shutdown: Shutdown) {
    let mut backoff = Backoff::default();
    while !shutdown.is_stopping() {
        let notified = wake.uploads.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        match fold_next(&store, &shutdown).await {
            Ok(true) => backoff.reset(),
            Ok(false) => {
                backoff.reset();
                tokio::select! {
                    () = notified.as_mut() => {}
                    () = shutdown.sleep(LOOK_EVERY) => {}
                }
            }
            Err(error) => {
                tracing::warn!(error = %error, "no upload could be claimed");
                shutdown.sleep(backoff.next()).await;
            }
        }
    }
}

async fn fold_next(store: &Store, shutdown: &Shutdown) -> Result<bool, StoreError> {
    let claimed = {
        let mut client = store.database.pool.get().await?;
        queue::claim_upload(&mut client).await?
    };
    match claimed {
        Claimed::Nothing => Ok(false),
        Claimed::GaveUp { upload_id } => {
            tracing::warn!(upload_id = %upload_id, outcome = "rejected", reason = PROCESSING_FAILED, "an upload failed five times");
            Ok(true)
        }
        Claimed::Upload(claim) => {
            fold_claimed(store, &claim, shutdown).await;
            Ok(true)
        }
    }
}

async fn fold_claimed(store: &Store, claim: &Claim, shutdown: &Shutdown) {
    let upload_id = claim.upload.id;
    let started = Instant::now();
    let mut backoff = Backoff::default();
    let result = loop {
        match store.fold_upload(&claim.upload, Finish::Commit(claim)).await {
            Err(error) if error.is_transient() && started.elapsed() < RETRY_IN_PLACE_FOR && !shutdown.is_stopping() => {
                tracing::warn!(upload_id = %upload_id, error = %error, "folding failed for now; trying again");
                shutdown.sleep(backoff.next()).await;
            }
            result => break result,
        }
    };
    let millis = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    match result {
        Ok(Outcome::Processed(folded)) => tracing::info!(
            upload_id = %upload_id,
            outcome = "processed",
            attempt = claim.attempts,
            snapshots = folded.report.snapshot_count,
            samples = folded.report.sample_count,
            kept = folded.report.kept_samples(),
            drops = %serde_json::json!(folded.report.drops.iter().map(|(reason, count)| (reason.as_str(), count)).collect::<BTreeMap<_, _>>()),
            cells = folded.touched.cells.len(),
            new_squares = new_square_total(&folded.touched.new_squares),
            millis,
            "folded an upload"
        ),
        Ok(Outcome::Rejected { reason, detail }) => {
            tracing::info!(upload_id = %upload_id, outcome = "rejected", reason, detail = %detail, millis, "rejected an upload");
        }
        Ok(Outcome::Lost) => {
            tracing::info!(upload_id = %upload_id, outcome = "lost", millis, "the upload was withdrawn, excluded or claimed again while it was folded; nothing was written");
        }
        Err(error) => {
            tracing::warn!(upload_id = %upload_id, outcome = "failed", attempt = claim.attempts, error = %error, millis, "folding failed");
            if let Err(release_error) = release(store, claim, &error.to_string()).await {
                tracing::warn!(upload_id = %upload_id, error = %release_error, "the failed upload could not be released; its claim times out instead");
            }
        }
    }
}

async fn release(store: &Store, claim: &Claim, error: &str) -> Result<(), StoreError> {
    let client = store.database.pool.get().await?;
    queue::release(&**client, claim, error).await
}
