use std::collections::BTreeSet;
use std::sync::Arc;

use engine_fold::identity::CellIdentity;
use engine_fold::memory::Direction;
use engine_geo::Point;
use engine_geo::square::{SQUARE_ZOOM, Tile};
use serde_json::Value;
use tokio_postgres::{GenericClient, Transaction};
use uuid::Uuid;

use crate::fold_inputs::{self, rat_of_label};
use crate::pipeline::{Folded, Store, run_fold};
use crate::pyramid::tiles_covering;
use crate::queue::{self, UploadRow};
use crate::record;
use crate::{StoreError, digest};

pub struct Run {
    pub id: Uuid,
    pub kind: String,
    pub params: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Due {
    Subtraction,
    Restore,
}

impl Due {
    fn condition(self) -> &'static str {
        match self {
            Self::Subtraction => "u.status IN ('withdrawn', 'excluded') AND u.object_deleted_at IS NULL AND f.unfolded_at IS NULL",
            Self::Restore => "u.status = 'processed' AND u.object_deleted_at IS NULL AND f.unfolded_at IS NOT NULL",
        }
    }
}

const FOLDED: &str = "u.status = 'processed' AND u.object_deleted_at IS NULL AND f.unfolded_at IS NULL";
const EXCLUDED_BUT_FOLDED: &str = "u.status = 'excluded' AND f.unfolded_at IS NULL";

const LOCK_REPLAYED_CELLS: &str = "
    SELECT c.id FROM observations.observed_cells c
    WHERE c.id = ANY($1) OR c.id IN (
      SELECT to_cell_id FROM observations.handover_bins WHERE from_cell_id = ANY($1)
      UNION SELECT from_cell_id FROM observations.handover_bins WHERE to_cell_id = ANY($1)
      UNION SELECT to_cell_id FROM observations.cell_transitions WHERE from_cell_id = ANY($1)
      UNION SELECT from_cell_id FROM observations.cell_transitions WHERE to_cell_id = ANY($1)
      UNION SELECT other_observed_cell_id FROM observations.same_reading_pairs WHERE observed_cell_id = ANY($1)
      UNION SELECT observed_cell_id FROM observations.same_reading_pairs WHERE other_observed_cell_id = ANY($1)
    )
    ORDER BY c.id
    FOR UPDATE";

pub enum Done {
    Folded(Folded),
    Rejected,
    Rebuilt { cells: usize, uploads: usize },
    FileGone,
    NotDue,
}

pub async fn claim_run(client: &impl GenericClient) -> Result<Option<Run>, StoreError> {
    let row = client
        .query_opt(
            "UPDATE observations.engine_runs SET started_at = now()
             WHERE id = (SELECT id FROM observations.engine_runs WHERE started_at IS NULL ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
             RETURNING id, kind::text, params",
            &[],
        )
        .await?;
    Ok(row.map(|row| Run { id: row.get(0), kind: row.get(1), params: row.get(2) }))
}

pub async fn report_progress(client: &impl GenericClient, run_id: Uuid, progress: &Value) -> Result<(), StoreError> {
    client.execute("UPDATE observations.engine_runs SET progress = $2 WHERE id = $1", &[&run_id, progress]).await?;
    Ok(())
}

pub async fn finish_run(client: &impl GenericClient, run_id: Uuid, outcome: &str, error: Option<&str>) -> Result<(), StoreError> {
    client
        .execute(
            "UPDATE observations.engine_runs SET finished_at = now(), outcome = $2::text::engine_run_outcome, error = $3 WHERE id = $1",
            &[&run_id, &outcome, &error],
        )
        .await?;
    Ok(())
}

async fn lock_folded(transaction: &Transaction<'_>, upload_id: Uuid, condition: &str) -> Result<Option<UploadRow>, StoreError> {
    let locked = transaction
        .query_opt(
            &format!(
                "SELECT 1 FROM observations.uploads u JOIN observations.upload_folds f ON f.upload_id = u.id
                 WHERE u.id = $1 AND {condition}
                 FOR UPDATE OF f SKIP LOCKED"
            ),
            &[&upload_id],
        )
        .await?;
    match locked {
        Some(_) => queue::upload(transaction, upload_id).await,
        None => Ok(None),
    }
}

async fn reject_with_no_samples(transaction: &Transaction<'_>, upload_id: Uuid) -> Result<(), StoreError> {
    transaction
        .execute(
            "UPDATE observations.uploads SET status = 'rejected', status_reason = $2, status_changed_at = now(), last_error = $3 WHERE id = $1",
            &[&upload_id, &queue::NO_SAMPLES, &queue::EVERY_SAMPLE_DROPPED],
        )
        .await?;
    Ok(())
}

async fn note_file_gone(transaction: &Transaction<'_>, upload_id: Uuid) -> Result<(), StoreError> {
    transaction
        .execute("UPDATE observations.uploads SET object_deleted_at = now() WHERE id = $1 AND object_deleted_at IS NULL", &[&upload_id])
        .await?;
    transaction
        .execute(
            "INSERT INTO observations.engine_runs (kind, params)
             SELECT 'rebuild', jsonb_build_object('uploadId', u.id::text) FROM observations.uploads u WHERE u.id = $1 AND u.status = 'excluded'",
            &[&upload_id],
        )
        .await?;
    Ok(())
}

impl Store {
    pub async fn next_due(&self, due: Due, skip: &[Uuid]) -> Result<Option<Uuid>, StoreError> {
        let client = self.database.pool.get().await?;
        let row = client
            .query_opt(
                &format!(
                    "SELECT u.id FROM observations.uploads u JOIN observations.upload_folds f ON f.upload_id = u.id
                     WHERE {} AND u.id <> ALL($1)
                     ORDER BY u.status_changed_at, u.id
                     LIMIT 1",
                    due.condition()
                ),
                &[&skip],
            )
            .await?;
        Ok(row.map(|row| row.get(0)))
    }

    pub async fn subtract_due(&self, upload_id: Uuid) -> Result<Done, StoreError> {
        let mut client = self.database.pool.get().await?;
        digest::prepare_session(&client).await?;
        let transaction = client.transaction().await?;
        let Some(upload) = lock_folded(&transaction, upload_id, Due::Subtraction.condition()).await? else {
            return Ok(Done::NotDue);
        };
        let Some(folded) = self.subtract_recorded(&transaction, &upload).await? else {
            note_file_gone(&transaction, upload_id).await?;
            transaction.commit().await?;
            return Ok(Done::FileGone);
        };
        transaction.execute("UPDATE observations.upload_folds SET unfolded_at = now() WHERE upload_id = $1", &[&upload_id]).await?;
        transaction.commit().await?;
        Ok(Done::Folded(folded))
    }

    pub async fn restore_due(&self, upload_id: Uuid) -> Result<Done, StoreError> {
        let mut client = self.database.pool.get().await?;
        digest::prepare_session(&client).await?;
        let transaction = client.transaction().await?;
        let Some(upload) = lock_folded(&transaction, upload_id, Due::Restore.condition()).await? else {
            return Ok(Done::NotDue);
        };
        let recorded = load_recorded(&transaction, upload_id).await?;
        let Ok(read) = self.read(&upload).await? else {
            note_file_gone(&transaction, upload_id).await?;
            transaction.commit().await?;
            return Ok(Done::FileGone);
        };
        let setting = self.recorded_setting(&*transaction, &upload, &recorded).await?;
        let added = self.fold_and_write(&transaction, upload_id, Arc::new(read.batch), setting, Direction::Add, &Default::default()).await?;
        record::write_new_squares(&transaction, upload_id, &added.touched.new_squares).await?;
        transaction.execute("UPDATE observations.upload_folds SET unfolded_at = NULL WHERE upload_id = $1", &[&upload_id]).await?;
        transaction.commit().await?;
        Ok(Done::Folded(Folded { report: added.report, touched: added.touched }))
    }

    pub async fn refold(&self, upload_id: Uuid) -> Result<Done, StoreError> {
        let mut client = self.database.pool.get().await?;
        self.current_outline_version(&mut client).await?;
        digest::prepare_session(&client).await?;
        let transaction = client.transaction().await?;
        let Some(upload) = lock_folded(&transaction, upload_id, FOLDED).await? else {
            return Ok(Done::NotDue);
        };
        let recorded = load_recorded(&transaction, upload_id).await?;
        let Ok(read) = self.read(&upload).await? else {
            note_file_gone(&transaction, upload_id).await?;
            transaction.commit().await?;
            return Ok(Done::FileGone);
        };
        let batch = Arc::new(read.batch);
        let then = self.recorded_setting(&*transaction, &upload, &recorded).await?;
        self.fold_and_write(&transaction, upload_id, batch.clone(), then, Direction::Subtract, &recorded.new_squares).await?;
        transaction.execute("DELETE FROM observations.upload_folds WHERE upload_id = $1", &[&upload_id]).await?;

        let (now, phone) = self.current_setting(&*transaction, &upload, &batch).await?;
        let (now, fold) = run_fold(batch.clone(), now).await?;
        if fold.report.kept_samples() == 0 {
            reject_with_no_samples(&transaction, upload_id).await?;
            record::write_drops(&transaction, upload_id, &fold.report).await?;
            transaction.commit().await?;
            return Ok(Done::Rejected);
        }
        let added = self.write_deltas(&transaction, upload_id, now, fold, Direction::Add, &Default::default()).await?;
        record::write(&transaction, &added.fold_record(upload_id, &batch, &read.dropped_values, phone.modem_family.as_deref())).await?;
        transaction.commit().await?;
        Ok(Done::Folded(Folded { report: added.report, touched: added.touched }))
    }

    pub async fn refold_candidates(&self, params: &Value) -> Result<Vec<Uuid>, StoreError> {
        let user_id =
            params.get("userId").and_then(Value::as_str).map(Uuid::parse_str).transpose().map_err(|_| StoreError::data("userId is not a uuid"))?;
        let device_model_id: Option<i32> = id_param(params, "deviceModelId")?;
        let reading_block_id: Option<i16> = id_param(params, "readingBlockId")?;
        let quirk_rule_id = params.get("quirkRuleId").and_then(Value::as_str);
        let upload_ids = params
            .get("uploadIds")
            .and_then(Value::as_array)
            .map(|ids| ids.iter().map(|id| id.as_str().and_then(|id| Uuid::parse_str(id).ok())).collect::<Option<Vec<_>>>())
            .map(|ids| ids.ok_or_else(|| StoreError::data("uploadIds lists something that is not a uuid")))
            .transpose()?;
        let client = self.database.pool.get().await?;
        let rows = client
            .query(
                &format!(
                    "SELECT u.id FROM observations.uploads u
                     JOIN observations.upload_folds f ON f.upload_id = u.id
                     JOIN observations.devices d ON d.id = u.device_id
                     WHERE {FOLDED}
                       AND ($1::uuid IS NULL OR d.user_id = $1)
                       AND ($2::int IS NULL OR d.model_id = $2)
                       AND ($3::uuid[] IS NULL OR u.id = ANY($3))
                       AND ($4::smallint IS NULL OR EXISTS (
                         SELECT 1 FROM observations.upload_blocked_values v WHERE v.upload_id = u.id AND v.reading_block_id = $4
                       ) OR EXISTS (
                         SELECT 1 FROM observations.reading_blocks b
                         JOIN observations.device_models m ON m.id = d.model_id
                         LEFT JOIN observations.board_socs bs ON m.soc_id IS NULL AND bs.board = m.board
                         LEFT JOIN observations.socs s ON s.id = coalesce(m.soc_id, bs.soc_id)
                         WHERE b.id = $4 AND b.disabled_at IS NULL
                           AND (b.modem_family IS NULL OR b.modem_family = s.modem_family)
                           AND (b.soc_id IS NULL OR b.soc_id = s.id)
                           AND (b.device_model_id IS NULL OR b.device_model_id = d.model_id)
                           AND (b.reader_version_id IS NULL OR EXISTS (
                             SELECT 1 FROM observations.upload_readers r WHERE r.upload_id = u.id AND r.reader_version_id = b.reader_version_id
                           ))
                           AND (b.sdk_int_min IS NULL OR f.sdk_int >= b.sdk_int_min)
                           AND (b.sdk_int_max IS NULL OR f.sdk_int <= b.sdk_int_max)
                           AND (b.radio_version_prefix IS NULL OR starts_with(f.radio_version, b.radio_version_prefix))
                       ))
                       AND ($5::text IS NULL OR EXISTS (
                         SELECT 1 FROM observations.upload_corrections c WHERE c.upload_id = u.id AND c.quirk_rule_id = $5
                       ) OR EXISTS (
                         SELECT 1 FROM observations.upload_skipped_rules r WHERE r.upload_id = u.id AND r.quirk_rule_id = $5
                       ))
                     ORDER BY u.received_at, u.id"
                ),
                &[&user_id, &device_model_id, &upload_ids, &reading_block_id, &quirk_rule_id],
            )
            .await?;
        Ok(rows.iter().map(|row| row.get(0)).collect())
    }

    pub async fn rebuild(&self, upload_id: Uuid) -> Result<Done, StoreError> {
        let mut client = self.database.pool.get().await?;
        digest::prepare_session(&client).await?;
        let transaction = client.transaction().await?;
        let Some(excluded) = lock_folded(&transaction, upload_id, EXCLUDED_BUT_FOLDED).await? else {
            return Ok(Done::NotDue);
        };
        let bounds =
            transaction.query_one("SELECT west, south, east, north FROM observations.upload_folds WHERE upload_id = $1", &[&upload_id]).await?;
        let (west, south, east, north): (f64, f64, f64, f64) = (bounds.get(0), bounds.get(1), bounds.get(2), bounds.get(3));
        let tiles = tiles_covering(west, south, east, north);
        let north_west = Tile::at(Point::new(north, west), SQUARE_ZOOM);
        let south_east = Tile::at(Point::new(south, east), SQUARE_ZOOM);
        let rows = transaction
            .query(
                "SELECT DISTINCT b.observed_cell_id, b.bin, c.plmn, c.rat::text, c.cell_key, c.observed_site_id
                 FROM observations.cell_contributors k
                 JOIN observations.cell_bins b ON b.observed_cell_id = k.observed_cell_id
                 JOIN observations.observed_cells c ON c.id = k.observed_cell_id
                 WHERE k.device_id = $1 AND (b.bin >> 16) = ANY($2)",
                &[&excluded.device_id, &tiles],
            )
            .await?;
        let mut cell_ids = BTreeSet::new();
        let mut site_ids = BTreeSet::new();
        let mut identities = BTreeSet::new();
        for row in &rows {
            let square = Tile::from_quadkey(row.get::<_, i64>(1) as u64, SQUARE_ZOOM);
            if (north_west.x..=south_east.x).contains(&square.x) && (north_west.y..=south_east.y).contains(&square.y) {
                cell_ids.insert(row.get::<_, i32>(0));
                site_ids.extend(row.get::<_, Option<i32>>(5));
                identities.insert(CellIdentity { plmn: row.get(2), rat: rat_of_label(row.get(3))?, cell_key: row.get(4) });
            }
        }
        let cell_ids: Vec<i32> = cell_ids.into_iter().collect();
        let site_ids: Vec<i32> = site_ids.into_iter().collect();

        let kept_uploads: Vec<Uuid> = transaction
            .query(
                &format!(
                    "SELECT DISTINCT u.id, u.received_at FROM observations.uploads u
                     JOIN observations.upload_folds f ON f.upload_id = u.id
                     JOIN observations.cell_contributors k ON k.device_id = u.device_id
                     WHERE {FOLDED} AND u.id <> $1 AND k.observed_cell_id = ANY($2)
                     ORDER BY u.received_at, u.id"
                ),
                &[&upload_id, &cell_ids],
            )
            .await?
            .iter()
            .map(|row| row.get(0))
            .collect();

        transaction.execute(LOCK_REPLAYED_CELLS, &[&cell_ids]).await?;
        reset_cells(&transaction, &cell_ids).await?;
        let identities = Arc::new(identities);
        for kept in &kept_uploads {
            let Some(upload) = queue::upload(&*transaction, *kept).await? else {
                continue;
            };
            let Ok(read) = self.read(&upload).await? else {
                continue;
            };
            let recorded = load_recorded(&transaction, *kept).await?;
            let setting = self.recorded_setting(&*transaction, &upload, &recorded).await?;
            self.write_cells_only(&transaction, *kept, Arc::new(read.batch), setting, identities.clone()).await?;
        }
        transaction
            .execute(
                "DELETE FROM observations.observed_cells c
                 WHERE c.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM observations.cell_contributors k WHERE k.observed_cell_id = c.id)",
                &[&cell_ids],
            )
            .await?;
        transaction
            .execute(
                "DELETE FROM observations.observed_sites s
                 WHERE s.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM observations.observed_cells c WHERE c.observed_site_id = s.id)",
                &[&site_ids],
            )
            .await?;
        transaction.execute("UPDATE observations.upload_folds SET unfolded_at = now() WHERE upload_id = $1", &[&upload_id]).await?;
        transaction.commit().await?;
        Ok(Done::Rebuilt { cells: cell_ids.len(), uploads: kept_uploads.len() })
    }

    async fn subtract_recorded(&self, transaction: &Transaction<'_>, upload: &UploadRow) -> Result<Option<Folded>, StoreError> {
        let recorded = load_recorded(transaction, upload.id).await?;
        let Ok(read) = self.read(upload).await? else {
            return Ok(None);
        };
        let setting = self.recorded_setting(transaction, upload, &recorded).await?;
        let added = self.fold_and_write(transaction, upload.id, Arc::new(read.batch), setting, Direction::Subtract, &recorded.new_squares).await?;
        Ok(Some(Folded { report: added.report, touched: added.touched }))
    }
}

fn id_param<T: TryFrom<i64>>(params: &Value, name: &str) -> Result<Option<T>, StoreError> {
    params.get(name).and_then(Value::as_i64).map(T::try_from).transpose().map_err(|_| StoreError::data(format!("{name} is too large")))
}

async fn load_recorded(transaction: &Transaction<'_>, upload_id: Uuid) -> Result<fold_inputs::Recorded, StoreError> {
    fold_inputs::recorded(transaction, upload_id).await?.ok_or_else(|| StoreError::data(format!("upload {upload_id} has no fold record")))
}

async fn reset_cells(transaction: &Transaction<'_>, cell_ids: &[i32]) -> Result<(), StoreError> {
    let by_cell = ["cell_bins", "cell_ta_bins", "cell_values", "cell_networks", "cell_contributors", "cell_readers"];
    for table in by_cell {
        transaction.execute(&format!("DELETE FROM observations.{table} WHERE observed_cell_id = ANY($1)"), &[&cell_ids]).await?;
    }
    for table in ["handover_bins", "cell_transitions"] {
        transaction.execute(&format!("DELETE FROM observations.{table} WHERE from_cell_id = ANY($1) OR to_cell_id = ANY($1)"), &[&cell_ids]).await?;
    }
    transaction.execute("DELETE FROM observations.nsa_links WHERE anchor_cell_id = ANY($1)", &[&cell_ids]).await?;
    transaction
        .execute("DELETE FROM observations.same_reading_pairs WHERE observed_cell_id = ANY($1) OR other_observed_cell_id = ANY($1)", &[&cell_ids])
        .await?;
    transaction
        .execute(
            "INSERT INTO observations.dirty_sites (observed_site_id)
             SELECT DISTINCT observed_site_id FROM observations.observed_cells WHERE id = ANY($1) AND observed_site_id IS NOT NULL ORDER BY 1
             ON CONFLICT (observed_site_id) DO NOTHING",
            &[&cell_ids],
        )
        .await?;
    Ok(())
}
