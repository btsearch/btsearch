use std::sync::Arc;
use std::time::Duration;

use engine_store::pipeline::Store;

use crate::shutdown::Shutdown;

const LOOK_EVERY: Duration = Duration::from_secs(10);

pub async fn estimate_worker(store: Arc<Store>, shutdown: Shutdown) {
    while !shutdown.is_stopping() {
        match store.estimate_dirty_sites().await {
            Ok(0) => shutdown.sleep(LOOK_EVERY).await,
            Ok(sites) => tracing::debug!(sites, "sites were estimated"),
            Err(error) => {
                tracing::warn!(error = %error, "the dirty sites could not be estimated");
                shutdown.sleep(LOOK_EVERY).await;
            }
        }
    }
}
