use std::time::Duration;

use tokio::sync::watch;

#[derive(Clone)]
pub struct Shutdown(watch::Receiver<bool>);

pub struct Stop(watch::Sender<bool>);

pub fn channel() -> (Stop, Shutdown) {
    let (sender, receiver) = watch::channel(false);
    (Stop(sender), Shutdown(receiver))
}

impl Stop {
    pub fn stop(&self) {
        self.0.send_replace(true);
    }
}

impl Shutdown {
    pub fn is_stopping(&self) -> bool {
        *self.0.borrow()
    }

    pub async fn stopping(&self) {
        let mut receiver = self.0.clone();
        let _ = receiver.wait_for(|stopping| *stopping).await;
    }

    pub async fn sleep(&self, duration: Duration) {
        tokio::select! {
            () = tokio::time::sleep(duration) => {}
            () = self.stopping() => {}
        }
    }
}

pub async fn signalled() {
    #[cfg(unix)]
    {
        let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("SIGTERM can be listened for");
        tokio::select! {
            _ = terminate.recv() => {}
            _ = tokio::signal::ctrl_c() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
