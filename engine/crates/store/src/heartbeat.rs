use tokio_postgres::GenericClient;

use crate::StoreError;
use crate::sql_types::Timestamp;

pub async fn beat(client: &impl GenericClient, instance: &str, started_at: Timestamp) -> Result<(), StoreError> {
    client
        .execute(
            "INSERT INTO observations.engine_heartbeats (instance, started_at, seen_at) VALUES ($1, $2, now())
             ON CONFLICT (instance) DO UPDATE SET started_at = excluded.started_at, seen_at = now()",
            &[&instance, &started_at],
        )
        .await?;
    Ok(())
}

pub async fn is_alive(client: &impl GenericClient, instance: &str) -> Result<bool, StoreError> {
    let row = client
        .query_opt("SELECT seen_at > now() - interval '1 minute' FROM observations.engine_heartbeats WHERE instance = $1", &[&instance])
        .await?;
    Ok(row.is_some_and(|row| row.get(0)))
}
