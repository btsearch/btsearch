use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use engine_store::StoreError;
use engine_store::nightly::{official_import_runs, queue_nightly_runs};
use engine_store::pipeline::Store;

use crate::shutdown::Shutdown;
use crate::wake::Wake;

const DAY_SECONDS: u64 = 86_400;
const NIGHT_STARTS_AT_SECONDS: u64 = 3_600;
const NIGHT_ENDS_AT_SECONDS: u64 = 7 * 3_600;
const DAYS_FROM_THURSDAY_TO_SUNDAY: u64 = 3;
const LOOK_AGAIN: Duration = Duration::from_secs(300);

fn seconds_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| since.as_secs())
}

fn is_night(now: u64) -> bool {
    (NIGHT_STARTS_AT_SECONDS..NIGHT_ENDS_AT_SECONDS).contains(&(now % DAY_SECONDS))
}

fn until_next_night(now: u64) -> u64 {
    let tonight = now - now % DAY_SECONDS + NIGHT_STARTS_AT_SECONDS;
    if now < tonight { tonight - now } else { tonight + DAY_SECONDS - now }
}

fn is_sunday(now: u64) -> bool {
    (now / DAY_SECONDS) % 7 == DAYS_FROM_THURSDAY_TO_SUNDAY
}

async fn queue_tonight(store: &Store) -> Result<bool, StoreError> {
    let client = store.database.pool.get().await?;
    if official_import_runs(&**client).await? {
        return Ok(false);
    }
    queue_nightly_runs(&**client, is_sunday(seconds_now())).await?;
    Ok(true)
}

pub async fn nightly_loop(store: Arc<Store>, wake: Arc<Wake>, shutdown: Shutdown) {
    let now = seconds_now();
    let mut wait = if is_night(now) { 0 } else { until_next_night(now) };
    while !shutdown.is_stopping() {
        shutdown.sleep(Duration::from_secs(wait)).await;
        while !shutdown.is_stopping() {
            match queue_tonight(&store).await {
                Ok(true) => {
                    wake.runs.notify_waiters();
                    break;
                }
                Ok(false) => {
                    tracing::info!("an official import runs; the nightly runs wait for it");
                    shutdown.sleep(LOOK_AGAIN).await;
                }
                Err(error) => {
                    tracing::warn!(error = %error, "the nightly runs could not be queued");
                    shutdown.sleep(LOOK_AGAIN).await;
                }
            }
        }
        wait = until_next_night(seconds_now());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_night_starts_at_one_in_the_morning_utc() {
        let midnight = 20_000 * DAY_SECONDS;
        assert_eq!(until_next_night(midnight), 3_600);
        assert_eq!(until_next_night(midnight + 3_600), DAY_SECONDS);
        assert!(is_night(midnight + 3_600) && !is_night(midnight + 8 * 3_600));
        assert!(is_sunday(3 * DAY_SECONDS) && !is_sunday(4 * DAY_SECONDS), "1 January 1970 was a Thursday");
    }
}
