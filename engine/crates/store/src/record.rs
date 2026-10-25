use std::collections::BTreeMap;

use engine_batch::DroppedValues;
use engine_batch::document::{Batch, ReaderSource};
use engine_fold::inputs::{FOLD_VERSION, ReaderVersion};
use engine_fold::report::{FoldReport, SquareOrigin};
use tokio_postgres::{GenericClient, Transaction};
use uuid::Uuid;

use crate::StoreError;
use crate::fold_inputs::source_label;
use crate::sql_types::{Date, Timestamp, int, smallint};

pub struct FoldRecord<'a> {
    pub upload_id: Uuid,
    pub batch: &'a Batch,
    pub report: &'a FoldReport,
    pub dropped_values: &'a DroppedValues,
    pub weight_milli: i64,
    pub modem_family: Option<&'a str>,
    pub outline_version: i16,
    pub ta_groups: &'a BTreeMap<ReaderSource, i16>,
    pub reader_ids: &'a BTreeMap<ReaderVersion, i16>,
    pub new_squares: &'a BTreeMap<SquareOrigin, i64>,
}

pub async fn register_readers(client: &impl GenericClient, report: &FoldReport) -> Result<BTreeMap<ReaderVersion, i16>, StoreError> {
    let mut sources: BTreeMap<&str, &str> = BTreeMap::new();
    for (reader, reader_report) in &report.readers {
        if let Some(source) = reader_report.source {
            sources.entry(reader.name.as_str()).or_insert(source_label(source));
        }
    }
    let names: Vec<&str> = sources.keys().copied().collect();
    let labels: Vec<&str> = sources.values().copied().collect();
    client
        .execute(
            "INSERT INTO observations.readers (name, source)
             SELECT name, source::reader_source FROM unnest($1::text[], $2::text[]) AS readers(name, source)
             ORDER BY name
             ON CONFLICT (name) DO NOTHING",
            &[&names, &labels],
        )
        .await?;

    let reader_names: Vec<&str> = report.readers.keys().map(|reader| reader.name.as_str()).collect();
    let versions: Vec<&str> = report.readers.keys().map(|reader| reader.version.as_str()).collect();
    client
        .execute(
            "INSERT INTO observations.reader_versions (reader_name, version)
             SELECT reader_name, version FROM unnest($1::text[], $2::text[]) AS versions(reader_name, version)
             ORDER BY reader_name, version
             ON CONFLICT (reader_name, version) DO NOTHING",
            &[&reader_names, &versions],
        )
        .await?;
    let rows = client
        .query(
            "SELECT v.id, v.reader_name, v.version FROM observations.reader_versions v
             JOIN unnest($1::text[], $2::text[]) AS versions(reader_name, version) ON v.reader_name = versions.reader_name AND v.version = versions.version",
            &[&reader_names, &versions],
        )
        .await?;

    let rule_ids: Vec<&str> = report.corrections.keys().map(String::as_str).collect();
    let rule_readers: Vec<&str> = report.corrections.values().map(|correction| correction.reader_name.as_str()).collect();
    client
        .execute(
            "INSERT INTO observations.quirk_rules (id, reader_name)
             SELECT id, reader_name FROM unnest($1::text[], $2::text[]) AS rules(id, reader_name)
             ORDER BY id
             ON CONFLICT (id) DO NOTHING",
            &[&rule_ids, &rule_readers],
        )
        .await?;

    Ok(rows.iter().map(|row| (ReaderVersion { name: row.get(1), version: row.get(2) }, row.get(0))).collect())
}

pub(crate) fn reader_id(reader_ids: &BTreeMap<ReaderVersion, i16>, reader: &ReaderVersion) -> Result<i16, StoreError> {
    reader_ids.get(reader).copied().ok_or_else(|| StoreError::data(format!("reader {} {} has no id", reader.name, reader.version)))
}

pub async fn write_new_squares(transaction: &Transaction<'_>, upload_id: Uuid, new_squares: &BTreeMap<SquareOrigin, i64>) -> Result<(), StoreError> {
    let countries: Vec<&str> = new_squares.keys().map(|origin| origin.country_code.as_str()).collect();
    let months: Vec<Date> = new_squares.keys().map(|origin| Date(origin.month)).collect();
    let square_counts = new_squares.values().map(|&count| int(count)).collect::<Result<Vec<_>, _>>()?;
    transaction.execute("DELETE FROM observations.upload_new_squares WHERE upload_id = $1", &[&upload_id]).await?;
    transaction
        .execute(
            "INSERT INTO observations.upload_new_squares (upload_id, country_code, month, square_count)
             SELECT $1, country_code, month, square_count FROM unnest($2::text[], $3::date[], $4::int[]) AS squares(country_code, month, square_count)",
            &[&upload_id, &countries, &months, &square_counts],
        )
        .await?;
    Ok(())
}

pub async fn write_drops(transaction: &Transaction<'_>, upload_id: Uuid, report: &FoldReport) -> Result<(), StoreError> {
    transaction.execute("DELETE FROM observations.upload_drops WHERE upload_id = $1", &[&upload_id]).await?;
    transaction.execute("DELETE FROM observations.upload_closed_countries WHERE upload_id = $1", &[&upload_id]).await?;

    let reasons: Vec<&str> = report.drops.keys().map(|reason| reason.as_str()).collect();
    let dropped = report.drops.values().map(|&count| int(count)).collect::<Result<Vec<_>, _>>()?;
    transaction
        .execute(
            "INSERT INTO observations.upload_drops (upload_id, reason, sample_count)
             SELECT $1, reason::sample_drop_reason, sample_count FROM unnest($2::text[], $3::int[]) AS drops(reason, sample_count)",
            &[&upload_id, &reasons, &dropped],
        )
        .await?;

    let closed: Vec<&str> = report.closed_countries.iter().map(String::as_str).collect();
    transaction
        .execute("INSERT INTO observations.upload_closed_countries (upload_id, country_code) SELECT $1, unnest($2::text[])", &[&upload_id, &closed])
        .await?;
    Ok(())
}

pub async fn write(transaction: &Transaction<'_>, record: &FoldRecord<'_>) -> Result<(), StoreError> {
    let report = record.report;
    let upload_id = &record.upload_id;
    let (Some(first), Some(last), Some(bounds)) = (report.first_reading_millis, report.last_reading_millis, report.bounding_box) else {
        return Err(StoreError::data("a fold that kept samples has no time span or bounding box"));
    };
    transaction
        .execute(
            "INSERT INTO observations.upload_folds (
               upload_id, fold_version, weight_milli, format_version, sdk_int, security_patch, radio_version, app_version_name, modem_family,
               outline_version, started_at, ended_at, west, south, east, north, snapshot_count, sample_count, distance_only_count, wall_clock_error_ms
             ) VALUES ($1, $2, $3, $4, $5, $6::text::date, $7, $8, $9::text::modem_family, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)",
            &[
                upload_id,
                &FOLD_VERSION,
                &i16::try_from(record.weight_milli).map_err(|_| StoreError::data("a weight above 32.767"))?,
                &smallint(record.batch.format_version)?,
                &smallint(record.batch.os.sdk_int)?,
                &record.batch.os.security_patch,
                &record.batch.os.radio_version,
                &record.batch.app.version_name,
                &record.modem_family,
                &record.outline_version,
                &Timestamp::from_epoch_millis(first),
                &Timestamp::from_epoch_millis(last),
                &bounds.west,
                &bounds.south,
                &bounds.east,
                &bounds.north,
                &int(report.snapshot_count)?,
                &int(report.sample_count)?,
                &int(report.distance_only_count)?,
                &report.wall_clock_error_millis,
            ],
        )
        .await?;

    write_new_squares(transaction, record.upload_id, record.new_squares).await?;
    write_drops(transaction, record.upload_id, report).await?;

    let sources: Vec<&str> = record.ta_groups.keys().map(|&source| source_label(source)).collect();
    let groups: Vec<i16> = record.ta_groups.values().copied().collect();
    transaction
        .execute(
            "INSERT INTO observations.upload_ta_groups (upload_id, source, ta_group_id)
             SELECT $1, source::reader_source, ta_group_id FROM unnest($2::text[], $3::smallint[]) AS groups(source, ta_group_id)",
            &[upload_id, &sources, &groups],
        )
        .await?;

    let fields: Vec<&str> = record.dropped_values.iter().map(|(field, _)| field.as_str()).collect();
    let value_counts = record.dropped_values.iter().map(|(_, count)| int(count)).collect::<Result<Vec<_>, _>>()?;
    transaction
        .execute(
            "INSERT INTO observations.upload_dropped_values (upload_id, field, value_count)
             SELECT $1, field::batch_value_field, value_count FROM unnest($2::text[], $3::int[]) AS dropped(field, value_count)",
            &[upload_id, &fields, &value_counts],
        )
        .await?;

    let mut reader_version_ids = Vec::new();
    let mut rules_versions = Vec::new();
    let mut snapshot_counts = Vec::new();
    let mut derived_values = Vec::new();
    let mut ta_on_confirmed = Vec::new();
    let mut ta_within_tolerance = Vec::new();
    for (reader, reader_report) in &report.readers {
        reader_version_ids.push(reader_id(record.reader_ids, reader)?);
        rules_versions.push(reader_report.rules_version.map(int).transpose()?);
        snapshot_counts.push(int(reader_report.snapshot_count)?);
        derived_values.push(int(reader_report.derived_values)?);
        ta_on_confirmed.push(int(reader_report.ta_on_confirmed)?);
        ta_within_tolerance.push(int(reader_report.ta_within_tolerance)?);
    }
    transaction
        .execute(
            "INSERT INTO observations.upload_readers
               (upload_id, reader_version_id, rules_version, snapshot_count, derived_values, ta_on_confirmed, ta_within_tolerance)
             SELECT $1, reader_version_id, rules_version, snapshot_count, derived_values, ta_on_confirmed, ta_within_tolerance
             FROM unnest($2::smallint[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[])
               AS readers(reader_version_id, rules_version, snapshot_count, derived_values, ta_on_confirmed, ta_within_tolerance)",
            &[upload_id, &reader_version_ids, &rules_versions, &snapshot_counts, &derived_values, &ta_on_confirmed, &ta_within_tolerance],
        )
        .await?;

    let residuals = &report.ta_residuals;
    let residual_sources: Vec<&str> = residuals.keys().map(|key| source_label(key.source)).collect();
    let residual_rats: Vec<&str> = residuals.keys().map(|key| key.rat.as_database_value()).collect();
    let residual_stations: Vec<i32> = residuals.keys().map(|key| key.station_id).collect();
    let residual_steps: Vec<i16> = residuals.keys().map(|key| key.timing_advance).collect();
    let residual_buckets: Vec<i16> = residuals.keys().map(|key| key.distance_bucket).collect();
    let residual_samples = residuals.values().map(|&count| int(count)).collect::<Result<Vec<_>, _>>()?;
    transaction
        .execute(
            "INSERT INTO observations.upload_ta_residuals (upload_id, source, rat, station_id, timing_advance, distance_bucket, samples)
             SELECT $1, source::reader_source, rat::rat, station_id, timing_advance, distance_bucket, samples
             FROM unnest($2::text[], $3::text[], $4::int[], $5::smallint[], $6::smallint[], $7::int[])
               AS residuals(source, rat, station_id, timing_advance, distance_bucket, samples)",
            &[upload_id, &residual_sources, &residual_rats, &residual_stations, &residual_steps, &residual_buckets, &residual_samples],
        )
        .await?;

    let checked_readers = report.value_checks.keys().map(|(reader, _)| reader_id(record.reader_ids, reader)).collect::<Result<Vec<_>, _>>()?;
    let checked_fields: Vec<&str> = report.value_checks.keys().map(|(_, field)| field.as_str()).collect();
    let agreed = report.value_checks.values().map(|agreement| int(agreement.agreed)).collect::<Result<Vec<_>, _>>()?;
    let differed = report.value_checks.values().map(|agreement| int(agreement.differed)).collect::<Result<Vec<_>, _>>()?;
    transaction
        .execute(
            "INSERT INTO observations.upload_value_checks (upload_id, reader_version_id, field, agreed, differed)
             SELECT $1, reader_version_id, field::cell_value_field, agreed, differed
             FROM unnest($2::smallint[], $3::text[], $4::int[], $5::int[]) AS checks(reader_version_id, field, agreed, differed)",
            &[upload_id, &checked_readers, &checked_fields, &agreed, &differed],
        )
        .await?;

    let patterns = &report.value_patterns;
    let pattern_readers = patterns.keys().map(|key| reader_id(record.reader_ids, &key.reader)).collect::<Result<Vec<_>, _>>()?;
    let pattern_fields: Vec<&str> = patterns.keys().map(|key| key.field.as_str()).collect();
    let pattern_names: Vec<&str> = patterns.keys().map(|key| key.pattern.as_str()).collect();
    let parameters = patterns.keys().map(|key| int(key.parameter)).collect::<Result<Vec<_>, _>>()?;
    let pattern_values = patterns.values().map(|count| int(count.value_count)).collect::<Result<Vec<_>, _>>()?;
    let pattern_cells = patterns.values().map(|count| int(count.cells.len())).collect::<Result<Vec<_>, _>>()?;
    transaction
        .execute(
            "INSERT INTO observations.upload_value_patterns (upload_id, reader_version_id, field, pattern, parameter, value_count, cell_count)
             SELECT $1, reader_version_id, field::cell_value_field, pattern::value_pattern, parameter, value_count, cell_count
             FROM unnest($2::smallint[], $3::text[], $4::text[], $5::int[], $6::int[], $7::int[])
               AS patterns(reader_version_id, field, pattern, parameter, value_count, cell_count)",
            &[upload_id, &pattern_readers, &pattern_fields, &pattern_names, &parameters, &pattern_values, &pattern_cells],
        )
        .await?;

    let rule_ids: Vec<&str> = report.corrections.keys().map(String::as_str).collect();
    let corrected = report.corrections.values().map(|correction| int(correction.value_count)).collect::<Result<Vec<_>, _>>()?;
    transaction
        .execute(
            "INSERT INTO observations.upload_corrections (upload_id, quirk_rule_id, value_count)
             SELECT $1, quirk_rule_id, value_count FROM unnest($2::text[], $3::int[]) AS corrections(quirk_rule_id, value_count)",
            &[upload_id, &rule_ids, &corrected],
        )
        .await?;

    let skipped_rules: Vec<&str> = report.skipped_rules.iter().map(String::as_str).collect();
    transaction
        .execute("INSERT INTO observations.upload_skipped_rules (upload_id, quirk_rule_id) SELECT $1, unnest($2::text[])", &[upload_id, &skipped_rules])
        .await?;

    let blocks: Vec<i16> = report.blocked_values.keys().copied().collect();
    let held = report.blocked_values.values().map(|counts| int(counts.held)).collect::<Result<Vec<_>, _>>()?;
    let dropped_by_blocks = report.blocked_values.values().map(|counts| int(counts.dropped)).collect::<Result<Vec<_>, _>>()?;
    transaction
        .execute(
            "INSERT INTO observations.upload_blocked_values (upload_id, reading_block_id, held_count, dropped_count)
             SELECT $1, reading_block_id, held_count, dropped_count
             FROM unnest($2::smallint[], $3::int[], $4::int[]) AS blocked(reading_block_id, held_count, dropped_count)",
            &[upload_id, &blocks, &held, &dropped_by_blocks],
        )
        .await?;
    Ok(())
}
