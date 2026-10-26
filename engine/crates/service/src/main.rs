mod backoff;
mod config;
mod estimating;
mod folding;
mod nightly;
mod runs;
mod shutdown;
mod upkeep;
mod wake;

use std::sync::Arc;

use config::{Config, LogFormat};
use engine_batch::SealKeys;
use engine_store::pipeline::Store;
use engine_store::raw::RawFiles;
use engine_store::sql_types::Timestamp;
use engine_store::{Database, heartbeat};
use mimalloc::MiMalloc;
use tokio::task::JoinSet;
use tracing_subscriber::EnvFilter;
use wake::Wake;

#[global_allocator]
static ALLOCATOR: MiMalloc = MiMalloc;

fn main() -> anyhow::Result<()> {
    if std::env::args().nth(1).as_deref() == Some("health") {
        return health();
    }
    let config = Config::from_env()?;
    start_logging(config.log_format);
    let mut runtime = tokio::runtime::Builder::new_multi_thread();
    if let Some(threads) = config.threads {
        runtime.worker_threads(threads);
    }
    runtime.enable_all().build()?.block_on(serve(config))
}

fn health() -> anyhow::Result<()> {
    let url = config::required("ENGINE_DATABASE_URL")?;
    let instance = config::instance_name();
    let alive = tokio::runtime::Builder::new_current_thread().enable_all().build()?.block_on(async {
        let database = Database::connect(&url)?;
        let client = database.pool.get().await?;
        heartbeat::is_alive(&**client, &instance).await
    })?;
    if !alive {
        anyhow::bail!("the heartbeat of {instance} is more than a minute old");
    }
    Ok(())
}

fn start_logging(format: LogFormat) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let logging = tracing_subscriber::fmt().with_env_filter(filter);
    match format {
        LogFormat::Json => logging.json().flatten_event(true).init(),
        LogFormat::Text => logging.init(),
    }
}

async fn serve(config: Config) -> anyhow::Result<()> {
    let store = Arc::new(Store {
        database: Database::connect(&config.database_url)?,
        raw: RawFiles::on_disk(&config.observations_dir)?,
        seal_keys: Arc::new(SealKeys::parse(&config.seal_keys)?),
        outlines: Default::default(),
        copy_types: Default::default(),
    });
    let (stop, shutdown) = shutdown::channel();
    let wake = Arc::new(Wake::default());
    tracing::info!(instance = %config.instance, fold_workers = config.fold_workers, "the engine started");

    let mut tasks = JoinSet::new();
    tasks.spawn(wake::listen(store.clone(), wake.clone(), shutdown.clone()));
    tasks.spawn(upkeep::heartbeat(store.clone(), config.instance.clone(), Timestamp::now(), shutdown.clone()));
    tasks.spawn(upkeep::country_outlines(store.clone(), shutdown.clone()));
    tasks.spawn(upkeep::trail_pyramid(store.clone(), shutdown.clone()));
    for _ in 0..config.fold_workers {
        tasks.spawn(folding::fold_worker(store.clone(), wake.clone(), shutdown.clone()));
    }
    tasks.spawn(runs::run_worker(store.clone(), wake.clone(), shutdown.clone()));
    tasks.spawn(estimating::estimate_worker(store.clone(), shutdown.clone()));
    tasks.spawn(nightly::nightly_loop(store.clone(), wake.clone(), shutdown.clone()));

    shutdown::signalled().await;
    tracing::info!("stopping: finishing what is held and claiming nothing more");
    stop.stop();
    while let Some(finished) = tasks.join_next().await {
        if let Err(error) = finished {
            tracing::warn!(error = %error, "a task stopped abnormally");
        }
    }
    Ok(())
}
