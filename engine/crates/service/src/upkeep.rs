use std::sync::Arc;
use std::time::Duration;

use engine_store::pipeline::Store;
use engine_store::sql_types::Timestamp;
use engine_store::{heartbeat, outlines};

use crate::shutdown::Shutdown;

const HEARTBEAT_EVERY: Duration = Duration::from_secs(15);
const OUTLINES_EVERY: Duration = Duration::from_secs(10 * 60);
const PYRAMID_EVERY: Duration = Duration::from_secs(60 * 60);

pub async fn heartbeat(store: Arc<Store>, instance: String, started_at: Timestamp, shutdown: Shutdown) {
    while !shutdown.is_stopping() {
        let beat = async {
            let client = store.database.pool.get().await?;
            heartbeat::beat(&**client, &instance, started_at).await
        };
        if let Err(error) = beat.await {
            tracing::warn!(error = %error, "the heartbeat could not be written");
        }
        shutdown.sleep(HEARTBEAT_EVERY).await;
    }
}

pub async fn country_outlines(store: Arc<Store>, shutdown: Shutdown) {
    while !shutdown.is_stopping() {
        let built = async {
            let mut client = store.database.pool.get().await?;
            outlines::build_when_changed(&mut client).await
        };
        match built.await {
            Ok(version) => tracing::debug!(version, "country outlines are current"),
            Err(error) => tracing::warn!(error = %error, "the country outlines could not be checked"),
        }
        shutdown.sleep(OUTLINES_EVERY).await;
    }
}

pub async fn trail_pyramid(store: Arc<Store>, shutdown: Shutdown) {
    while !shutdown.is_stopping() {
        match store.rebuild_dirty_tiles().await {
            Ok(0) => {}
            Ok(tiles) => tracing::info!(tiles, "the trail pyramid was rebuilt for the tiles that changed"),
            Err(error) => tracing::warn!(error = %error, "the trail pyramid could not be rebuilt"),
        }
        shutdown.sleep(PYRAMID_EVERY).await;
    }
}
