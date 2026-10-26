use std::collections::BTreeMap;
use std::fmt::Display;

use serde::Deserialize;

use crate::document::{Batch, Cell, CellCommon, Event, Measurement};
use crate::limits::{CELLS, FIXES, FORMAT_VERSION, SNAPSHOTS, SPAN_MILLIS};
use crate::rejection::Rejection;

const NAME_MAX_LENGTH: usize = 64;
const READER_NAME_MAX_LENGTH: usize = 32;
const RADIO_VERSION_MAX_LENGTH: usize = 128;
const SESSIONS_MAX: usize = 64;
const SIMS_MAX: usize = 8;
const READERS_MAX: usize = 16;
const NETWORKS_MAX: usize = 12;
const BANDS_MAX: usize = 16;
const FIELD_LIST_MAX: usize = 64;
const MEASUREMENTS_MAX: usize = 64;
const EVENTS_MAX: usize = 10_000;

#[derive(Deserialize)]
struct Header {
    #[serde(rename = "formatVersion")]
    format_version: Option<serde_json::Value>,
}

pub(crate) fn parse(document: &[u8]) -> Result<Batch, Rejection> {
    let batch: Batch = serde_json::from_slice(document).map_err(|error| why_unreadable(document, &error))?;
    if batch.format_version != FORMAT_VERSION {
        return Err(Rejection::FormatVersion(batch.format_version.to_string()));
    }
    check_limits(&batch)?;
    check_document(&batch).map_err(Rejection::InvalidDocument)?;
    Ok(batch)
}

fn why_unreadable(document: &[u8], error: &serde_json::Error) -> Rejection {
    let header: Header = match serde_json::from_slice(document) {
        Ok(header) => header,
        Err(header_error) => return Rejection::InvalidDocument(header_error.to_string()),
    };
    match header.format_version {
        None => Rejection::InvalidDocument("`formatVersion` is missing".to_owned()),
        Some(version) if version.as_u64() != Some(FORMAT_VERSION) => Rejection::FormatVersion(version.to_string()),
        Some(_) => Rejection::InvalidDocument(error.to_string()),
    }
}

fn check_limits(batch: &Batch) -> Result<(), Rejection> {
    for (name, count, limit) in
        [("cells", batch.cells.len(), CELLS), ("fixes", batch.fixes.len(), FIXES), ("snapshots", batch.snapshots.len(), SNAPSHOTS)]
    {
        if count > limit {
            return Err(Rejection::LimitExceeded(format!("{count} {name}, more than {limit}")));
        }
    }
    let times = batch.fixes.iter().map(|fix| fix.t).chain(batch.snapshots.iter().map(|snapshot| snapshot.t));
    let (earliest, latest) = times.fold((u64::MAX, 0), |(earliest, latest), t| (earliest.min(t), latest.max(t)));
    let span = latest.saturating_sub(earliest);
    if span > SPAN_MILLIS {
        return Err(Rejection::LimitExceeded(format!("it spans {span} ms, more than {SPAN_MILLIS}")));
    }
    Ok(())
}

fn check_document(batch: &Batch) -> Result<(), String> {
    require(is_uuid(&batch.upload_id, Some(b'7')), "`uploadId` must be a UUID v7")?;
    require(is_uuid(&batch.device_id, None), "`deviceId` must be a UUID")?;
    require(batch.app.version_code > 0, "`app.versionCode` must be positive")?;
    require(is_text(&batch.app.version_name, NAME_MAX_LENGTH), format_args!("`app.versionName` must have 1 to {NAME_MAX_LENGTH} characters"))?;
    require(batch.os.sdk_int > 0, "`os.sdkInt` must be positive")?;
    require(batch.os.security_patch.as_deref().is_none_or(is_iso_date), "`os.securityPatch` must be a date")?;
    require(
        batch.os.radio_version.as_deref().is_none_or(|version| is_text(version, RADIO_VERSION_MAX_LENGTH)),
        format_args!("`os.radioVersion` must have 1 to {RADIO_VERSION_MAX_LENGTH} characters"),
    )?;

    require(batch.sessions.len() <= SESSIONS_MAX, format_args!("`sessions` has more than {SESSIONS_MAX} entries"))?;
    for (index, session) in batch.sessions.iter().enumerate() {
        require(is_uuid(&session.id, None), format_args!("`sessions[{index}].id` must be a UUID"))?;
    }

    require(batch.sims.len() <= SIMS_MAX, format_args!("`sims` has more than {SIMS_MAX} entries"))?;
    for (index, sim) in batch.sims.iter().enumerate() {
        require(is_optional_plmn(sim.sim_plmn.as_deref()), format_args!("`sims[{index}].simPlmn` must be a network code"))?;
        require(is_optional_plmn(sim.registered_plmn.as_deref()), format_args!("`sims[{index}].registeredPlmn` must be a network code"))?;
    }

    require((1..=READERS_MAX).contains(&batch.readers.len()), format_args!("`readers` must have 1 to {READERS_MAX} entries"))?;
    for (index, reader) in batch.readers.iter().enumerate() {
        require(
            is_text(&reader.name, READER_NAME_MAX_LENGTH),
            format_args!("`readers[{index}].name` must have 1 to {READER_NAME_MAX_LENGTH} characters"),
        )?;
        require(is_text(&reader.version, NAME_MAX_LENGTH), format_args!("`readers[{index}].version` must have 1 to {NAME_MAX_LENGTH} characters"))?;
    }

    for (index, cell) in batch.cells.iter().enumerate() {
        check_cell(cell).map_err(|problem| format!("`cells[{index}]`: {problem}"))?;
    }

    for (index, fix) in batch.fixes.iter().enumerate() {
        let accuracies =
            [Some(fix.accuracy_meters), fix.vertical_accuracy_meters, fix.speed_accuracy_meters_per_second, fix.bearing_accuracy_degrees];
        require(accuracies.into_iter().flatten().all(|accuracy| accuracy >= 0.0), format_args!("`fixes[{index}]` has a negative accuracy"))?;
    }

    for (index, snapshot) in batch.snapshots.iter().enumerate() {
        require(is_optional_plmn(snapshot.registered_plmn.as_deref()), format_args!("`snapshots[{index}].registeredPlmn` must be a network code"))?;
        require(snapshot.reader < batch.readers.len(), format_args!("`snapshots[{index}]` points at a reader that is not in `readers`"))?;
        require(snapshot.measurements.len() <= MEASUREMENTS_MAX, format_args!("`snapshots[{index}]` has more than {MEASUREMENTS_MAX} measurements"))?;
        for measurement in &snapshot.measurements {
            check_measurement(measurement, batch.cells.len()).map_err(|problem| format!("`snapshots[{index}]`: {problem}"))?;
        }
    }

    let events = batch.events.as_deref().unwrap_or_default();
    require(events.len() <= EVENTS_MAX, format_args!("`events` has more than {EVENTS_MAX} entries"))?;
    for (index, event) in events.iter().enumerate() {
        check_event(event).map_err(|problem| format!("`events[{index}]`: {problem}"))?;
    }
    Ok(())
}

fn check_cell(cell: &Cell) -> Result<(), String> {
    let bandwidths_khz = match cell {
        Cell::Lte(lte) => [lte.bandwidth_khz, lte.ul_bandwidth_khz],
        Cell::Nr(nr) => [nr.bandwidth_khz, nr.ul_bandwidth_khz],
        Cell::Gsm(_) | Cell::Umts(_) => [None, None],
    };
    require(bandwidths_khz.into_iter().flatten().all(|khz| khz > 0), "a bandwidth must be positive")?;
    check_cell_common(cell.common())
}

fn check_cell_common(common: &CellCommon) -> Result<(), String> {
    require(is_optional_plmn(common.plmn.as_deref()), "`plmn` must be a network code")?;
    require(is_plmn_list(common.additional_plmns.as_deref()), format_args!("`additionalPlmns` must hold at most {NETWORKS_MAX} network codes"))?;
    require(
        is_plmn_list(common.reserved_for_operator_use_plmns.as_deref()),
        format_args!("`reservedForOperatorUsePlmns` must hold at most {NETWORKS_MAX} network codes"),
    )?;
    require(is_band_list(common.bands.as_deref()), format_args!("`bands` must hold at most {BANDS_MAX} positive band numbers"))?;
    check_provenance(common.derived.as_deref(), common.corrected.as_ref())
}

fn check_measurement(measurement: &Measurement, cell_count: usize) -> Result<(), String> {
    require(measurement.cell < cell_count, "a measurement points at a cell that is not in `cells`")?;
    check_provenance(measurement.derived.as_deref(), measurement.corrected.as_ref())
}

fn check_event(event: &Event) -> Result<(), String> {
    match event {
        Event::ReaderDiff { fields, .. } => {
            require(fields.keys().all(|field| is_field_name(field)), format_args!("`fields` must name fields of 1 to {NAME_MAX_LENGTH} characters"))
        }
        Event::BandLock { bands, .. } => {
            require(is_band_list(Some(bands.as_slice())), format_args!("`bands` must hold at most {BANDS_MAX} positive band numbers"))
        }
        _ => Ok(()),
    }
}

fn check_provenance(derived: Option<&[String]>, corrected: Option<&BTreeMap<String, String>>) -> Result<(), String> {
    let derived = derived.unwrap_or_default();
    require(
        derived.len() <= FIELD_LIST_MAX && derived.iter().all(|field| is_field_name(field)),
        format_args!("`derived` must list at most {FIELD_LIST_MAX} field names"),
    )?;
    require(
        corrected.into_iter().flatten().all(|(field, rule)| is_field_name(field) && is_field_name(rule)),
        format_args!("`corrected` must map field names to rule ids of 1 to {NAME_MAX_LENGTH} characters"),
    )
}

fn require(holds: bool, problem: impl Display) -> Result<(), String> {
    if holds { Ok(()) } else { Err(problem.to_string()) }
}

fn utf16_length(value: &str) -> usize {
    value.encode_utf16().count()
}

fn is_text(value: &str, max_length: usize) -> bool {
    (1..=max_length).contains(&utf16_length(value.trim()))
}

fn is_field_name(value: &str) -> bool {
    (1..=NAME_MAX_LENGTH).contains(&utf16_length(value))
}

fn is_plmn(value: &str) -> bool {
    (5..=6).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_optional_plmn(value: Option<&str>) -> bool {
    value.is_none_or(is_plmn)
}

fn is_plmn_list(plmns: Option<&[String]>) -> bool {
    plmns.is_none_or(|plmns| plmns.len() <= NETWORKS_MAX && plmns.iter().all(|plmn| is_plmn(plmn)))
}

fn is_band_list(bands: Option<&[i64]>) -> bool {
    bands.is_none_or(|bands| bands.len() <= BANDS_MAX && bands.iter().all(|band| *band > 0))
}

fn is_uuid(value: &str, version: Option<u8>) -> bool {
    let bytes = value.as_bytes();
    let is_shaped = bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        });
    if !is_shaped {
        return false;
    }
    let has_version = match version {
        Some(version) => bytes[14] == version,
        None => matches!(bytes[14], b'1'..=b'8'),
    };
    has_version && matches!(bytes[19], b'8' | b'9' | b'a' | b'b' | b'A' | b'B')
}

fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let number = |digits: &[u8]| digits.iter().try_fold(0, |total: u32, byte| byte.is_ascii_digit().then(|| total * 10 + u32::from(byte - b'0')));
    let (Some(year), Some(month), Some(day)) = (number(&bytes[0..4]), number(&bytes[5..7]), number(&bytes[8..10])) else {
        return false;
    };
    (1..=days_in_month(year, month)).contains(&day)
}

fn days_in_month(year: u32, month: u32) -> u32 {
    let is_leap_year = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year => 29,
        2 => 28,
        _ => 0,
    }
}
