use std::collections::BTreeSet;

use engine_batch::document::{Cell, CellCommon, Technology};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub enum Rat {
    Gsm,
    Umts,
    Lte,
    Nr,
}

impl Rat {
    pub fn as_database_value(self) -> &'static str {
        match self {
            Self::Gsm => "GSM",
            Self::Umts => "UMTS",
            Self::Lte => "LTE",
            Self::Nr => "NR",
        }
    }
}

impl From<Technology> for Rat {
    fn from(technology: Technology) -> Self {
        match technology {
            Technology::Gsm => Self::Gsm,
            Technology::Umts => Self::Umts,
            Technology::Lte => Self::Lte,
            Technology::Nr => Self::Nr,
        }
    }
}

pub const LTE_CELL_ID_BITS: u32 = 8;
pub const SHORTEST_GNB_ID_BITS: u32 = 22;
const NCI_BITS: u32 = 36;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub struct CellIdentity {
    pub plmn: String,
    pub rat: Rat,
    pub cell_key: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub struct SiteIdentity {
    pub plmn: String,
    pub rat: Rat,
    pub node_id: i64,
}

impl CellIdentity {
    pub fn lte_site(&self) -> Option<SiteIdentity> {
        (self.rat == Rat::Lte).then(|| SiteIdentity { plmn: self.plmn.clone(), rat: Rat::Lte, node_id: self.cell_key >> LTE_CELL_ID_BITS })
    }

    pub fn may_share_a_site_with(&self, other: &Self) -> bool {
        if self.plmn != other.plmn || self.rat != other.rat {
            return false;
        }
        match self.rat {
            Rat::Lte => self.cell_key >> LTE_CELL_ID_BITS == other.cell_key >> LTE_CELL_ID_BITS,
            Rat::Nr => self.cell_key >> (NCI_BITS - SHORTEST_GNB_ID_BITS) == other.cell_key >> (NCI_BITS - SHORTEST_GNB_ID_BITS),
            Rat::Gsm | Rat::Umts => false,
        }
    }
}

pub struct CellEntry {
    pub rat: Rat,
    pub identity: Option<CellIdentity>,
    pub additional_plmns: Option<Vec<String>>,
    pub channel: Option<i64>,
    pub code: Option<i64>,
    pub area_code: Option<i64>,
    pub bandwidth_khz: Option<i64>,
    pub reported_bands: Vec<i64>,
    pub ul_channel: Option<i64>,
    pub ul_bandwidth_khz: Option<i64>,
    pub endc_available: Option<bool>,
    pub barred: Option<bool>,
    pub reserved: Option<bool>,
    pub applied_rules: Vec<String>,
    pub derived_count: i64,
}

#[derive(Default)]
struct RadioFields {
    cell_key: Option<i64>,
    channel: Option<i64>,
    code: Option<i64>,
    area_code: Option<i64>,
    bandwidth_khz: Option<i64>,
    ul_channel: Option<i64>,
    ul_bandwidth_khz: Option<i64>,
    endc_available: Option<bool>,
}

struct Provenance<'a> {
    common: &'a CellCommon,
    blocked_rules: &'a BTreeSet<String>,
    applied_rules: Vec<String>,
    skipped_rules: &'a mut BTreeSet<String>,
}

impl Provenance<'_> {
    fn reported<T>(&mut self, field: &str, value: Option<T>) -> Option<T> {
        if self.common.derived.as_ref().is_some_and(|derived| derived.iter().any(|name| name == field)) {
            return None;
        }
        let Some(rule) = self.common.corrected.as_ref().and_then(|corrected| corrected.get(field)) else {
            return value;
        };
        if self.blocked_rules.contains(rule) {
            self.skipped_rules.insert(rule.clone());
            return None;
        }
        if value.is_some() {
            self.applied_rules.push(rule.clone());
        }
        value
    }
}

impl CellEntry {
    pub fn of(cell: &Cell, blocked_rules: &BTreeSet<String>, skipped_rules: &mut BTreeSet<String>) -> Self {
        let common = cell.common();
        let mut provenance = Provenance { common, blocked_rules, applied_rules: Vec::new(), skipped_rules };
        let plmn = provenance.reported("plmn", common.plmn.clone());
        let additional_plmns = provenance.reported("additionalPlmns", common.additional_plmns.clone());
        let reported_bands = provenance.reported("bands", common.bands.clone()).unwrap_or_default();
        let barred = provenance.reported("isBarred", common.is_barred);
        let reserved =
            provenance.reported("reservedForOperatorUsePlmns", common.reserved_for_operator_use_plmns.as_ref().map(|plmns| !plmns.is_empty()));

        let rat = Rat::from(cell.technology());
        let radio = match cell {
            Cell::Gsm(gsm) => {
                let lac = provenance.reported("lac", gsm.lac);
                let cid = provenance.reported("cid", gsm.cid);
                RadioFields {
                    cell_key: lac.zip(cid).map(|(lac, cid)| (lac << 16) | cid),
                    channel: provenance.reported("arfcn", gsm.arfcn),
                    code: provenance.reported("bsic", gsm.bsic),
                    area_code: lac,
                    ..RadioFields::default()
                }
            }
            Cell::Umts(umts) => RadioFields {
                cell_key: provenance.reported("longCid", umts.long_cid),
                channel: provenance.reported("uarfcn", umts.uarfcn),
                code: provenance.reported("psc", umts.psc),
                area_code: provenance.reported("lac", umts.lac),
                ..RadioFields::default()
            },
            Cell::Lte(lte) => RadioFields {
                cell_key: provenance.reported("eci", lte.eci),
                channel: provenance.reported("earfcn", lte.earfcn),
                code: provenance.reported("pci", lte.pci),
                area_code: provenance.reported("tac", lte.tac),
                bandwidth_khz: provenance.reported("bandwidthKhz", lte.bandwidth_khz),
                ul_channel: provenance.reported("ulEarfcn", lte.ul_earfcn),
                ul_bandwidth_khz: provenance.reported("ulBandwidthKhz", lte.ul_bandwidth_khz),
                endc_available: provenance.reported("supportsEndc", lte.supports_endc),
            },
            Cell::Nr(nr) => RadioFields {
                cell_key: provenance.reported("nci", nr.nci),
                channel: provenance.reported("arfcn", nr.arfcn),
                code: provenance.reported("pci", nr.pci),
                area_code: provenance.reported("tac", nr.tac),
                bandwidth_khz: provenance.reported("bandwidthKhz", nr.bandwidth_khz),
                ul_channel: provenance.reported("ulArfcn", nr.ul_arfcn),
                ul_bandwidth_khz: provenance.reported("ulBandwidthKhz", nr.ul_bandwidth_khz),
                endc_available: None,
            },
        };

        let identity = plmn.zip(radio.cell_key).map(|(plmn, cell_key)| CellIdentity { plmn, rat, cell_key });
        let derived_count = common.derived.as_ref().map_or(0, |derived| derived.len() as i64);
        Self {
            rat,
            identity,
            additional_plmns,
            channel: radio.channel,
            code: radio.code,
            area_code: radio.area_code,
            bandwidth_khz: radio.bandwidth_khz,
            reported_bands,
            ul_channel: radio.ul_channel,
            ul_bandwidth_khz: radio.ul_bandwidth_khz,
            endc_available: radio.endc_available,
            barred,
            reserved,
            applied_rules: provenance.applied_rules,
            derived_count,
        }
    }

    pub fn own_plmn(&self) -> Option<&str> {
        self.identity.as_ref().map(|identity| identity.plmn.as_str())
    }

    pub fn broadcasts(&self, plmn: &str) -> bool {
        self.own_plmn() == Some(plmn) || self.additional_plmns.as_ref().is_some_and(|plmns| plmns.iter().any(|listed| listed == plmn))
    }
}
