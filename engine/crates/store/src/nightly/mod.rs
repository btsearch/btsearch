pub mod calibrate;
pub mod evaluate;
mod gnb_lengths;
mod level_models;
mod scores;

use futures_util::StreamExt;
use tokio_postgres::types::ToSql;
use tokio_postgres::{Client, GenericClient, Row};

use crate::StoreError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Half {
    Even,
    Odd,
}

impl Half {
    pub fn label(self) -> &'static str {
        match self {
            Self::Even => "even",
            Self::Odd => "odd",
        }
    }

    pub fn of_label(label: &str) -> Self {
        if label == "odd" { Self::Odd } else { Self::Even }
    }

    pub fn other(self) -> Self {
        match self {
            Self::Even => Self::Odd,
            Self::Odd => Self::Even,
        }
    }

    pub fn parity(self) -> i32 {
        match self {
            Self::Even => 0,
            Self::Odd => 1,
        }
    }
}

pub(crate) async fn stream_rows(
    client: &Client,
    statement: &str,
    params: &[&(dyn ToSql + Sync)],
    mut each: impl FnMut(&Row) -> Result<(), StoreError>,
) -> Result<(), StoreError> {
    let stream = client.query_raw(statement, params.iter().copied()).await?;
    let mut stream = std::pin::pin!(stream);
    while let Some(row) = stream.next().await {
        each(&row?)?;
    }
    Ok(())
}

pub async fn official_import_runs(client: &impl GenericClient) -> Result<bool, StoreError> {
    let row = client
        .query_one(
            "SELECT EXISTS (
               SELECT 1 FROM official.import_runs WHERE started_at IS NOT NULL AND finished_at IS NULL AND started_at > now() - interval '6 hours'
             )",
            &[],
        )
        .await?;
    Ok(row.get(0))
}

pub async fn queue_nightly_runs(client: &impl GenericClient, with_gnb_lengths: bool) -> Result<bool, StoreError> {
    let queued = client
        .execute(
            "INSERT INTO observations.engine_runs (kind, params)
             SELECT kind::engine_run_kind, params FROM (VALUES (1, 'recalibrate', '{}'::jsonb), (2, 'evaluate', jsonb_build_object('gnbLengths', $1::bool)))
               AS nightly(position, kind, params)
             WHERE NOT EXISTS (
               SELECT 1 FROM observations.engine_runs r
               WHERE r.kind = 'recalibrate' AND r.requested_by_id IS NULL AND r.created_at >= date_trunc('day', now(), 'UTC')
             )
             ORDER BY position",
            &[&with_gnb_lengths],
        )
        .await?;
    if queued > 0 {
        client.execute("NOTIFY observations, 'run'", &[]).await?;
    }
    Ok(queued > 0)
}

pub async fn mark_every_site_dirty(client: &impl GenericClient) -> Result<u64, StoreError> {
    Ok(client
        .execute(
            "INSERT INTO observations.dirty_sites (observed_site_id)
             SELECT id FROM observations.observed_sites WHERE retired_at IS NULL ORDER BY id
             ON CONFLICT (observed_site_id) DO NOTHING",
            &[],
        )
        .await?)
}
