use std::sync::Arc;
use std::time::{Duration, Instant};

use engine_store::StoreError;
use engine_store::nightly::{self, calibrate, evaluate};
use engine_store::pipeline::Store;
use engine_store::runs::{self, Done, Due, Run};
use serde_json::json;
use uuid::Uuid;

use crate::backoff::Backoff;
use crate::shutdown::Shutdown;
use crate::wake::Wake;

const LOOK_EVERY: Duration = Duration::from_secs(30);
const PROGRESS_EVERY: Duration = Duration::from_secs(3);

pub async fn run_worker(store: Arc<Store>, wake: Arc<Wake>, shutdown: Shutdown) {
    let mut backoff = Backoff::default();
    while !shutdown.is_stopping() {
        let notified = wake.runs.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        match work_once(&store, &shutdown).await {
            Ok(true) => backoff.reset(),
            Ok(false) => {
                backoff.reset();
                tokio::select! {
                    () = notified.as_mut() => {}
                    () = shutdown.sleep(LOOK_EVERY) => {}
                }
            }
            Err(error) => {
                tracing::warn!(error = %error, "no engine run could be taken");
                shutdown.sleep(backoff.next()).await;
            }
        }
    }
}

async fn work_once(store: &Store, shutdown: &Shutdown) -> Result<bool, StoreError> {
    let claimed = {
        let client = store.database.pool.get().await?;
        runs::claim_run(&**client).await?
    };
    if let Some(run) = claimed {
        execute(store, &run, shutdown).await?;
        return Ok(true);
    }
    let mut progress = Progress::without_run();
    let subtracted = drain(store, Due::Subtraction, &mut progress, shutdown).await?;
    let restored = drain(store, Due::Restore, &mut progress, shutdown).await?;
    Ok(subtracted + restored > 0)
}

struct Progress {
    run_id: Option<Uuid>,
    total: Option<usize>,
    done: usize,
    failed: Vec<String>,
    written_at: Instant,
}

impl Progress {
    fn without_run() -> Self {
        Self {
            run_id: None,
            total: None,
            done: 0,
            failed: Vec::new(),
            written_at: Instant::now(),
        }
    }

    fn of(run: &Run) -> Self {
        Self {
            run_id: Some(run.id),
            ..Self::without_run()
        }
    }

    async fn note(&mut self, store: &Store, upload_id: Uuid, result: &Result<Done, StoreError>) {
        match result {
            Ok(Done::NotDue) => {}
            Ok(_) => self.done += 1,
            Err(error) => {
                tracing::warn!(upload_id = %upload_id, error = %error, "an engine run step failed");
                self.failed.push(format!("{upload_id}: {error}"));
            }
        }
        if self.written_at.elapsed() >= PROGRESS_EVERY {
            self.write(store).await;
        }
    }

    async fn write(&mut self, store: &Store) {
        self.written_at = Instant::now();
        let Some(run_id) = self.run_id else {
            return;
        };
        let progress = json!({ "done": self.done, "total": self.total, "failed": self.failed.len() });
        let written = async {
            let client = store.database.pool.get().await?;
            runs::report_progress(&**client, run_id, &progress).await
        };
        if let Err(error) = written.await {
            tracing::warn!(run_id = %run_id, error = %error, "the run's progress could not be written");
        }
    }
}

async fn drain(store: &Store, due: Due, progress: &mut Progress, shutdown: &Shutdown) -> Result<usize, StoreError> {
    let mut skipped: Vec<Uuid> = Vec::new();
    let done_before = progress.done;
    while !shutdown.is_stopping() {
        let Some(upload_id) = store.next_due(due, &skipped).await? else {
            break;
        };
        let started = Instant::now();
        let result = match due {
            Due::Subtraction => store.subtract_due(upload_id).await,
            Due::Restore => store.restore_due(upload_id).await,
        };
        log_step(due_name(due), upload_id, &result, started);
        if !matches!(result, Ok(Done::Folded(_))) {
            skipped.push(upload_id);
        }
        progress.note(store, upload_id, &result).await;
    }
    Ok(progress.done - done_before)
}

fn due_name(due: Due) -> &'static str {
    match due {
        Due::Subtraction => "subtracted",
        Due::Restore => "restored",
    }
}

fn log_step(action: &str, upload_id: Uuid, result: &Result<Done, StoreError>, started: Instant) {
    let millis = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    match result {
        Ok(Done::Folded(folded)) => tracing::info!(
            upload_id = %upload_id,
            outcome = action,
            samples = folded.report.sample_count,
            kept = folded.report.kept_samples(),
            cells = folded.touched.cells.len(),
            removed_cells = folded.touched.removed_cells.len(),
            millis,
            "an upload was {action}"
        ),
        Ok(Done::Rebuilt { cells, uploads }) => {
            tracing::info!(upload_id = %upload_id, outcome = action, cells, uploads, millis, "cells were rebuilt")
        }
        Ok(Done::Rejected) => {
            tracing::info!(upload_id = %upload_id, outcome = "rejected", millis, "every sample was dropped, so the upload is rejected")
        }
        Ok(Done::FileGone) => tracing::warn!(upload_id = %upload_id, outcome = "fileGone", millis, "the raw file is gone; nothing could be {action}"),
        Ok(Done::NotDue) | Err(_) => {}
    }
}

async fn execute(store: &Store, run: &Run, shutdown: &Shutdown) -> Result<(), StoreError> {
    let started = Instant::now();
    tracing::info!(run_id = %run.id, kind = %run.kind, "an engine run started");
    let mut progress = Progress::of(run);
    let outcome = match run.kind.as_str() {
        "subtract" => drain(store, Due::Subtraction, &mut progress, shutdown).await.map(|_| ()),
        "restore" => drain(store, Due::Restore, &mut progress, shutdown).await.map(|_| ()),
        "refold" => refold(store, run, &mut progress, shutdown).await,
        "rebuild" => rebuild(store, run, &mut progress).await,
        "rebuildTrails" => rebuild_trails(store, run, &mut progress).await,
        "rebuildReadModels" => store.rebuild_read_models().await.map(|cells| progress.done = cells as usize),
        "recalibrate" => calibrate::recalibrate(&store.database).await.map(|_| progress.done = 1),
        "evaluate" => {
            let with_gnb_lengths = run.params.get("gnbLengths").and_then(serde_json::Value::as_bool).unwrap_or(false);
            evaluate::evaluate(&store.database, with_gnb_lengths).await.map(|_| progress.done = 1)
        }
        "reestimate" => reestimate(store).await.map(|sites| progress.done = sites),
        other => Err(StoreError::data(format!("this engine does not run {other} yet"))),
    };
    progress.write(store).await;

    let error = match (&outcome, progress.failed.is_empty()) {
        (Err(error), _) => Some(error.to_string()),
        (Ok(()), false) => Some(progress.failed.join("\n")),
        (Ok(()), true) => None,
    };
    let refold_cut_short = shutdown.is_stopping() && run.kind == "refold";
    let status = match (&error, refold_cut_short) {
        (Some(_), _) => "failed",
        (None, true) => "cancelled",
        (None, false) => "done",
    };
    let client = store.database.pool.get().await?;
    runs::finish_run(&**client, run.id, status, error.as_deref()).await?;
    let millis = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    tracing::info!(run_id = %run.id, kind = %run.kind, outcome = status, done = progress.done, failed = progress.failed.len(), millis, "an engine run finished");
    Ok(())
}

async fn refold(store: &Store, run: &Run, progress: &mut Progress, shutdown: &Shutdown) -> Result<(), StoreError> {
    let uploads = store.refold_candidates(&run.params).await?;
    progress.total = Some(uploads.len());
    for upload_id in uploads {
        if shutdown.is_stopping() {
            break;
        }
        let started = Instant::now();
        let result = store.refold(upload_id).await;
        log_step("refolded", upload_id, &result, started);
        progress.note(store, upload_id, &result).await;
    }
    Ok(())
}

async fn rebuild(store: &Store, run: &Run, progress: &mut Progress) -> Result<(), StoreError> {
    let upload_id = run
        .params
        .get("uploadId")
        .and_then(serde_json::Value::as_str)
        .and_then(|id| Uuid::parse_str(id).ok())
        .ok_or_else(|| StoreError::data("a rebuild names its upload in uploadId"))?;
    progress.total = Some(1);
    let started = Instant::now();
    let result = store.rebuild(upload_id).await;
    log_step("rebuilt", upload_id, &result, started);
    progress.note(store, upload_id, &result).await;
    Ok(())
}

async fn reestimate(store: &Store) -> Result<usize, StoreError> {
    let client = store.database.pool.get().await?;
    Ok(nightly::mark_every_site_dirty(&**client).await? as usize)
}

async fn rebuild_trails(store: &Store, run: &Run, progress: &mut Progress) -> Result<(), StoreError> {
    let bound = |name: &str| {
        run.params
            .get(name)
            .and_then(serde_json::Value::as_f64)
            .ok_or_else(|| StoreError::data(format!("rebuildTrails names its area with {name}")))
    };
    let tiles = store
        .rebuild_trails_in(bound("west")?, bound("south")?, bound("east")?, bound("north")?)
        .await?;
    progress.done = tiles;
    Ok(())
}
