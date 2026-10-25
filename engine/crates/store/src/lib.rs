pub mod calibrated;
mod connection;
mod digest;
mod fold_inputs;
mod ground_truth;
pub mod heartbeat;
pub mod nightly;
pub mod outlines;
mod parallel;
pub mod pipeline;
mod pyramid;
pub mod queue;
pub mod raw;
mod record;
pub mod reported_codes;
pub mod runs;
pub mod sites;
pub mod sql_types;
mod summaries;

pub use connection::{Database, Listener};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error(transparent)]
    Postgres(#[from] tokio_postgres::Error),
    #[error(transparent)]
    Pool(#[from] deadpool_postgres::PoolError),
    #[error(transparent)]
    PoolBuild(#[from] deadpool_postgres::BuildError),
    #[error(transparent)]
    Raw(#[from] object_store::Error),
    #[error("the digest does not hold what this upload added: {0}")]
    Inexact(String),
    #[error("{0}")]
    Data(String),
}

const TRANSIENT_SQLSTATE_CLASSES: [&str; 4] = ["08", "40", "53", "57"];

impl StoreError {
    pub fn data(message: impl Into<String>) -> Self {
        Self::Data(message.into())
    }

    pub fn is_transient(&self) -> bool {
        match self {
            Self::Postgres(error) => {
                error.is_closed() || error.code().is_none_or(|code| TRANSIENT_SQLSTATE_CLASSES.iter().any(|class| code.code().starts_with(class)))
            }
            Self::Pool(_) | Self::Raw(_) => true,
            Self::PoolBuild(_) | Self::Inexact(_) | Self::Data(_) => false,
        }
    }
}
