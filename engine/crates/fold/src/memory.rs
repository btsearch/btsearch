use std::collections::{BTreeMap, BTreeSet};

use crate::deltas::{Deltas, Row, absorb_into};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Add,
    Subtract,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct MemoryDigest {
    pub tables: Deltas,
}

impl MemoryDigest {
    pub fn apply(&mut self, deltas: &Deltas, direction: Direction) {
        let tables = &mut self.tables;
        apply_table(&mut tables.cell_bins, &deltas.cell_bins, direction);
        apply_table(&mut tables.cell_ta_bins, &deltas.cell_ta_bins, direction);
        apply_table(&mut tables.cell_values, &deltas.cell_values, direction);
        apply_table(&mut tables.cell_networks, &deltas.cell_networks, direction);
        apply_table(&mut tables.cell_contributors, &deltas.cell_contributors, direction);
        apply_table(&mut tables.cell_readers, &deltas.cell_readers, direction);
        apply_table(&mut tables.handover_bins, &deltas.handover_bins, direction);
        apply_table(&mut tables.cell_transitions, &deltas.cell_transitions, direction);
        apply_table(&mut tables.neighbour_bins, &deltas.neighbour_bins, direction);
        apply_table(&mut tables.nsa_links, &deltas.nsa_links, direction);
        apply_table(&mut tables.same_reading_pairs, &deltas.same_reading_pairs, direction);
        apply_table(&mut tables.trail_squares, &deltas.trail_squares, direction);
        apply_table(&mut tables.trail_levels, &deltas.trail_levels, direction);
        apply_table(&mut tables.person_trail_bins, &deltas.person_trail_bins, direction);
        apply_table(&mut tables.contributor_months, &deltas.contributor_months, direction);
        if direction == Direction::Subtract {
            let measured: BTreeSet<_> = tables.trail_levels.keys().map(|level| level.square.clone()).collect();
            tables.trail_squares.retain(|square, _| measured.contains(square));
        }
    }

    pub fn is_empty(&self) -> bool {
        self.tables == Deltas::default()
    }
}

fn apply_table<K: Ord + Clone, V: Row>(table: &mut BTreeMap<K, V>, deltas: &BTreeMap<K, V>, direction: Direction) {
    for (key, row) in deltas {
        match direction {
            Direction::Add => absorb_into(table, key.clone(), row.clone()),
            Direction::Subtract => {
                if let Some(existing) = table.get_mut(key) {
                    existing.give_back(row);
                    if existing.is_spent() {
                        table.remove(key);
                    }
                }
            }
        }
    }
}
