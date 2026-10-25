use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Batch {
    pub format_version: u64,
    pub upload_id: String,
    pub device_id: String,
    pub app: App,
    pub os: Os,
    pub clock: Clock,
    pub sessions: Vec<Session>,
    pub starts_mid_trip: Option<bool>,
    pub ends_mid_trip: Option<bool>,
    pub sims: Vec<Sim>,
    pub readers: Vec<Reader>,
    pub cells: Vec<Cell>,
    pub fixes: Vec<Fix>,
    pub snapshots: Vec<Snapshot>,
    pub events: Option<Vec<Event>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct App {
    pub version_code: u32,
    pub version_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Os {
    pub sdk_int: u32,
    pub security_patch: Option<String>,
    pub radio_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clock {
    pub elapsed_realtime_millis: u64,
    pub epoch_millis: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Session {
    pub id: String,
    pub mode: SessionMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionMode {
    Passive,
    Active,
    Survey,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sim {
    pub slot: u32,
    pub sim_plmn: Option<String>,
    pub registered_plmn: Option<String>,
    pub is_roaming: Option<bool>,
    pub is_data_sim: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reader {
    pub name: String,
    pub version: String,
    pub source: ReaderSource,
    pub uses_shizuku: Option<bool>,
    pub rules: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReaderSource {
    Api,
    ModemLog,
    ModemPoll,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Technology {
    Gsm,
    Umts,
    Lte,
    Nr,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "rat", rename_all = "lowercase")]
pub enum Cell {
    Gsm(GsmCell),
    Umts(UmtsCell),
    Lte(LteCell),
    Nr(NrCell),
}

impl Cell {
    pub fn technology(&self) -> Technology {
        match self {
            Self::Gsm(_) => Technology::Gsm,
            Self::Umts(_) => Technology::Umts,
            Self::Lte(_) => Technology::Lte,
            Self::Nr(_) => Technology::Nr,
        }
    }

    pub fn common(&self) -> &CellCommon {
        match self {
            Self::Gsm(cell) => &cell.common,
            Self::Umts(cell) => &cell.common,
            Self::Lte(cell) => &cell.common,
            Self::Nr(cell) => &cell.common,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellCommon {
    pub plmn: Option<String>,
    pub additional_plmns: Option<Vec<String>>,
    pub bands: Option<Vec<i64>>,
    pub is_barred: Option<bool>,
    pub reserved_for_operator_use_plmns: Option<Vec<String>>,
    pub derived: Option<Vec<String>>,
    pub corrected: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GsmCell {
    pub lac: Option<i64>,
    pub cid: Option<i64>,
    pub arfcn: Option<i64>,
    pub bsic: Option<i64>,
    #[serde(flatten)]
    pub common: CellCommon,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UmtsCell {
    pub lac: Option<i64>,
    pub long_cid: Option<i64>,
    pub uarfcn: Option<i64>,
    pub psc: Option<i64>,
    #[serde(flatten)]
    pub common: CellCommon,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LteCell {
    pub eci: Option<i64>,
    pub tac: Option<i64>,
    pub earfcn: Option<i64>,
    pub pci: Option<i64>,
    pub bandwidth_khz: Option<i64>,
    pub ul_earfcn: Option<i64>,
    pub ul_bandwidth_khz: Option<i64>,
    pub supports_endc: Option<bool>,
    pub tdd: Option<LteTdd>,
    #[serde(flatten)]
    pub common: CellCommon,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NrCell {
    pub nci: Option<i64>,
    pub tac: Option<i64>,
    pub arfcn: Option<i64>,
    pub pci: Option<i64>,
    pub bandwidth_khz: Option<i64>,
    pub ul_arfcn: Option<i64>,
    pub ul_bandwidth_khz: Option<i64>,
    pub tdd: Option<NrTdd>,
    #[serde(flatten)]
    pub common: CellCommon,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LteTdd {
    pub subframe_assignment: i64,
    pub special_subframe_patterns: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NrTdd {
    pub reference_scs_khz: i64,
    pub period_micros: i64,
    pub downlink_slots: i64,
    pub downlink_symbols: i64,
    pub uplink_slots: i64,
    pub uplink_symbols: i64,
    pub pattern2: Option<NrTddPattern>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NrTddPattern {
    pub period_micros: i64,
    pub downlink_slots: i64,
    pub downlink_symbols: i64,
    pub uplink_slots: i64,
    pub uplink_symbols: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fix {
    pub t: u64,
    pub gnss_time_millis: i64,
    pub latitude: f64,
    pub longitude: f64,
    pub accuracy_meters: f64,
    pub altitude_meters: Option<f64>,
    pub vertical_accuracy_meters: Option<f64>,
    pub speed_meters_per_second: Option<f64>,
    pub speed_accuracy_meters_per_second: Option<f64>,
    pub bearing_degrees: Option<f64>,
    pub bearing_accuracy_degrees: Option<f64>,
    pub provider: FixProvider,
    pub is_mock: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FixProvider {
    Gps,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub t: u64,
    pub sim_slot: u32,
    pub registered_plmn: Option<String>,
    pub is_roaming: Option<bool>,
    pub is_nr_available: Option<bool>,
    pub is_dc_nr_restricted: Option<bool>,
    pub reader: usize,
    pub data_network_type: Option<NetworkType>,
    pub display_override: Option<DisplayOverride>,
    pub data_activity: Option<DataActivity>,
    pub measurements: Vec<Measurement>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NetworkType {
    Gprs,
    Edge,
    Umts,
    Cdma,
    Evdo0,
    EvdoA,
    Cdma1xRtt,
    Hsdpa,
    Hsupa,
    Hspa,
    Iden,
    EvdoB,
    Lte,
    Ehrpd,
    Hspap,
    Gsm,
    TdScdma,
    Iwlan,
    LteCa,
    Nr,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DisplayOverride {
    None,
    LteCa,
    LteAdvancedPro,
    NrNsa,
    NrAdvanced,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DataActivity {
    None,
    In,
    Out,
    InOut,
    Dormant,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurement {
    pub cell: usize,
    pub role: Role,
    pub t: Option<u64>,
    pub connection_status: Option<ConnectionStatus>,
    pub access_barring: Option<BTreeMap<BarredService, BarringKind>>,
    pub rsrp_dbm: Option<i64>,
    pub rsrq_db: Option<i64>,
    pub rssnr_db: Option<i64>,
    pub rssi_dbm: Option<i64>,
    pub cqi: Option<i64>,
    pub ss_rsrp_dbm: Option<i64>,
    pub ss_rsrq_db: Option<i64>,
    pub ss_sinr_db: Option<i64>,
    pub csi_rsrp_dbm: Option<i64>,
    pub csi_rsrq_db: Option<i64>,
    pub csi_sinr_db: Option<i64>,
    pub subcarrier_spacing_khz: Option<i64>,
    pub ssb_index: Option<i64>,
    pub rscp_dbm: Option<i64>,
    pub ec_no_db: Option<i64>,
    pub bit_error_rate: Option<i64>,
    pub timing_advance: Option<i64>,
    pub derived: Option<Vec<String>>,
    pub corrected: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Serving,
    Aggregated,
    NrSecondary,
    Neighbour,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionStatus {
    None,
    PrimaryServing,
    SecondaryServing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BarredService {
    CsService,
    PsService,
    CsVoice,
    MoSignalling,
    MoData,
    CsFallback,
    MmtelVoice,
    MmtelVideo,
    Emergency,
    Sms,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BarringKind {
    Unconditional,
    Conditional,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Event {
    SessionStart { t: u64, session: usize },
    SessionEnd { t: u64, session: usize },
    AirplaneMode { t: u64, is_on: bool },
    SimChanged { t: u64, sim_slot: u32 },
    LocationOff { t: u64, until_t: Option<u64> },
    ExclusionGap { t: u64, until_t: u64 },
    ReaderDiff { t: u64, reader: usize, fields: BTreeMap<String, u64> },
    BandLock { t: u64, bands: Vec<i64> },
}
