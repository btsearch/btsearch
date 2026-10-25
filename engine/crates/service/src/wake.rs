use std::sync::Arc;

use engine_store::pipeline::Store;
use tokio::sync::Notify;

use crate::backoff::Backoff;
use crate::shutdown::Shutdown;

const UPLOAD_PAYLOAD: &str = "upload";
const RUN_PAYLOAD: &str = "run";

#[derive(Default)]
pub struct Wake {
    pub uploads: Notify,
    pub runs: Notify,
}

impl Wake {
    fn everyone(&self) {
        self.uploads.notify_waiters();
        self.runs.notify_waiters();
    }
}

pub async fn listen(store: Arc<Store>, wake: Arc<Wake>, shutdown: Shutdown) {
    let mut backoff = Backoff::default();
    while !shutdown.is_stopping() {
        match store.database.listen().await {
            Ok(mut listener) => {
                backoff.reset();
                wake.everyone();
                loop {
                    tokio::select! {
                        payload = listener.next() => match payload.as_deref() {
                            Some(UPLOAD_PAYLOAD) => wake.uploads.notify_waiters(),
                            Some(RUN_PAYLOAD) => wake.runs.notify_waiters(),
                            Some(_) => wake.everyone(),
                            None => break,
                        },
                        () = shutdown.stopping() => return,
                    }
                }
                tracing::warn!("the LISTEN connection closed; connecting again");
            }
            Err(error) => tracing::warn!(error = %error, "LISTEN could not connect"),
        }
        shutdown.sleep(backoff.next()).await;
    }
}
