use engine_fold::memory::Direction;

use Merge::{Bits, First, Last, Sum};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Merge {
    Sum,
    Bits,
    First,
    Last,
}

pub struct Table {
    pub name: &'static str,
    pub counts: &'static [&'static str],
    pub key: &'static [&'static str],
    pub rest: &'static [(&'static str, Merge)],
}

pub const CELL_BINS: Table = Table {
    name: "cell_bins",
    counts: &["sample_count"],
    key: &["observed_cell_id", "bin"],
    rest: &[
        ("sample_count", Sum),
        ("weight_milli", Sum),
        ("serving_weight_milli", Sum),
        ("level_wsum", Sum),
        ("level_wsq", Sum),
        ("quality_weight_milli", Sum),
        ("quality_wsum", Sum),
        ("sinr_weight_milli", Sum),
        ("sinr_wsum", Sum),
        ("sinr_wsq", Sum),
        ("offset_x_wsum", Sum),
        ("offset_y_wsum", Sum),
        ("stationary_count", Sum),
        ("contributor_bits", Bits),
        ("first_seen_on", First),
        ("last_seen_on", Last),
    ],
};

pub const CELL_TA_BINS: Table = Table {
    name: "cell_ta_bins",
    counts: &["sample_count"],
    key: &["observed_cell_id", "bin", "ta_group_id", "timing_advance"],
    rest: &[("sample_count", Sum), ("weight_milli", Sum), ("last_seen_on", Last)],
};

pub const CELL_VALUES: Table = Table {
    name: "cell_values",
    counts: &["sample_count"],
    key: &["observed_cell_id", "field", "value", "held"],
    rest: &[("sample_count", Sum), ("contributor_bits", Bits), ("first_seen_on", First), ("last_seen_on", Last)],
};

pub const CELL_NETWORKS: Table = Table {
    name: "cell_networks",
    counts: &["sample_count"],
    key: &["observed_cell_id", "plmn"],
    rest: &[("sample_count", Sum), ("contributor_bits", Bits), ("first_seen_on", First), ("last_seen_on", Last)],
};

pub const CELL_CONTRIBUTORS: Table = Table {
    name: "cell_contributors",
    counts: &["sample_count", "trip_count"],
    key: &["observed_cell_id", "device_id"],
    rest: &[("sample_count", Sum), ("trip_count", Sum), ("first_seen_on", First), ("last_seen_on", Last)],
};

pub const CELL_READERS: Table =
    Table { name: "cell_readers", counts: &["sample_count"], key: &["observed_cell_id", "reader_version_id"], rest: &[("sample_count", Sum)] };

pub const HANDOVER_BINS: Table = Table {
    name: "handover_bins",
    counts: &["handover_count"],
    key: &["from_cell_id", "to_cell_id", "bin"],
    rest: &[("handover_count", Sum), ("weight_milli", Sum), ("last_seen_on", Last)],
};

pub const CELL_TRANSITIONS: Table = Table {
    name: "cell_transitions",
    counts: &["transition_count"],
    key: &["from_cell_id", "to_cell_id"],
    rest: &[("transition_count", Sum), ("last_seen_on", Last)],
};

pub const NEIGHBOUR_BINS: Table = Table {
    name: "neighbour_bins",
    counts: &["sample_count"],
    key: &["plmn", "rat", "channel", "pci", "bin", "held"],
    rest: &[
        ("sample_count", Sum),
        ("weight_milli", Sum),
        ("level_wsum", Sum),
        ("contributor_bits", Bits),
        ("first_seen_on", First),
        ("last_seen_on", Last),
    ],
};

pub const NSA_LINKS: Table = Table {
    name: "nsa_links",
    counts: &["sample_count"],
    key: &["anchor_cell_id", "nr_arfcn", "nr_pci", "held"],
    rest: &[("sample_count", Sum), ("weight_milli", Sum), ("level_wsum", Sum), ("first_seen_on", First), ("last_seen_on", Last)],
};

pub const SAME_READING_PAIRS: Table = Table {
    name: "same_reading_pairs",
    counts: &["sample_count"],
    key: &["observed_cell_id", "other_observed_cell_id", "held"],
    rest: &[("sample_count", Sum)],
};

pub const TRAIL_SQUARES: Table = Table {
    name: "trail_squares",
    counts: &[],
    key: &["plmn", "rat", "channel", "zoom", "bin", "held"],
    rest: &[("contributor_bits", Bits), ("last_seen_on", Last)],
};

pub const TRAIL_LEVELS: Table = Table {
    name: "trail_levels",
    counts: &["sample_count"],
    key: &["plmn", "rat", "channel", "zoom", "bin", "held", "level_bucket"],
    rest: &[("sample_count", Sum)],
};

pub const PERSON_TRAIL_BINS: Table = Table {
    name: "person_trail_bins",
    counts: &["sample_count"],
    key: &["user_id", "plmn", "rat", "bin"],
    rest: &[("sample_count", Sum), ("last_seen_on", Last)],
};

pub const CONTRIBUTOR_MONTHS: Table = Table {
    name: "contributor_months",
    counts: &["sample_count", "new_squares"],
    key: &["user_id", "country_code", "month"],
    rest: &[("sample_count", Sum), ("new_squares", Sum)],
};

pub const DIGEST: [&Table; 15] = [
    &CELL_BINS,
    &CELL_TA_BINS,
    &CELL_VALUES,
    &CELL_NETWORKS,
    &CELL_CONTRIBUTORS,
    &CELL_READERS,
    &HANDOVER_BINS,
    &CELL_TRANSITIONS,
    &NEIGHBOUR_BINS,
    &NSA_LINKS,
    &SAME_READING_PAIRS,
    &TRAIL_SQUARES,
    &TRAIL_LEVELS,
    &PERSON_TRAIL_BINS,
    &CONTRIBUTOR_MONTHS,
];

impl Table {
    pub fn columns(&self) -> String {
        let rest = self.rest.iter().map(|(column, _)| *column);
        self.key.iter().copied().chain(rest).collect::<Vec<_>>().join(", ")
    }

    pub fn delta_table(&self) -> String {
        format!("pg_temp.delta_{}", self.name)
    }

    pub fn upsert(&self, direction: Direction) -> String {
        let key = self.key.join(", ");
        let updates: Vec<String> = self
            .rest
            .iter()
            .filter_map(|&(column, merge)| {
                let merged = match (merge, direction) {
                    (Sum, _) => format!("t.{column} + excluded.{column}"),
                    (_, Direction::Subtract) => return None,
                    (Bits, Direction::Add) => format!("t.{column} | excluded.{column}"),
                    (First, Direction::Add) => format!("least(t.{column}, excluded.{column})"),
                    (Last, Direction::Add) => format!("greatest(t.{column}, excluded.{column})"),
                };
                Some(format!("{column} = {merged}"))
            })
            .collect();
        let on_conflict = if updates.is_empty() { "DO NOTHING".to_owned() } else { format!("DO UPDATE SET {}", updates.join(", ")) };
        format!(
            "INSERT INTO observations.{name} AS t ({columns}) SELECT {columns} FROM {delta} ORDER BY {key} ON CONFLICT ({key}) {on_conflict}",
            name = self.name,
            columns = self.columns(),
            delta = self.delta_table(),
        )
    }

    fn matches_delta(&self) -> String {
        self.key.iter().map(|column| format!("t.{column} = d.{column}")).collect::<Vec<_>>().join(" AND ")
    }

    pub fn negative_rows(&self) -> String {
        let below_zero = self.counts.iter().map(|column| format!("t.{column} < 0")).collect::<Vec<_>>().join(" OR ");
        format!("SELECT count(*) FROM observations.{} t JOIN {} d ON {} WHERE {below_zero}", self.name, self.delta_table(), self.matches_delta())
    }

    pub fn delete_spent(&self) -> String {
        let spent = self.counts.iter().map(|column| format!("t.{column} = 0")).collect::<Vec<_>>().join(" AND ");
        format!("DELETE FROM observations.{} t USING {} d WHERE {} AND {spent}", self.name, self.delta_table(), self.matches_delta())
    }

    pub fn create_delta_table(&self) -> String {
        format!("CREATE TEMP TABLE delta_{name} (LIKE observations.{name}) ON COMMIT DELETE ROWS;", name = self.name)
    }
}
