use std::collections::{BTreeMap, BTreeSet};

use engine_batch::document::ReaderSource;
use serde::Serialize;

use crate::calendar::Day;
use crate::deltas::TrailSquareKey;
use crate::identity::{CellIdentity, Rat};
use crate::inputs::ReaderVersion;

pub const DISTANCE_BUCKET_M: f64 = 10.0;
const VALUE_BYTES: u32 = 2;
const NR_AREA_CODE_BYTES: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub enum DropReason {
    MockLocation,
    PoorAccuracy,
    ImplausibleFix,
    NoPosition,
    BadTime,
    TooOld,
    Duplicate,
    Implausible,
    ClosedCountry,
    ReadingBlock,
    NoLevel,
    NoIdentity,
}

impl DropReason {
    pub const ALL: [Self; 12] = [
        Self::MockLocation,
        Self::PoorAccuracy,
        Self::ImplausibleFix,
        Self::NoPosition,
        Self::BadTime,
        Self::TooOld,
        Self::Duplicate,
        Self::Implausible,
        Self::ClosedCountry,
        Self::ReadingBlock,
        Self::NoLevel,
        Self::NoIdentity,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::MockLocation => "mockLocation",
            Self::PoorAccuracy => "poorAccuracy",
            Self::ImplausibleFix => "implausibleFix",
            Self::NoPosition => "noPosition",
            Self::BadTime => "badTime",
            Self::TooOld => "tooOld",
            Self::Duplicate => "duplicate",
            Self::Implausible => "implausible",
            Self::ClosedCountry => "closedCountry",
            Self::ReadingBlock => "readingBlock",
            Self::NoLevel => "noLevel",
            Self::NoIdentity => "noIdentity",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct BoundingBox {
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct ReaderReport {
    pub source: Option<ReaderSource>,
    pub rules_version: Option<u32>,
    pub snapshot_count: i64,
    pub derived_values: i64,
    pub ta_on_confirmed: i64,
    pub ta_within_tolerance: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct TaResidualKey {
    pub source: ReaderSource,
    pub rat: Rat,
    pub station_id: i32,
    pub timing_advance: i16,
    pub distance_bucket: i16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub enum CheckedField {
    Pci,
    Channel,
    AreaCode,
}

impl CheckedField {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pci => "pci",
            Self::Channel => "channel",
            Self::AreaCode => "areaCode",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Agreement {
    pub agreed: i64,
    pub differed: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub enum ValuePattern {
    BytesSwapped,
    Factor,
    Offset,
    Constant,
}

impl ValuePattern {
    pub const ALL: [Self; 4] = [Self::BytesSwapped, Self::Factor, Self::Offset, Self::Constant];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::BytesSwapped => "bytesSwapped",
            Self::Factor => "factor",
            Self::Offset => "offset",
            Self::Constant => "constant",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct ValuePatternKey {
    pub reader: ReaderVersion,
    pub field: CheckedField,
    pub pattern: ValuePattern,
    pub parameter: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct PatternCount {
    pub value_count: i64,
    pub cells: BTreeSet<CellIdentity>,
}

pub fn pattern_of(field: CheckedField, rat: Rat, ours: i64, reported: i64) -> (ValuePattern, i64) {
    let byte_count = if field == CheckedField::AreaCode && rat == Rat::Nr { NR_AREA_CODE_BYTES } else { VALUE_BYTES };
    if bytes_reversed(ours, byte_count) == Some(reported) {
        return (ValuePattern::BytesSwapped, 0);
    }
    let (smaller, larger) = (ours.min(reported), ours.max(reported));
    if smaller > 0 && larger % smaller == 0 {
        let factor = larger / smaller;
        return (ValuePattern::Factor, if reported > ours { factor } else { -factor });
    }
    (ValuePattern::Offset, reported - ours)
}

fn bytes_reversed(value: i64, byte_count: u32) -> Option<i64> {
    if !(0..1_i64 << (8 * byte_count)).contains(&value) {
        return None;
    }
    Some((0..byte_count).fold(0_i64, |reversed, byte| (reversed << 8) | ((value >> (8 * byte)) & 0xFF)))
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct BlockedCounts {
    pub held: i64,
    pub dropped: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Correction {
    pub reader_name: String,
    pub value_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct SquareOrigin {
    pub country_code: String,
    pub month: Day,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct FoldReport {
    pub snapshot_count: i64,
    pub sample_count: i64,
    pub distance_only_count: i64,
    pub drops: BTreeMap<DropReason, i64>,
    pub first_reading_millis: Option<i64>,
    pub last_reading_millis: Option<i64>,
    pub bounding_box: Option<BoundingBox>,
    pub wall_clock_error_millis: Option<i64>,
    #[serde(serialize_with = "crate::deltas::entries")]
    pub readers: BTreeMap<ReaderVersion, ReaderReport>,
    pub corrections: BTreeMap<String, Correction>,
    pub skipped_rules: BTreeSet<String>,
    pub blocked_values: BTreeMap<i16, BlockedCounts>,
    pub closed_countries: BTreeSet<String>,
    #[serde(serialize_with = "crate::deltas::entries")]
    pub trail_square_origins: BTreeMap<TrailSquareKey, SquareOrigin>,
    #[serde(serialize_with = "crate::deltas::entries")]
    pub ta_residuals: BTreeMap<TaResidualKey, i64>,
    #[serde(serialize_with = "crate::deltas::entries")]
    pub value_checks: BTreeMap<(ReaderVersion, CheckedField), Agreement>,
    #[serde(serialize_with = "crate::deltas::entries")]
    pub value_patterns: BTreeMap<ValuePatternKey, PatternCount>,
}

impl FoldReport {
    pub fn kept_samples(&self) -> i64 {
        self.sample_count - self.drops.values().sum::<i64>()
    }

    pub(crate) fn drop(&mut self, reason: DropReason) {
        *self.drops.entry(reason).or_insert(0) += 1;
    }

    pub(crate) fn correct(&mut self, rule: &str, reader_name: &str) {
        let correction = self.corrections.entry(rule.to_owned()).or_insert_with(|| Correction { reader_name: reader_name.to_owned(), value_count: 0 });
        correction.value_count += 1;
    }

    pub(crate) fn note_difference(&mut self, reader: &ReaderVersion, field: CheckedField, cell: &CellIdentity, ours: i64, reported: i64) {
        for (pattern, parameter) in [pattern_of(field, cell.rat, ours, reported), (ValuePattern::Constant, reported)] {
            let count = self.value_patterns.entry(ValuePatternKey { reader: reader.clone(), field, pattern, parameter }).or_default();
            count.value_count += 1;
            count.cells.insert(cell.clone());
        }
    }
}
