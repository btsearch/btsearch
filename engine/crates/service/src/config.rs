use std::env;

use anyhow::{Context, bail};

const DEFAULT_OBSERVATIONS_DIR: &str = "/app/observations";
const DEFAULT_FOLD_WORKERS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Json,
    Text,
}

pub struct Config {
    pub database_url: String,
    pub observations_dir: String,
    pub seal_keys: String,
    pub threads: Option<usize>,
    pub fold_workers: usize,
    pub log_format: LogFormat,
    pub instance: String,
}

pub fn required(name: &str) -> anyhow::Result<String> {
    env::var(name).with_context(|| format!("{name} is not set"))
}

fn positive_count(name: &str) -> anyhow::Result<Option<usize>> {
    match env::var(name) {
        Err(_) => Ok(None),
        Ok(value) => match value.trim().parse::<usize>() {
            Ok(count) if count > 0 => Ok(Some(count)),
            _ => bail!("{name} must be a whole number above zero, not {value:?}"),
        },
    }
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let log_format = match env::var("ENGINE_LOG_FORMAT").as_deref() {
            Err(_) | Ok("json") => LogFormat::Json,
            Ok("text") => LogFormat::Text,
            Ok(other) => bail!("ENGINE_LOG_FORMAT must be json or text, not {other:?}"),
        };
        Ok(Self {
            database_url: required("ENGINE_DATABASE_URL")?,
            observations_dir: env::var("OBSERVATIONS_DIR").unwrap_or_else(|_| DEFAULT_OBSERVATIONS_DIR.to_owned()),
            seal_keys: required("OBSERVATIONS_SEAL_KEYS")?,
            threads: positive_count("ENGINE_THREADS")?,
            fold_workers: positive_count("ENGINE_FOLD_WORKERS")?.unwrap_or(DEFAULT_FOLD_WORKERS),
            log_format,
            instance: instance_name(),
        })
    }
}

pub fn instance_name() -> String {
    env::var("HOSTNAME").ok().filter(|name| !name.trim().is_empty()).unwrap_or_else(|| "engine".to_owned())
}
