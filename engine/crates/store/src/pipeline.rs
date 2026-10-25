use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use engine_batch::document::{Batch, ReaderSource};
use engine_batch::{DroppedValues, SealKeys, StoredUpload, Upload, read_upload};
use engine_fold::identity::CellIdentity;
use engine_fold::inputs::{ConfirmedCell, FOLD_VERSION, FoldInputs, ReaderVersion, ReadingBlock};
use engine_fold::memory::Direction;
use engine_fold::report::{FoldReport, SquareOrigin};
use engine_fold::{Fold, fold};
use engine_geo::outlines::CountryOutlines;
use tokio_postgres::{Client, GenericClient, Transaction};
use uuid::Uuid;

use crate::digest::{self, CopyTypes, Touched};
use crate::fold_inputs::{self, Phone, Recorded};
use crate::outlines::{self, OutlineVersions};
use crate::queue::{self, Claim, EVERY_SAMPLE_DROPPED, FILE_MISSING, NO_SAMPLES, UploadRow};
use crate::raw::{RawFiles, raw_file_path};
use crate::record::{self, FoldRecord};
use crate::{Database, StoreError};

pub struct Store {
    pub database: Database,
    pub raw: RawFiles,
    pub seal_keys: Arc<SealKeys>,
    pub outlines: OutlineVersions,
    pub copy_types: CopyTypes,
}

pub(crate) struct Setting {
    pub received_at_millis: i64,
    pub device_id: Uuid,
    pub user_id: Option<Uuid>,
    pub weight_milli: i64,
    pub ta_groups: BTreeMap<ReaderSource, i16>,
    pub closed_countries: BTreeSet<String>,
    pub blocked_quirk_rules: BTreeSet<String>,
    pub reading_blocks: Vec<ReadingBlock>,
    pub outline_version: i16,
    pub outlines: Arc<CountryOutlines>,
    pub confirmed_cells: BTreeMap<CellIdentity, ConfirmedCell>,
}

impl Setting {
    fn inputs(&self) -> FoldInputs<'_> {
        FoldInputs {
            received_at_millis: self.received_at_millis,
            device_id: self.device_id.hyphenated().to_string(),
            user_id: self.user_id.map(|user_id| user_id.hyphenated().to_string()),
            device_weight_milli: self.weight_milli,
            ta_groups: self.ta_groups.clone(),
            outlines: &self.outlines,
            closed_countries: self.closed_countries.clone(),
            blocked_quirk_rules: self.blocked_quirk_rules.clone(),
            reading_blocks: self.reading_blocks.clone(),
            confirmed_cells: self.confirmed_cells.clone(),
        }
    }
}

pub struct Folded {
    pub report: FoldReport,
    pub touched: Touched,
}

pub enum Outcome {
    Processed(Folded),
    Rejected { reason: &'static str, detail: String },
    Lost,
}

#[derive(Clone, Copy)]
pub enum Finish<'a> {
    Commit(&'a Claim),
    RollBack,
}

pub(crate) struct Added {
    pub setting: Setting,
    pub report: FoldReport,
    pub reader_ids: BTreeMap<ReaderVersion, i16>,
    pub touched: Touched,
}

impl Added {
    pub(crate) fn fold_record<'a>(
        &'a self,
        upload_id: Uuid,
        batch: &'a Batch,
        dropped_values: &'a DroppedValues,
        modem_family: Option<&'a str>,
    ) -> FoldRecord<'a> {
        FoldRecord {
            upload_id,
            batch,
            report: &self.report,
            dropped_values,
            weight_milli: self.setting.weight_milli,
            modem_family,
            outline_version: self.setting.outline_version,
            ta_groups: &self.setting.ta_groups,
            reader_ids: &self.reader_ids,
            new_squares: &self.touched.new_squares,
        }
    }
}

type UploadOrRejection = Result<Upload, (&'static str, String)>;

impl Store {
    pub(crate) async fn read(&self, upload: &UploadRow) -> Result<UploadOrRejection, StoreError> {
        let path = raw_file_path(upload.received_at, upload.id, &upload.body_sha256);
        let Some(sealed) = self.raw.read(&upload.store, &path).await? else {
            return Ok(Err((FILE_MISSING, path)));
        };
        let seal_keys = self.seal_keys.clone();
        let (id, device_id) = (upload.id.hyphenated().to_string(), upload.device_id.hyphenated().to_string());
        let (encoding, body_bytes, body_sha256) = (upload.encoding, upload.body_bytes, upload.body_sha256.clone());
        let read = tokio::task::spawn_blocking(move || {
            let body_bytes = usize::try_from(body_bytes).unwrap_or(0);
            let stored = StoredUpload { id: &id, device_id: &device_id, encoding, body_bytes, body_sha256: &body_sha256 };
            read_upload(&sealed, &stored, &seal_keys)
        })
        .await
        .map_err(|error| StoreError::data(format!("reading the upload stopped: {error}")))?;
        Ok(read.map_err(|rejection| (rejection.reason(), rejection.to_string())))
    }

    pub(crate) async fn current_outline_version(&self, client: &mut deadpool_postgres::Client) -> Result<i16, StoreError> {
        match outlines::newest_version(&***client).await? {
            Some(version) => Ok(version),
            None => outlines::build_when_changed(client).await,
        }
    }

    pub(crate) async fn current_setting(
        &self,
        client: &impl GenericClient,
        upload: &UploadRow,
        batch: &Batch,
    ) -> Result<(Setting, Phone), StoreError> {
        let (outline_version, phone, closed_countries, blocked_quirk_rules, confirmed_cells) = tokio::try_join!(
            outlines::newest_version(client),
            fold_inputs::phone(client, upload.device_id),
            fold_inputs::closed_countries(client),
            fold_inputs::blocked_quirk_rules(client),
            fold_inputs::confirmed_cells(client, batch),
        )?;
        let Some(outline_version) = outline_version else {
            return Err(StoreError::data("no country outlines have been built yet"));
        };
        let sources = fold_inputs::sources_of(batch);
        let (ta_groups, reading_blocks, outlines) = tokio::try_join!(
            fold_inputs::ta_groups(client, &sources, &phone),
            fold_inputs::matching_reading_blocks(client, &phone, batch),
            self.outlines.get(client, outline_version),
        )?;
        let in_first_week = fold_inputs::is_in_first_week(phone.contributor_since, upload.received_at);
        let setting = Setting {
            received_at_millis: upload.received_at.epoch_millis(),
            device_id: upload.device_id,
            user_id: phone.user_id,
            weight_milli: fold_inputs::device_weight_milli(phone.weight, phone.is_weight_computed, in_first_week),
            ta_groups,
            closed_countries,
            blocked_quirk_rules,
            reading_blocks,
            outline_version,
            outlines,
            confirmed_cells,
        };
        Ok((setting, phone))
    }

    pub(crate) async fn recorded_setting(&self, client: &impl GenericClient, upload: &UploadRow, recorded: &Recorded) -> Result<Setting, StoreError> {
        if recorded.fold_version != FOLD_VERSION {
            return Err(StoreError::data(format!("fold version {} is not in this engine", recorded.fold_version)));
        }
        let phone = fold_inputs::phone(client, upload.device_id).await?;
        Ok(Setting {
            received_at_millis: upload.received_at.epoch_millis(),
            device_id: upload.device_id,
            user_id: phone.user_id,
            weight_milli: i64::from(recorded.weight_milli),
            ta_groups: recorded.ta_groups.clone(),
            closed_countries: recorded.closed_countries.clone(),
            blocked_quirk_rules: recorded.skipped_rules.clone(),
            reading_blocks: recorded.reading_blocks.clone(),
            outline_version: recorded.outline_version,
            outlines: self.outlines.get(client, recorded.outline_version).await?,
            confirmed_cells: BTreeMap::new(),
        })
    }

    pub async fn fold_upload(&self, upload: &UploadRow, finish: Finish<'_>) -> Result<Outcome, StoreError> {
        let mut client = self.database.pool.get().await?;
        self.current_outline_version(&mut client).await?;
        let read = match self.read(upload).await? {
            Ok(read) => read,
            Err((reason, detail)) => return self.rejected(&client, finish, reason, detail).await,
        };
        let batch = Arc::new(read.batch);
        let (setting, phone) = self.current_setting(&**client, upload, &batch).await?;
        let (setting, fold) = run_fold(batch.clone(), setting).await?;
        if fold.report.kept_samples() == 0 {
            return self.rejected_without_samples(&mut client, finish, &fold.report).await;
        }

        digest::prepare_session(&client).await?;
        let transaction = client.transaction().await?;
        let added = self.write_deltas(&transaction, upload.id, setting, fold, Direction::Add, &BTreeMap::new()).await?;
        if let Finish::Commit(claim) = finish
            && !queue::mark_processed(&transaction, claim).await?
        {
            return Ok(Outcome::Lost);
        }
        record::write(&transaction, &added.fold_record(upload.id, &batch, &read.dropped_values, phone.modem_family.as_deref())).await?;
        match finish {
            Finish::Commit(_) => transaction.commit().await?,
            Finish::RollBack => transaction.rollback().await?,
        }
        Ok(Outcome::Processed(Folded { report: added.report, touched: added.touched }))
    }

    async fn rejected(&self, client: &Client, finish: Finish<'_>, reason: &'static str, detail: String) -> Result<Outcome, StoreError> {
        if let Finish::Commit(claim) = finish
            && !queue::reject(client, claim, reason, &detail).await?
        {
            return Ok(Outcome::Lost);
        }
        Ok(Outcome::Rejected { reason, detail })
    }

    async fn rejected_without_samples(
        &self,
        client: &mut deadpool_postgres::Client,
        finish: Finish<'_>,
        report: &FoldReport,
    ) -> Result<Outcome, StoreError> {
        let detail = EVERY_SAMPLE_DROPPED.to_owned();
        if let Finish::Commit(claim) = finish {
            let transaction = client.transaction().await?;
            if !queue::reject(&*transaction, claim, NO_SAMPLES, &detail).await? {
                return Ok(Outcome::Lost);
            }
            record::write_drops(&transaction, claim.upload.id, report).await?;
            transaction.commit().await?;
        }
        Ok(Outcome::Rejected { reason: NO_SAMPLES, detail })
    }

    pub(crate) async fn fold_and_write(
        &self,
        transaction: &Transaction<'_>,
        upload_id: Uuid,
        batch: Arc<Batch>,
        setting: Setting,
        direction: Direction,
        recorded_new_squares: &BTreeMap<SquareOrigin, i64>,
    ) -> Result<Added, StoreError> {
        let (setting, fold) = run_fold(batch, setting).await?;
        self.write_deltas(transaction, upload_id, setting, fold, direction, recorded_new_squares).await
    }

    pub(crate) async fn write_deltas(
        &self,
        transaction: &Transaction<'_>,
        upload_id: Uuid,
        setting: Setting,
        fold: Fold,
        direction: Direction,
        recorded_new_squares: &BTreeMap<SquareOrigin, i64>,
    ) -> Result<Added, StoreError> {
        let reader_ids = record::register_readers(transaction, &fold.report).await?;
        let target = digest::Upload {
            id: upload_id,
            user_id: setting.user_id,
            reader_ids: &reader_ids,
            trail_square_origins: &fold.report.trail_square_origins,
            recorded_new_squares,
        };
        let touched = digest::apply(transaction, &self.copy_types, &fold.deltas, &target, direction).await?;
        Ok(Added { setting, report: fold.report, reader_ids, touched })
    }

    pub(crate) async fn write_cells_only(
        &self,
        transaction: &Transaction<'_>,
        upload_id: Uuid,
        batch: Arc<Batch>,
        setting: Setting,
        cells: Arc<BTreeSet<CellIdentity>>,
    ) -> Result<Touched, StoreError> {
        let (setting, fold) = tokio::task::spawn_blocking(move || {
            let mut fold = fold(&batch, &setting.inputs());
            fold.deltas.retain_cells(&cells);
            (setting, fold)
        })
        .await
        .map_err(|error| StoreError::data(format!("the fold stopped: {error}")))?;
        let added = self.write_deltas(transaction, upload_id, setting, fold, Direction::Add, &BTreeMap::new()).await?;
        Ok(added.touched)
    }
}

pub(crate) async fn run_fold(batch: Arc<Batch>, setting: Setting) -> Result<(Setting, Fold), StoreError> {
    tokio::task::spawn_blocking(move || {
        let fold = fold(&batch, &setting.inputs());
        (setting, fold)
    })
    .await
    .map_err(|error| StoreError::data(format!("the fold stopped: {error}")))
}

pub fn new_square_total(new_squares: &BTreeMap<SquareOrigin, i64>) -> i64 {
    new_squares.values().sum()
}
