use engine_batch::Encoding;
use tokio_postgres::{GenericClient, Row, Transaction};
use uuid::Uuid;

use crate::StoreError;
use crate::sql_types::Timestamp;

const MAX_ATTEMPTS: i16 = 5;
pub const PROCESSING_FAILED: &str = "processingFailed";
pub(crate) const NO_SAMPLES: &str = "noSamples";
pub(crate) const EVERY_SAMPLE_DROPPED: &str = "every sample was dropped";
pub(crate) const FILE_MISSING: &str = "fileMissing";

const UPLOAD_COLUMNS: &str = "id, device_id, encoding::text, body_bytes, body_sha256, store::text, received_at";

pub struct UploadRow {
    pub id: Uuid,
    pub device_id: Uuid,
    pub encoding: Encoding,
    pub body_bytes: i32,
    pub body_sha256: Vec<u8>,
    pub store: String,
    pub received_at: Timestamp,
}

pub struct Claim {
    pub upload: UploadRow,
    pub claimed_at: Timestamp,
    pub attempts: i16,
}

pub enum Claimed {
    Upload(Claim),
    GaveUp { upload_id: Uuid },
    Nothing,
}

fn upload_row(row: &Row) -> Result<UploadRow, StoreError> {
    let encoding = match row.get::<_, &str>(2) {
        "zstd" => Encoding::Zstd,
        "gzip" => Encoding::Gzip,
        other => return Err(StoreError::data(format!("unknown upload encoding {other}"))),
    };
    Ok(UploadRow {
        id: row.get(0),
        device_id: row.get(1),
        encoding,
        body_bytes: row.get(3),
        body_sha256: row.get(4),
        store: row.get(5),
        received_at: row.get(6),
    })
}

pub async fn upload(client: &impl GenericClient, upload_id: Uuid) -> Result<Option<UploadRow>, StoreError> {
    let row = client.query_opt(&format!("SELECT {UPLOAD_COLUMNS} FROM observations.uploads WHERE id = $1"), &[&upload_id]).await?;
    row.as_ref().map(upload_row).transpose()
}

pub async fn claim_upload(client: &mut deadpool_postgres::Client) -> Result<Claimed, StoreError> {
    let transaction = client.transaction().await?;
    let Some(waiting) = transaction
        .query_opt(
            "SELECT id, attempts FROM observations.uploads
             WHERE status = 'received' OR (status = 'processing' AND claimed_at < now() - interval '10 minutes')
             ORDER BY received_at
             LIMIT 1
             FOR UPDATE SKIP LOCKED",
            &[],
        )
        .await?
    else {
        return Ok(Claimed::Nothing);
    };
    let upload_id: Uuid = waiting.get(0);
    let attempts: i16 = waiting.get(1);
    if attempts >= MAX_ATTEMPTS {
        transaction
            .execute(
                "UPDATE observations.uploads
                 SET status = 'rejected', status_reason = $2, status_changed_at = now(), claimed_at = NULL
                 WHERE id = $1",
                &[&upload_id, &PROCESSING_FAILED],
            )
            .await?;
        transaction.commit().await?;
        return Ok(Claimed::GaveUp { upload_id });
    }
    let claimed = transaction
        .query_one(
            &format!(
                "UPDATE observations.uploads SET status = 'processing', claimed_at = now(), attempts = attempts + 1
                 WHERE id = $1
                 RETURNING {UPLOAD_COLUMNS}, claimed_at, attempts"
            ),
            &[&upload_id],
        )
        .await?;
    transaction.commit().await?;
    Ok(Claimed::Upload(Claim { upload: upload_row(&claimed)?, claimed_at: claimed.get(7), attempts: claimed.get(8) }))
}

pub(crate) async fn mark_processed(transaction: &Transaction<'_>, claim: &Claim) -> Result<bool, StoreError> {
    let updated = transaction
        .execute(
            "UPDATE observations.uploads SET status = 'processed', status_changed_at = now(), last_error = NULL
             WHERE id = $1 AND status = 'processing' AND claimed_at = $2",
            &[&claim.upload.id, &claim.claimed_at],
        )
        .await?;
    Ok(updated == 1)
}

pub(crate) async fn reject(client: &impl GenericClient, claim: &Claim, reason: &str, detail: &str) -> Result<bool, StoreError> {
    let updated = client
        .execute(
            "UPDATE observations.uploads SET status = 'rejected', status_reason = $3, status_changed_at = now(), last_error = $4
             WHERE id = $1 AND status = 'processing' AND claimed_at = $2",
            &[&claim.upload.id, &claim.claimed_at, &reason, &detail],
        )
        .await?;
    Ok(updated == 1)
}

pub async fn release(client: &impl GenericClient, claim: &Claim, error: &str) -> Result<(), StoreError> {
    client
        .execute(
            "UPDATE observations.uploads SET status = 'received', claimed_at = NULL, last_error = $3
             WHERE id = $1 AND status = 'processing' AND claimed_at = $2",
            &[&claim.upload.id, &claim.claimed_at, &error],
        )
        .await?;
    Ok(())
}
