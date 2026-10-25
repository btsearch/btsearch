use std::collections::{BTreeMap, BTreeSet};

use engine_batch::document::ReaderSource;
use engine_estimate::timing_advance::{GSM_STEP_M, LTE_STEP_M, NR_MODEM_STEP_M};
use engine_geo::Point;
use engine_geo::outlines::CountryOutlines;
use serde::Serialize;

use crate::identity::{CellIdentity, Rat};

pub const FOLD_VERSION: i16 = 1;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub struct ReaderVersion {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub enum BlockRole {
    Serving,
    Neighbour,
    Nsa,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub enum BlockField {
    Pci,
    Channel,
    AreaCode,
    Bandwidth,
    TimingAdvance,
    Signal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub enum BlockMode {
    Drop,
    Corroborate,
}

#[derive(Debug, Clone)]
pub struct ReadingBlock {
    pub id: i16,
    pub reader_version: Option<ReaderVersion>,
    pub rats: Option<Vec<Rat>>,
    pub roles: Option<Vec<BlockRole>>,
    pub fields: Option<Vec<BlockField>>,
    pub mode: BlockMode,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConfirmedCell {
    pub station_id: i32,
    pub station: Point,
    pub pci: Option<i64>,
    pub channel: Option<i64>,
    pub area_code: Option<i64>,
}

pub fn uncalibrated_step_m(rat: Rat, source: ReaderSource) -> Option<f64> {
    match (rat, source) {
        (Rat::Gsm, _) => Some(GSM_STEP_M),
        (Rat::Lte, _) => Some(LTE_STEP_M),
        (Rat::Nr, ReaderSource::ModemLog | ReaderSource::ModemPoll) => Some(NR_MODEM_STEP_M),
        _ => None,
    }
}

pub struct FoldInputs<'a> {
    pub received_at_millis: i64,
    pub device_id: String,
    pub user_id: Option<String>,
    pub device_weight_milli: i64,
    pub ta_groups: BTreeMap<ReaderSource, i16>,
    pub outlines: &'a CountryOutlines,
    pub closed_countries: BTreeSet<String>,
    pub blocked_quirk_rules: BTreeSet<String>,
    pub reading_blocks: Vec<ReadingBlock>,
    pub confirmed_cells: BTreeMap<CellIdentity, ConfirmedCell>,
}
