mod common;

use common::{fixture, fixture_names, inputs, launch_block, no_outlines};
use engine_batch::document::Batch;
use engine_fold::deltas::Deltas;
use engine_fold::fold;
use engine_fold::memory::{Direction, MemoryDigest};
use proptest::prelude::*;

#[derive(Debug, Clone)]
struct Variation {
    fixture: usize,
    north_meters: f64,
    east_meters: f64,
    level_shift: i64,
}

fn variation() -> impl Strategy<Value = Variation> {
    (0..8_usize, -2_000.0..2_000.0, -2_000.0..2_000.0, -10..10_i64).prop_map(|(fixture, north_meters, east_meters, level_shift)| Variation {
        fixture,
        north_meters,
        east_meters,
        level_shift,
    })
}

fn uploads(variations: &[Variation]) -> Vec<Batch> {
    let names = fixture_names();
    variations
        .iter()
        .map(|variation| {
            let mut batch = fixture(&names[variation.fixture % names.len()]);
            for fix in &mut batch.fixes {
                fix.latitude += variation.north_meters / 111_195.0;
                fix.longitude += variation.east_meters / 68_000.0;
            }
            for measurement in batch.snapshots.iter_mut().flat_map(|snapshot| snapshot.measurements.iter_mut()) {
                for level in [&mut measurement.rsrp_dbm, &mut measurement.ss_rsrp_dbm, &mut measurement.rscp_dbm, &mut measurement.rssi_dbm] {
                    if let Some(value) = level.as_mut() {
                        *value = (*value + variation.level_shift).clamp(-113, -51);
                    }
                }
            }
            batch
        })
        .collect()
}

fn fold_all(batches: &[Batch]) -> Vec<Deltas> {
    let outlines = no_outlines();
    let mut inputs = inputs(&outlines);
    inputs.reading_blocks = vec![launch_block()];
    batches.iter().map(|batch| fold(batch, &inputs).deltas).collect()
}

fn digest_of<'a>(deltas: impl IntoIterator<Item = &'a Deltas>) -> MemoryDigest {
    let mut digest = MemoryDigest::default();
    for delta in deltas {
        digest.apply(delta, Direction::Add);
    }
    digest
}

proptest! {
    #[test]
    fn a_subtraction_returns_every_count_and_sum(variations in prop::collection::vec(variation(), 1..12), withdrawn in any::<prop::sample::Index>()) {
        let deltas = fold_all(&uploads(&variations));
        let withdrawn = withdrawn.index(deltas.len());
        let mut digest = digest_of(&deltas);
        digest.apply(&deltas[withdrawn], Direction::Subtract);
        let others = deltas.iter().enumerate().filter(|(index, _)| *index != withdrawn).map(|(_, delta)| delta);
        let without = digest_of(others);
        prop_assert_eq!(counts_of(&digest), counts_of(&without));

        let mut emptied = digest_of(&deltas);
        for delta in &deltas {
            emptied.apply(delta, Direction::Subtract);
        }
        prop_assert!(emptied.is_empty());
    }

    #[test]
    fn any_order_and_a_split_across_threads_give_one_digest(variations in prop::collection::vec(variation(), 1..12), seed in any::<u64>()) {
        let batches = uploads(&variations);
        let in_order = digest_of(&fold_all(&batches));

        let mut shuffled = batches.clone();
        let mut state = seed | 1;
        for index in (1..shuffled.len()).rev() {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            shuffled.swap(index, (state % (index as u64 + 1)) as usize);
        }
        let threaded: Vec<Deltas> = std::thread::scope(|scope| {
            let halves: Vec<_> = shuffled.chunks(shuffled.len().div_ceil(2)).map(|chunk| scope.spawn(move || fold_all(chunk))).collect();
            halves.into_iter().flat_map(|half| half.join().expect("a fold thread finishes")).collect()
        });
        prop_assert_eq!(digest_of(&threaded), in_order);
    }
}

fn counts_of(digest: &MemoryDigest) -> String {
    let tables = &digest.tables;
    let mut lines = Vec::new();
    lines.extend(
        tables.cell_bins.iter().map(|(key, row)| {
            format!("{key:?} {} {} {} {} {}", row.sample_count, row.weight_milli, row.level_wsum, row.level_wsq, row.offset_x_wsum)
        }),
    );
    lines.extend(tables.cell_ta_bins.iter().map(|(key, row)| format!("{key:?} {} {}", row.sample_count, row.weight_milli)));
    lines.extend(tables.cell_values.iter().map(|(key, row)| format!("{key:?} {}", row.sample_count)));
    lines.extend(tables.cell_networks.iter().map(|(key, row)| format!("{key:?} {}", row.sample_count)));
    lines.extend(tables.cell_contributors.iter().map(|(key, row)| format!("{key:?} {} {}", row.sample_count, row.trip_count)));
    lines.extend(tables.cell_readers.iter().map(|(key, row)| format!("{key:?} {}", row.sample_count)));
    lines.extend(tables.handover_bins.iter().map(|(key, row)| format!("{key:?} {} {}", row.handover_count, row.weight_milli)));
    lines.extend(tables.cell_transitions.iter().map(|(key, row)| format!("{key:?} {}", row.transition_count)));
    lines.extend(tables.neighbour_bins.iter().map(|(key, row)| format!("{key:?} {} {} {}", row.sample_count, row.weight_milli, row.level_wsum)));
    lines.extend(tables.nsa_links.iter().map(|(key, row)| format!("{key:?} {} {}", row.sample_count, row.level_wsum)));
    lines.extend(tables.same_reading_pairs.iter().map(|(key, row)| format!("{key:?} {}", row.sample_count)));
    lines.extend(tables.trail_squares.keys().map(|key| format!("{key:?}")));
    lines.extend(tables.trail_levels.iter().map(|(key, row)| format!("{key:?} {}", row.sample_count)));
    lines.extend(tables.person_trail_bins.iter().map(|(key, row)| format!("{key:?} {}", row.sample_count)));
    lines.extend(tables.contributor_months.iter().map(|(key, row)| format!("{key:?} {}", row.sample_count)));
    lines.join("\n")
}
