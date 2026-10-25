use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, BTreeSet};

use serde::{Serialize, Serializer};

use crate::calendar::Day;
use crate::identity::{CellIdentity, Rat};
use crate::inputs::ReaderVersion;

pub(crate) fn entries<S: Serializer, K: Serialize, V: Serialize>(map: &BTreeMap<K, V>, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.collect_seq(map.iter())
}

pub(crate) trait Row: Clone {
    fn absorb(&mut self, other: &Self);
    fn give_back(&mut self, other: &Self);
    fn is_spent(&self) -> bool;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Seen {
    pub first: Day,
    pub last: Day,
}

impl Seen {
    pub fn on(day: Day) -> Self {
        Self { first: day, last: day }
    }

    fn absorb(&mut self, other: &Self) {
        self.first = self.first.min(other.first);
        self.last = self.last.max(other.last);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub enum ValueKind {
    AreaCode,
    Pci,
    Channel,
    Bandwidth,
    ReportedBand,
    UlChannel,
    UlBandwidth,
    EndcAvailable,
    AccessClosed,
    Barred,
    Reserved,
}

impl ValueKind {
    pub const ALL: [Self; 11] = [
        Self::AreaCode,
        Self::Pci,
        Self::Channel,
        Self::Bandwidth,
        Self::ReportedBand,
        Self::UlChannel,
        Self::UlBandwidth,
        Self::EndcAvailable,
        Self::AccessClosed,
        Self::Barred,
        Self::Reserved,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::AreaCode => "areaCode",
            Self::Pci => "pci",
            Self::Channel => "channel",
            Self::Bandwidth => "bandwidth",
            Self::ReportedBand => "reportedBand",
            Self::UlChannel => "ulChannel",
            Self::UlBandwidth => "ulBandwidth",
            Self::EndcAvailable => "endcAvailable",
            Self::AccessClosed => "accessClosed",
            Self::Barred => "barred",
            Self::Reserved => "reserved",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct CellBinKey {
    pub cell: CellIdentity,
    pub bin: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CellBin {
    pub sample_count: i64,
    pub weight_milli: i64,
    pub serving_weight_milli: i64,
    pub level_wsum: i64,
    pub level_wsq: i64,
    pub quality_weight_milli: i64,
    pub quality_wsum: i64,
    pub sinr_weight_milli: i64,
    pub sinr_wsum: i64,
    pub sinr_wsq: i64,
    pub offset_x_wsum: i64,
    pub offset_y_wsum: i64,
    pub stationary_count: i64,
    pub contributor_bits: u64,
    pub seen: Seen,
}

impl Row for CellBin {
    fn absorb(&mut self, other: &Self) {
        self.add(other, 1);
        self.contributor_bits |= other.contributor_bits;
        self.seen.absorb(&other.seen);
    }

    fn give_back(&mut self, other: &Self) {
        self.add(other, -1);
    }

    fn is_spent(&self) -> bool {
        self.sample_count == 0
    }
}

impl CellBin {
    fn add(&mut self, other: &Self, sign: i64) {
        self.sample_count += sign * other.sample_count;
        self.weight_milli += sign * other.weight_milli;
        self.serving_weight_milli += sign * other.serving_weight_milli;
        self.level_wsum += sign * other.level_wsum;
        self.level_wsq += sign * other.level_wsq;
        self.quality_weight_milli += sign * other.quality_weight_milli;
        self.quality_wsum += sign * other.quality_wsum;
        self.sinr_weight_milli += sign * other.sinr_weight_milli;
        self.sinr_wsum += sign * other.sinr_wsum;
        self.sinr_wsq += sign * other.sinr_wsq;
        self.offset_x_wsum += sign * other.offset_x_wsum;
        self.offset_y_wsum += sign * other.offset_y_wsum;
        self.stationary_count += sign * other.stationary_count;
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct CellTaBinKey {
    pub cell: CellIdentity,
    pub bin: u64,
    pub ta_group_id: i16,
    pub timing_advance: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CellTaBin {
    pub sample_count: i64,
    pub weight_milli: i64,
    pub last_seen_on: Day,
}

impl Row for CellTaBin {
    fn absorb(&mut self, other: &Self) {
        self.sample_count += other.sample_count;
        self.weight_milli += other.weight_milli;
        self.last_seen_on = self.last_seen_on.max(other.last_seen_on);
    }

    fn give_back(&mut self, other: &Self) {
        self.sample_count -= other.sample_count;
        self.weight_milli -= other.weight_milli;
    }

    fn is_spent(&self) -> bool {
        self.sample_count == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct CellValueKey {
    pub cell: CellIdentity,
    pub field: ValueKind,
    pub value: i64,
    pub held: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Sighting {
    pub sample_count: i64,
    pub contributor_bits: u64,
    pub seen: Seen,
}

impl Row for Sighting {
    fn absorb(&mut self, other: &Self) {
        self.sample_count += other.sample_count;
        self.contributor_bits |= other.contributor_bits;
        self.seen.absorb(&other.seen);
    }

    fn give_back(&mut self, other: &Self) {
        self.sample_count -= other.sample_count;
    }

    fn is_spent(&self) -> bool {
        self.sample_count == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct CellNetworkKey {
    pub cell: CellIdentity,
    pub plmn: String,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct CellContributorKey {
    pub cell: CellIdentity,
    pub device_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Contribution {
    pub sample_count: i64,
    pub trip_count: i64,
    pub seen: Seen,
}

impl Row for Contribution {
    fn absorb(&mut self, other: &Self) {
        self.sample_count += other.sample_count;
        self.trip_count += other.trip_count;
        self.seen.absorb(&other.seen);
    }

    fn give_back(&mut self, other: &Self) {
        self.sample_count -= other.sample_count;
        self.trip_count -= other.trip_count;
    }

    fn is_spent(&self) -> bool {
        self.sample_count == 0 && self.trip_count == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct CellReaderKey {
    pub cell: CellIdentity,
    pub reader: ReaderVersion,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Count {
    pub sample_count: i64,
}

impl Row for Count {
    fn absorb(&mut self, other: &Self) {
        self.sample_count += other.sample_count;
    }

    fn give_back(&mut self, other: &Self) {
        self.sample_count -= other.sample_count;
    }

    fn is_spent(&self) -> bool {
        self.sample_count == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct HandoverKey {
    pub from: CellIdentity,
    pub to: CellIdentity,
    pub bin: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Handover {
    pub handover_count: i64,
    pub weight_milli: i64,
    pub last_seen_on: Day,
}

impl Row for Handover {
    fn absorb(&mut self, other: &Self) {
        self.handover_count += other.handover_count;
        self.weight_milli += other.weight_milli;
        self.last_seen_on = self.last_seen_on.max(other.last_seen_on);
    }

    fn give_back(&mut self, other: &Self) {
        self.handover_count -= other.handover_count;
        self.weight_milli -= other.weight_milli;
    }

    fn is_spent(&self) -> bool {
        self.handover_count == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct TransitionKey {
    pub from: CellIdentity,
    pub to: CellIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Transition {
    pub transition_count: i64,
    pub last_seen_on: Day,
}

impl Row for Transition {
    fn absorb(&mut self, other: &Self) {
        self.transition_count += other.transition_count;
        self.last_seen_on = self.last_seen_on.max(other.last_seen_on);
    }

    fn give_back(&mut self, other: &Self) {
        self.transition_count -= other.transition_count;
    }

    fn is_spent(&self) -> bool {
        self.transition_count == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct NeighbourKey {
    pub plmn: String,
    pub rat: Rat,
    pub channel: i64,
    pub pci: i64,
    pub bin: u64,
    pub held: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LevelSighting {
    pub sample_count: i64,
    pub weight_milli: i64,
    pub level_wsum: i64,
    pub contributor_bits: u64,
    pub seen: Seen,
}

impl Row for LevelSighting {
    fn absorb(&mut self, other: &Self) {
        self.sample_count += other.sample_count;
        self.weight_milli += other.weight_milli;
        self.level_wsum += other.level_wsum;
        self.contributor_bits |= other.contributor_bits;
        self.seen.absorb(&other.seen);
    }

    fn give_back(&mut self, other: &Self) {
        self.sample_count -= other.sample_count;
        self.weight_milli -= other.weight_milli;
        self.level_wsum -= other.level_wsum;
    }

    fn is_spent(&self) -> bool {
        self.sample_count == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct NsaKey {
    pub anchor: CellIdentity,
    pub nr_arfcn: i64,
    pub nr_pci: i64,
    pub held: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct PairKey {
    pub first: CellIdentity,
    pub second: CellIdentity,
    pub held: bool,
}

pub const TRAIL_ZOOM: u8 = 20;
pub const PERSON_TRAIL_ZOOM: u8 = 18;
pub const NEIGHBOUR_ZOOM: u8 = 18;
pub const DIRTY_TILE_ZOOM: u8 = 12;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct TrailSquareKey {
    pub plmn: String,
    pub rat: Rat,
    pub channel: i64,
    pub zoom: u8,
    pub bin: u64,
    pub held: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TrailSquare {
    pub contributor_bits: u64,
    pub last_seen_on: Day,
}

impl Row for TrailSquare {
    fn absorb(&mut self, other: &Self) {
        self.contributor_bits |= other.contributor_bits;
        self.last_seen_on = self.last_seen_on.max(other.last_seen_on);
    }

    fn give_back(&mut self, _other: &Self) {}

    fn is_spent(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct TrailLevelKey {
    pub square: TrailSquareKey,
    pub level_bucket: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct PersonTrailKey {
    pub user_id: String,
    pub plmn: String,
    pub rat: Rat,
    pub bin: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PersonTrailBin {
    pub sample_count: i64,
    pub last_seen_on: Day,
}

impl Row for PersonTrailBin {
    fn absorb(&mut self, other: &Self) {
        self.sample_count += other.sample_count;
        self.last_seen_on = self.last_seen_on.max(other.last_seen_on);
    }

    fn give_back(&mut self, other: &Self) {
        self.sample_count -= other.sample_count;
    }

    fn is_spent(&self) -> bool {
        self.sample_count == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct ContributorMonthKey {
    pub user_id: String,
    pub country_code: String,
    pub month: Day,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Deltas {
    #[serde(serialize_with = "entries")]
    pub cell_bins: BTreeMap<CellBinKey, CellBin>,
    #[serde(serialize_with = "entries")]
    pub cell_ta_bins: BTreeMap<CellTaBinKey, CellTaBin>,
    #[serde(serialize_with = "entries")]
    pub cell_values: BTreeMap<CellValueKey, Sighting>,
    #[serde(serialize_with = "entries")]
    pub cell_networks: BTreeMap<CellNetworkKey, Sighting>,
    #[serde(serialize_with = "entries")]
    pub cell_contributors: BTreeMap<CellContributorKey, Contribution>,
    #[serde(serialize_with = "entries")]
    pub cell_readers: BTreeMap<CellReaderKey, Count>,
    #[serde(serialize_with = "entries")]
    pub handover_bins: BTreeMap<HandoverKey, Handover>,
    #[serde(serialize_with = "entries")]
    pub cell_transitions: BTreeMap<TransitionKey, Transition>,
    #[serde(serialize_with = "entries")]
    pub neighbour_bins: BTreeMap<NeighbourKey, LevelSighting>,
    #[serde(serialize_with = "entries")]
    pub nsa_links: BTreeMap<NsaKey, LevelSighting>,
    #[serde(serialize_with = "entries")]
    pub same_reading_pairs: BTreeMap<PairKey, Count>,
    #[serde(serialize_with = "entries")]
    pub trail_squares: BTreeMap<TrailSquareKey, TrailSquare>,
    #[serde(serialize_with = "entries")]
    pub trail_levels: BTreeMap<TrailLevelKey, Count>,
    #[serde(serialize_with = "entries")]
    pub person_trail_bins: BTreeMap<PersonTrailKey, PersonTrailBin>,
    #[serde(serialize_with = "entries")]
    pub contributor_months: BTreeMap<ContributorMonthKey, Count>,
}

pub(crate) fn absorb_into<K: Ord, V: Row>(table: &mut BTreeMap<K, V>, key: K, row: V) {
    match table.entry(key) {
        Entry::Occupied(existing) => existing.into_mut().absorb(&row),
        Entry::Vacant(vacant) => {
            vacant.insert(row);
        }
    }
}

impl Deltas {
    pub fn cells(&self) -> BTreeSet<CellIdentity> {
        let mut cells = BTreeSet::new();
        cells.extend(self.cell_bins.keys().map(|key| key.cell.clone()));
        cells.extend(self.cell_ta_bins.keys().map(|key| key.cell.clone()));
        cells.extend(self.cell_values.keys().map(|key| key.cell.clone()));
        cells.extend(self.cell_networks.keys().map(|key| key.cell.clone()));
        cells.extend(self.cell_contributors.keys().map(|key| key.cell.clone()));
        cells.extend(self.cell_readers.keys().map(|key| key.cell.clone()));
        cells.extend(self.handover_bins.keys().flat_map(|key| [key.from.clone(), key.to.clone()]));
        cells.extend(self.cell_transitions.keys().flat_map(|key| [key.from.clone(), key.to.clone()]));
        cells.extend(self.nsa_links.keys().map(|key| key.anchor.clone()));
        cells.extend(self.same_reading_pairs.keys().flat_map(|key| [key.first.clone(), key.second.clone()]));
        cells
    }

    pub fn retain_cells(&mut self, cells: &BTreeSet<CellIdentity>) {
        let reaches = |cell: &CellIdentity| cells.contains(cell);
        self.cell_bins.retain(|key, _| reaches(&key.cell));
        self.cell_ta_bins.retain(|key, _| reaches(&key.cell));
        self.cell_values.retain(|key, _| reaches(&key.cell));
        self.cell_networks.retain(|key, _| reaches(&key.cell));
        self.cell_contributors.retain(|key, _| reaches(&key.cell));
        self.cell_readers.retain(|key, _| reaches(&key.cell));
        self.handover_bins.retain(|key, _| reaches(&key.from) || reaches(&key.to));
        self.cell_transitions.retain(|key, _| reaches(&key.from) || reaches(&key.to));
        self.nsa_links.retain(|key, _| reaches(&key.anchor));
        self.same_reading_pairs.retain(|key, _| reaches(&key.first) || reaches(&key.second));
        self.neighbour_bins.clear();
        self.trail_squares.clear();
        self.trail_levels.clear();
        self.person_trail_bins.clear();
        self.contributor_months.clear();
    }

    pub fn trail_tiles(&self) -> BTreeSet<u64> {
        let shift = 2 * u32::from(TRAIL_ZOOM - DIRTY_TILE_ZOOM);
        self.trail_squares.keys().filter(|key| key.zoom == TRAIL_ZOOM).map(|key| key.bin >> shift).collect()
    }
}
