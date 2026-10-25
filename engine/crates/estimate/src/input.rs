use std::collections::BTreeMap;

use crate::calibration::{AreaClass, LevelModel};
use crate::error_model::{ErrorModel, ErrorTable};
use crate::timing_advance::{GSM_STEP_M, LTE_STEP_M, NR_MODEM_STEP_M};

pub const CENTI_PER_UNIT: f64 = 100.0;
const UNCALIBRATED_ELLIPSE_SCALE: f64 = 1.5;
const MUCH_TIMING_ADVANCE_SAMPLES: i64 = 50;
const GSM_REACH_M: f64 = 35_000.0;
const UMTS_REACH_M: f64 = 60_000.0;
const LTE_AND_NR_REACH_M: f64 = 100_000.0;
const UNCALIBRATED_ERROR_MODELS: [(Technology, ErrorModel); 3] = [
    (Technology::Lte, ErrorModel::LTE_AND_NR_DEFAULT),
    (Technology::Nr, ErrorModel::LTE_AND_NR_DEFAULT),
    (Technology::Gsm, ErrorModel::GSM_DEFAULT),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Technology {
    Gsm,
    Umts,
    Lte,
    Nr,
}

impl Technology {
    pub(crate) fn reach_m(self) -> f64 {
        match self {
            Self::Gsm => GSM_REACH_M,
            Self::Umts => UMTS_REACH_M,
            Self::Lte | Self::Nr => LTE_AND_NR_REACH_M,
        }
    }

    pub fn timing_advance_step_m(self) -> Option<f64> {
        match self {
            Self::Gsm => Some(GSM_STEP_M),
            Self::Umts => None,
            Self::Lte => Some(LTE_STEP_M),
            Self::Nr => Some(NR_MODEM_STEP_M),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Site {
    pub cells: Vec<Cell>,
    pub handovers: Vec<Handover>,
    pub contributor_count: i32,
    pub person_count: i32,
}

impl Site {
    pub(crate) fn last_seen_on(&self) -> Option<i32> {
        let bins = self.cells.iter().flat_map(|cell| cell.bins.iter().map(|bin| bin.last_seen_on));
        let timing_advance = self.cells.iter().flat_map(|cell| cell.timing_advance.iter().map(|row| row.last_seen_on));
        bins.chain(timing_advance).max()
    }
}

#[derive(Debug, Clone)]
pub struct Cell {
    pub key: i64,
    pub technology: Technology,
    pub area_class: AreaClass,
    pub channel: Option<i32>,
    pub bins: Vec<Bin>,
    pub timing_advance: Vec<TimingAdvance>,
}

#[derive(Debug, Clone, Copy)]
pub struct Bin {
    pub square: u64,
    pub sample_count: i64,
    pub weight_milli: i64,
    pub serving_weight_milli: i64,
    pub level_wsum: i64,
    pub offset_x_wsum: i64,
    pub offset_y_wsum: i64,
    pub quality_weight_milli: i64,
    pub quality_wsum: i64,
    pub sinr_weight_milli: i64,
    pub sinr_wsum: i64,
    pub stationary_count: i64,
    pub first_seen_on: i32,
    pub last_seen_on: i32,
}

impl Bin {
    pub(crate) fn may_be_shown(&self) -> bool {
        self.stationary_count * 2 < self.sample_count
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TimingAdvance {
    pub square: u64,
    pub distance_m: f64,
    pub sample_count: i64,
    pub weight_milli: i64,
    pub last_seen_on: i32,
    pub error_model: usize,
}

#[derive(Debug, Clone, Copy)]
pub struct Handover {
    pub from_cell: usize,
    pub to_cell: usize,
    pub square: u64,
    pub weight_milli: i64,
    pub last_seen_on: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum EvidenceClass {
    LittleTaOnePerson,
    LittleTaPeople,
    CoarseTaOnePerson,
    CoarseTaPeople,
    MuchTaOnePerson,
    MuchTaPeople,
}

impl EvidenceClass {
    pub const ALL: [Self; 6] = [
        Self::LittleTaOnePerson,
        Self::LittleTaPeople,
        Self::CoarseTaOnePerson,
        Self::CoarseTaPeople,
        Self::MuchTaOnePerson,
        Self::MuchTaPeople,
    ];

    pub fn of(ta_sample_count: i64, gsm_ta_sample_count: i64, person_count: i32) -> Self {
        let is_much = |sample_count: i64| sample_count >= MUCH_TIMING_ADVANCE_SAMPLES;
        let lte_and_nr_ta_sample_count = ta_sample_count - gsm_ta_sample_count;
        match (is_much(lte_and_nr_ta_sample_count), is_much(gsm_ta_sample_count), person_count >= 2) {
            (false, false, false) => Self::LittleTaOnePerson,
            (false, false, true) => Self::LittleTaPeople,
            (false, true, false) => Self::CoarseTaOnePerson,
            (false, true, true) => Self::CoarseTaPeople,
            (true, _, false) => Self::MuchTaOnePerson,
            (true, _, true) => Self::MuchTaPeople,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::LittleTaOnePerson => "littleTaOnePerson",
            Self::LittleTaPeople => "littleTaPeople",
            Self::CoarseTaOnePerson => "coarseTaOnePerson",
            Self::CoarseTaPeople => "coarseTaPeople",
            Self::MuchTaOnePerson => "muchTaOnePerson",
            Self::MuchTaPeople => "muchTaPeople",
        }
    }

    pub fn of_label(label: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|class| class.label() == label)
    }
}

pub struct Context {
    pub error_tables: Vec<ErrorTable>,
    pub ellipse_scales: [[f64; 2]; EvidenceClass::ALL.len()],
    pub level_models: BTreeMap<(Technology, AreaClass), LevelModel>,
}

impl Context {
    pub fn uncalibrated() -> Self {
        Self {
            error_tables: UNCALIBRATED_ERROR_MODELS.into_iter().map(|(_, model)| ErrorTable::new(model)).collect(),
            ellipse_scales: [[UNCALIBRATED_ELLIPSE_SCALE; 2]; EvidenceClass::ALL.len()],
            level_models: BTreeMap::new(),
        }
    }

    pub fn uncalibrated_error_table(technology: Technology) -> Option<usize> {
        UNCALIBRATED_ERROR_MODELS.iter().position(|&(listed, _)| listed == technology)
    }

    pub(crate) fn ellipse_scale(&self, class: EvidenceClass, is_surrounded: bool) -> f64 {
        self.ellipse_scales[class as usize][usize::from(is_surrounded)]
    }

    pub(crate) fn level_model(&self, technology: Technology, area_class: AreaClass) -> LevelModel {
        self.level_models
            .get(&(technology, area_class))
            .copied()
            .unwrap_or(LevelModel::UNCALIBRATED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gsm_timing_advance_is_coarse_and_never_makes_the_evidence_much() {
        let much = MUCH_TIMING_ADVANCE_SAMPLES;
        assert_eq!(EvidenceClass::of(much, much, 2), EvidenceClass::CoarseTaPeople);
        assert_eq!(
            EvidenceClass::of(2 * much - 1, much, 1),
            EvidenceClass::CoarseTaOnePerson,
            "too few LTE and NR samples beside the GSM ones"
        );
        assert_eq!(EvidenceClass::of(2 * much, much, 2), EvidenceClass::MuchTaPeople);
        assert_eq!(EvidenceClass::of(much - 1, much - 1, 1), EvidenceClass::LittleTaOnePerson);
    }
}
