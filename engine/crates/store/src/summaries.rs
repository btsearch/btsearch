use tokio_postgres::Transaction;

use crate::StoreError;
use crate::pipeline::Store;

const SUMMARISE_CELLS: &str = "
    INSERT INTO observations.observed_cell_summaries
      (observed_cell_id, sample_count, contributor_count, person_count, square_count, first_seen_on, last_seen_on)
    SELECT k.observed_cell_id, sum(k.sample_count), count(*), count(DISTINCT d.user_id),
      (SELECT count(*) FROM observations.cell_bins b WHERE b.observed_cell_id = k.observed_cell_id),
      min(k.first_seen_on), max(k.last_seen_on)
    FROM observations.cell_contributors k
    JOIN observations.devices d ON d.id = k.device_id";

pub(crate) async fn refresh(transaction: &Transaction<'_>, cell_ids: &[i32]) -> Result<(), StoreError> {
    if cell_ids.is_empty() {
        return Ok(());
    }
    transaction
        .execute(
            &format!(
                "{SUMMARISE_CELLS}
                 WHERE k.observed_cell_id = ANY($1)
                 GROUP BY k.observed_cell_id
                 ORDER BY k.observed_cell_id
                 ON CONFLICT (observed_cell_id) DO UPDATE SET
                   sample_count = excluded.sample_count,
                   contributor_count = excluded.contributor_count,
                   person_count = excluded.person_count,
                   square_count = excluded.square_count,
                   first_seen_on = excluded.first_seen_on,
                   last_seen_on = excluded.last_seen_on"
            ),
            &[&cell_ids],
        )
        .await?;
    Ok(())
}

impl Store {
    pub async fn rebuild_read_models(&self) -> Result<u64, StoreError> {
        let mut client = self.database.pool.get().await?;
        let transaction = client.transaction().await?;
        transaction.execute("DELETE FROM observations.observed_cell_summaries", &[]).await?;
        let rebuilt = transaction.execute(&format!("{SUMMARISE_CELLS} GROUP BY k.observed_cell_id ORDER BY k.observed_cell_id"), &[]).await?;
        transaction.commit().await?;
        Ok(rebuilt)
    }
}
