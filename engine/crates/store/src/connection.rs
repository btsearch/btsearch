use std::str::FromStr;

use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use futures_util::{StreamExt, stream};
use tokio::sync::mpsc;
use tokio_postgres::{AsyncMessage, Client, Config, NoTls};

use crate::StoreError;

const WORK_CONNECTIONS: usize = 4;
const CHANNEL: &str = "observations";

pub struct Database {
    pub pool: Pool,
    config: Config,
}

pub struct Listener {
    _client: Client,
    payloads: mpsc::Receiver<String>,
}

impl Listener {
    pub async fn next(&mut self) -> Option<String> {
        self.payloads.recv().await
    }
}

impl Database {
    pub fn connect(url: &str) -> Result<Self, StoreError> {
        let mut config = Config::from_str(url)?;
        config.application_name("engine").options("-c work_mem=64MB");
        let manager = Manager::from_config(config.clone(), NoTls, ManagerConfig { recycling_method: RecyclingMethod::Fast });
        let pool = Pool::builder(manager).max_size(WORK_CONNECTIONS).build()?;
        Ok(Self { pool, config })
    }

    pub async fn listen(&self) -> Result<Listener, StoreError> {
        let (client, mut connection) = self.config.connect(NoTls).await?;
        let (sender, payloads) = mpsc::channel(64);
        let mut messages = stream::poll_fn(move |context| connection.poll_message(context));
        tokio::spawn(async move {
            while let Some(Ok(message)) = messages.next().await {
                if let AsyncMessage::Notification(notification) = message
                    && sender.send(notification.payload().to_owned()).await.is_err()
                {
                    break;
                }
            }
        });
        client.batch_execute(&format!("LISTEN {CHANNEL}")).await?;
        Ok(Listener { _client: client, payloads })
    }
}
