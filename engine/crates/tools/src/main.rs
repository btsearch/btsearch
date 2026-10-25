use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, bail};
use clap::{Parser, Subcommand};
use engine_batch::document::{Batch, ReaderSource};
use engine_batch::{SealKeys, read_document};
use engine_corpus::{GeneratedUpload, Options, generate, read_fixtures};
use engine_estimate::estimate;
use engine_estimate::firmness::leave_out_shift_m;
use engine_estimate::objective::Problem;
use engine_fold::fold;
use engine_fold::inputs::{BlockField, BlockMode, FoldInputs, ReadingBlock};
use engine_geo::outlines::CountryOutlines;
use engine_store::Database;
use engine_store::calibrated::Calibrated;
use engine_store::pipeline::{Finish, Outcome, Store, new_square_total};
use engine_store::raw::RawFiles;
use engine_store::{queue, sites};
use serde_json::json;
use uuid::Uuid;

#[derive(Parser)]
#[command(name = "engine-tools", about = "Look into the crowd engine's work without running the service")]
struct Command {
    #[command(subcommand)]
    task: Task,
}

#[derive(Subcommand)]
enum Task {
    #[command(about = "Fold an upload document and print its deltas and report, without a database")]
    Fold {
        file: PathBuf,
        #[arg(long, help = "The upload's arrival in milliseconds since 1970, by default an hour after its clock")]
        received_at: Option<i64>,
        #[arg(long, help = "Hold PCIs and channels as the launch block does for Samsung modems")]
        launch_block: bool,
    },
    #[command(about = "Fold a stored upload in a transaction that is rolled back, printing what it would write")]
    Replay { upload_id: Uuid },
    #[command(about = "Print an observed site's inputs, the terms of its objective at the estimate and the estimate, without writing anything")]
    Site { site_id: i32 },
    #[command(about = "Run the nightly evaluation now, outside the nightly window, and print the run's id")]
    Evaluate {
        #[arg(long, help = "Also test every gNB length of each network, as the weekly run does")]
        gnb_lengths: bool,
    },
    #[command(about = "Write a corpus made from the fixtures: new ids, several devices, moved positions, shifted times")]
    Generate {
        #[arg(long, default_value = "fixtures/v1")]
        fixtures: PathBuf,
        #[arg(long)]
        out: PathBuf,
        #[arg(long, default_value_t = 1_000)]
        uploads: usize,
        #[arg(long, default_value_t = 25)]
        devices: usize,
        #[arg(long, default_value_t = 1)]
        seed: u64,
    },
    #[command(about = "Fold a generated corpus in memory and print the samples folded a second on one core")]
    Bench {
        #[arg(long, default_value = "fixtures/v1")]
        fixtures: PathBuf,
        #[arg(long, default_value_t = 2_000)]
        uploads: usize,
    },
}

fn main() -> anyhow::Result<()> {
    match Command::parse().task {
        Task::Fold { file, received_at, launch_block } => fold_file(&file, received_at, launch_block),
        Task::Replay { upload_id } => run_async(replay(upload_id)),
        Task::Site { site_id } => run_async(print_site(site_id)),
        Task::Evaluate { gnb_lengths } => run_async(run_evaluation(gnb_lengths)),
        Task::Generate { fixtures, out, uploads, devices, seed } => write_corpus(&fixtures, &out, &Options { uploads, devices, seed }),
        Task::Bench { fixtures, uploads } => bench(&fixtures, uploads),
    }
}

fn run_async(task: impl Future<Output = anyhow::Result<()>>) -> anyhow::Result<()> {
    tokio::runtime::Builder::new_multi_thread().enable_all().build()?.block_on(task)
}

fn launch_block() -> ReadingBlock {
    ReadingBlock { id: 1, reader_version: None, rats: None, roles: None, fields: Some(vec![BlockField::Pci, BlockField::Channel]), mode: BlockMode::Corroborate }
}

fn standalone_inputs<'a>(outlines: &'a CountryOutlines, received_at_millis: i64, device_id: &str, with_launch_block: bool) -> FoldInputs<'a> {
    FoldInputs {
        received_at_millis,
        device_id: device_id.to_owned(),
        user_id: None,
        device_weight_milli: 1_000,
        ta_groups: BTreeMap::from([(ReaderSource::Api, 1), (ReaderSource::ModemLog, 2), (ReaderSource::ModemPoll, 3)]),
        outlines,
        closed_countries: BTreeSet::new(),
        blocked_quirk_rules: BTreeSet::new(),
        reading_blocks: if with_launch_block { vec![launch_block()] } else { Vec::new() },
        confirmed_cells: BTreeMap::new(),
    }
}

fn an_hour_after_clock(batch: &Batch) -> i64 {
    batch.clock.epoch_millis as i64 + 60 * 60 * 1000
}

fn fold_file(file: &Path, received_at: Option<i64>, with_launch_block: bool) -> anyhow::Result<()> {
    let document = fs::read(file).with_context(|| format!("{} cannot be read", file.display()))?;
    let ids: serde_json::Value = serde_json::from_slice(&document).context("the file is not JSON")?;
    let id = |name: &str| ids[name].as_str().map(str::to_owned).with_context(|| format!("the document has no {name}"));
    let (upload_id, device_id) = (id("uploadId")?, id("deviceId")?);
    let read = read_document(&document, &upload_id, &device_id).map_err(|rejection| anyhow::anyhow!("rejected as {}: {rejection}", rejection.reason()))?;
    let outlines = CountryOutlines::new(Vec::new());
    let received_at_millis = received_at.unwrap_or_else(|| an_hour_after_clock(&read.batch));
    let folded = fold(&read.batch, &standalone_inputs(&outlines, received_at_millis, &device_id, with_launch_block));
    let dropped_values: BTreeMap<&str, u32> = read.dropped_values.iter().map(|(field, count)| (field.as_str(), count)).collect();
    let printed = json!({ "deltas": folded.deltas, "report": folded.report, "droppedValues": dropped_values });
    println!("{}", serde_json::to_string_pretty(&printed)?);
    Ok(())
}

fn environment(name: &str) -> anyhow::Result<String> {
    std::env::var(name).with_context(|| format!("{name} is not set"))
}

async fn replay(upload_id: Uuid) -> anyhow::Result<()> {
    let store = Store {
        database: Database::connect(&environment("ENGINE_DATABASE_URL")?)?,
        raw: RawFiles::on_disk(&std::env::var("OBSERVATIONS_DIR").unwrap_or_else(|_| "/app/observations".to_owned()))?,
        seal_keys: Arc::new(SealKeys::parse(&environment("OBSERVATIONS_SEAL_KEYS")?)?),
        outlines: Default::default(),
        copy_types: Default::default(),
    };
    let upload = {
        let client = store.database.pool.get().await?;
        queue::upload(&**client, upload_id).await?
    };
    let Some(upload) = upload else {
        bail!("there is no upload {upload_id}");
    };
    let printed = match store.fold_upload(&upload, Finish::RollBack).await? {
        Outcome::Processed(folded) => json!({
            "outcome": "processed",
            "report": folded.report,
            "cells": folded.touched.cells.len(),
            "newSquares": new_square_total(&folded.touched.new_squares),
        }),
        Outcome::Rejected { reason, detail } => json!({ "outcome": "rejected", "reason": reason, "detail": detail }),
        Outcome::Lost => json!({ "outcome": "lost" }),
    };
    println!("{}", serde_json::to_string_pretty(&printed)?);
    Ok(())
}

async fn print_site(site_id: i32) -> anyhow::Result<()> {
    let database = Database::connect(&environment("ENGINE_DATABASE_URL")?)?;
    let client = database.pool.get().await?;
    let calibrated = Calibrated::latest(&**client).await?;
    let Some(input) = sites::load_site_input(&**client, site_id, &calibrated).await? else {
        bail!("there is no site {site_id}");
    };
    for cell in &input.site.cells {
        println!(
            "cell {}: {:?}, channel {:?}, {} squares, {} timing-advance rows",
            cell.key,
            cell.technology,
            cell.channel,
            cell.bins.len(),
            cell.timing_advance.len()
        );
    }
    let context = &calibrated.context;
    let Some(estimate) = estimate(&input.site, context) else {
        bail!("site {site_id} has no rows to estimate from");
    };
    if let Some(problem) = Problem::new(&input.site, context) {
        let (east, north) = problem.plane.to_plane(estimate.point);
        println!("{:#?}", problem.terms(east, north, &estimate.cell_parameters()));
    }
    println!("{estimate:#?}");
    println!("leave_out_shift_m: {:?}", leave_out_shift_m(&input.site, &estimate, context));
    Ok(())
}

async fn run_evaluation(gnb_lengths: bool) -> anyhow::Result<()> {
    let database = Database::connect(&environment("ENGINE_DATABASE_URL")?)?;
    let run_id = engine_store::nightly::evaluate::evaluate(&database, gnb_lengths).await?;
    println!("evaluation run {run_id} written");
    Ok(())
}

fn fixture_documents(directory: &Path) -> anyhow::Result<Vec<serde_json::Value>> {
    let fixtures = read_fixtures(directory).with_context(|| format!("the fixtures in {} cannot be read", directory.display()))?;
    if fixtures.is_empty() {
        bail!("{} holds no fixtures", directory.display());
    }
    Ok(fixtures.into_iter().map(|(_, document)| document).collect())
}

fn write_corpus(fixtures: &Path, out: &Path, options: &Options) -> anyhow::Result<()> {
    let uploads = generate(&fixture_documents(fixtures)?, options);
    fs::create_dir_all(out).with_context(|| format!("{} cannot be made", out.display()))?;
    let mut manifest = Vec::new();
    for upload in &uploads {
        let file = format!("{}.json", upload.upload_id.hyphenated());
        fs::write(out.join(&file), serde_json::to_vec(&upload.document)?)?;
        manifest.push(json!({
            "file": file,
            "uploadId": upload.upload_id.to_string(),
            "deviceId": upload.device_id.to_string(),
            "receivedAtMillis": upload.received_at_millis,
        }));
    }
    fs::write(out.join("manifest.json"), serde_json::to_vec_pretty(&manifest)?)?;
    println!("{} uploads from {} devices written to {}", uploads.len(), options.devices, out.display());
    Ok(())
}

fn bench(fixtures: &Path, uploads: usize) -> anyhow::Result<()> {
    let corpus = generate(&fixture_documents(fixtures)?, &Options { uploads, devices: 25, seed: 1 });
    let batches: Vec<(Batch, String, &GeneratedUpload)> = corpus
        .iter()
        .filter_map(|upload| {
            let document = serde_json::to_vec(&upload.document).ok()?;
            let (upload_id, device_id) = (upload.upload_id.hyphenated().to_string(), upload.device_id.hyphenated().to_string());
            read_document(&document, &upload_id, &device_id).ok().map(|read| (read.batch, device_id, upload))
        })
        .collect();
    let outlines = CountryOutlines::new(Vec::new());
    let started = Instant::now();
    let mut samples = 0;
    for (batch, device_id, upload) in &batches {
        samples += fold(batch, &standalone_inputs(&outlines, upload.received_at_millis, device_id, true)).report.sample_count;
    }
    let seconds = started.elapsed().as_secs_f64();
    println!("{samples} samples of {} uploads folded in {seconds:.3} s on one core: {:.0} samples a second", batches.len(), samples as f64 / seconds);
    Ok(())
}
