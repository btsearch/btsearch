mod common;

use std::collections::BTreeMap;

use common::{USER_ID, fixture, inputs, launch_block, no_outlines};
use engine_fold::deltas::{NeighbourKey, NsaKey, ValueKind};
use engine_fold::fold;
use engine_fold::identity::{CellIdentity, Rat};
use engine_fold::inputs::{BlockField, BlockMode, ConfirmedCell, ReadingBlock};
use engine_fold::report::DropReason;
use engine_geo::plane::LocalPlane;
use engine_geo::square::square_centre;

fn serving() -> CellIdentity {
    CellIdentity { plmn: "26006".to_owned(), rat: Rat::Lte, cell_key: 31_604_747 }
}

#[test]
fn a_samsung_modem_folds_appendix_a_as_the_plan_shows_it() {
    let outlines = no_outlines();
    let mut inputs = inputs(&outlines);
    inputs.reading_blocks = vec![launch_block()];
    let fold = fold(&fixture("appendix-a.json"), &inputs);
    let deltas = &fold.deltas;

    assert_eq!(fold.report.kept_samples(), 3);
    assert!(fold.report.drops.is_empty());

    let [(bin_key, bin)] = deltas.cell_bins.iter().collect::<Vec<_>>()[..] else { panic!("one cell square: {:?}", deltas.cell_bins) };
    assert_eq!(bin_key.cell, serving());
    assert_eq!((bin.sample_count, bin.weight_milli, bin.serving_weight_milli), (1, 1_000, 1_000));
    assert_eq!((bin.level_wsum, bin.quality_wsum, bin.sinr_wsum), (-9_500_000, -1_100_000, 700_000));

    let [(ta_key, ta)] = deltas.cell_ta_bins.iter().collect::<Vec<_>>()[..] else { panic!("one timing-advance row") };
    assert_eq!((ta_key.bin, ta_key.ta_group_id, ta_key.timing_advance, ta.sample_count), (bin_key.bin, 1, 12, 1));

    let values: Vec<(ValueKind, i64, bool)> = deltas.cell_values.keys().map(|key| (key.field, key.value, key.held)).collect();
    assert_eq!(
        values,
        [
            (ValueKind::AreaCode, 58_140, false),
            (ValueKind::Pci, 301, true),
            (ValueKind::Channel, 1_300, true),
            (ValueKind::Bandwidth, 20_000, false),
            (ValueKind::ReportedBand, 3, false),
        ]
    );
    let correction = fold.report.corrections.get("tacByteOrder").expect("tacByteOrder corrected the area code");
    assert_eq!((correction.reader_name.as_str(), correction.value_count), ("btsearch", 1));

    let [(reader_key, _)] = deltas.cell_readers.iter().collect::<Vec<_>>()[..] else { panic!("one reader row") };
    assert_eq!((reader_key.reader.name.as_str(), reader_key.reader.version.as_str()), ("btsearch", "0.4.0"));

    let neighbour_bin = bin_key.bin >> 4;
    let neighbours: Vec<&NeighbourKey> = deltas.neighbour_bins.keys().collect();
    assert_eq!(
        neighbours,
        [
            &NeighbourKey { plmn: "26006".to_owned(), rat: Rat::Lte, channel: 1_300, pci: 77, bin: neighbour_bin, held: true },
            &NeighbourKey { plmn: "26006".to_owned(), rat: Rat::Nr, channel: 636_666, pci: 512, bin: neighbour_bin, held: true },
        ]
    );
    let links: Vec<&NsaKey> = deltas.nsa_links.keys().collect();
    assert_eq!(links, [&NsaKey { anchor: serving(), nr_arfcn: 636_666, nr_pci: 512, held: true }]);

    let [(person_key, person)] = deltas.person_trail_bins.iter().collect::<Vec<_>>()[..] else { panic!("one square of the person's trail") };
    assert_eq!(
        (person_key.user_id.as_str(), person_key.plmn.as_str(), person_key.rat, person_key.bin, person.sample_count),
        (USER_ID, "26006", Rat::Lte, neighbour_bin, 1)
    );
    assert!(deltas.trail_squares.is_empty(), "the reading lies in the first and last 100 m of a trip");
    assert_eq!(fold.report.blocked_values.get(&1).map(|counts| (counts.held, counts.dropped)), Some((6, 0)));
}

#[test]
fn a_drop_block_on_the_pci_drops_neighbours_whole() {
    let outlines = no_outlines();
    let mut inputs = inputs(&outlines);
    inputs.reading_blocks =
        vec![ReadingBlock { id: 2, reader_version: None, rats: None, roles: None, fields: Some(vec![BlockField::Pci]), mode: BlockMode::Drop }];
    let fold = fold(&fixture("appendix-a.json"), &inputs);

    assert_eq!(fold.report.drops.get(&DropReason::ReadingBlock), Some(&2));
    assert!(fold.deltas.neighbour_bins.is_empty() && fold.deltas.nsa_links.is_empty());
    assert!(fold.deltas.cell_values.keys().all(|key| key.field != ValueKind::Pci));
    assert_eq!(fold.deltas.cell_bins.len(), 1, "the serving cell keeps its reading");
}

#[test]
fn the_comparison_with_our_station_is_kept_with_the_upload_and_changes_no_digest_row() {
    let outlines = no_outlines();
    let plain = fold(&fixture("appendix-a.json"), &inputs(&outlines));
    let square = plain.deltas.cell_bins.keys().next().expect("a square of the serving cell").bin;
    let station = LocalPlane::around(square_centre(square)).to_point(0.0, 900.0);
    let mut compared = inputs(&outlines);
    compared.confirmed_cells =
        BTreeMap::from([(serving(), ConfirmedCell { station_id: 7, station, pci: Some(301), channel: Some(1_275), area_code: Some(58_140) })]);
    let checked = fold(&fixture("appendix-a.json"), &compared);

    let as_json = |fold: &engine_fold::Fold| serde_json::to_value(&fold.deltas).expect("the deltas serialize");
    assert_eq!(as_json(&checked), as_json(&plain));

    let [(key, samples)] = checked.report.ta_residuals.iter().collect::<Vec<_>>()[..] else {
        panic!("one residual: {:?}", checked.report.ta_residuals)
    };
    assert_eq!((key.station_id, key.timing_advance, *samples), (7, 12, 1));
    assert!((f64::from(key.distance_bucket) * 10.0 - 900.0).abs() <= 20.0, "{}", key.distance_bucket);
    let reader = checked.report.readers.values().next().expect("one reader");
    assert_eq!((reader.ta_on_confirmed, reader.ta_within_tolerance), (1, 1));
    let checks: Vec<(i64, i64)> = checked.report.value_checks.values().map(|agreement| (agreement.agreed, agreement.differed)).collect();
    assert_eq!(checks, [(1, 0), (0, 1), (1, 0)], "the PCI and area code agree, the channel does not");
}
