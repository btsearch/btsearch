mod common;

use std::collections::{BTreeMap, BTreeSet};

use common::{fixture_document, inputs, no_outlines, read_batch};
use engine_fold::fold;
use engine_fold::identity::{CellIdentity, Rat};
use engine_fold::inputs::ConfirmedCell;
use engine_fold::report::{CheckedField, ValuePattern, pattern_of};
use engine_geo::Point;

#[test]
fn a_tac_with_its_two_bytes_reversed_is_swapped() {
    assert_eq!(pattern_of(CheckedField::AreaCode, Rat::Lte, 0xE31C, 0x1CE3), (ValuePattern::BytesSwapped, 0));
    assert_eq!(pattern_of(CheckedField::AreaCode, Rat::Umts, 0x1CE3, 0xE31C), (ValuePattern::BytesSwapped, 0));
}

#[test]
fn an_nr_tac_has_its_three_bytes_reversed() {
    assert_eq!(pattern_of(CheckedField::AreaCode, Rat::Nr, 0x01_E3_1C, 0x1C_E3_01), (ValuePattern::BytesSwapped, 0));
    assert_eq!(pattern_of(CheckedField::AreaCode, Rat::Nr, 0x00_E3_1C, 0x1C_E3_00), (ValuePattern::BytesSwapped, 0));
    let two_bytes_swapped = pattern_of(CheckedField::AreaCode, Rat::Nr, 0x00_E3_1C, 0x1C_E3);
    assert_eq!(two_bytes_swapped, (ValuePattern::Offset, 0x1C_E3 - 0x00_E3_1C), "an NR TAC has three bytes");
}

#[test]
fn a_whole_factor_of_ours_is_a_factor_negative_when_ours_was_divided() {
    assert_eq!(pattern_of(CheckedField::Channel, Rat::Lte, 300, 76_800), (ValuePattern::Factor, 256));
    assert_eq!(pattern_of(CheckedField::Channel, Rat::Lte, 76_800, 300), (ValuePattern::Factor, -256));
    assert_eq!(pattern_of(CheckedField::Channel, Rat::Lte, 1_275, 2_550), (ValuePattern::Factor, 2));
}

#[test]
fn a_swap_comes_before_a_factor() {
    assert_eq!(pattern_of(CheckedField::AreaCode, Rat::Lte, 0x00E3, 0xE300), (ValuePattern::BytesSwapped, 0), "0xE300 is also 0xE3 times 256");
}

#[test]
fn any_other_difference_is_an_offset_by_its_amount() {
    assert_eq!(pattern_of(CheckedField::Pci, Rat::Lte, 301, 304), (ValuePattern::Offset, 3));
    assert_eq!(pattern_of(CheckedField::Pci, Rat::Lte, 304, 301), (ValuePattern::Offset, -3));
    assert_eq!(pattern_of(CheckedField::Pci, Rat::Lte, 301, 0), (ValuePattern::Offset, -301), "no factor turns a value into 0");
}

#[test]
fn every_differing_value_is_also_counted_as_the_constant_it_reported() {
    let outlines = no_outlines();
    let mut document = fixture_document("appendix-a.json");
    document["cells"][0]["pci"] = 0.into();
    let serving = CellIdentity { plmn: "26006".to_owned(), rat: Rat::Lte, cell_key: 31_604_747 };
    let mut compared = inputs(&outlines);
    let ours = ConfirmedCell { station_id: 7, station: Point::new(52.0, 21.0), pci: Some(301), channel: Some(1_300), area_code: Some(0x1CE3) };
    compared.confirmed_cells = BTreeMap::from([(serving.clone(), ours)]);
    let report = fold(&read_batch(&document), &compared).report;

    let patterns: Vec<(CheckedField, ValuePattern, i64, i64)> =
        report.value_patterns.iter().map(|(key, count)| (key.field, key.pattern, key.parameter, count.value_count)).collect();
    assert_eq!(
        patterns,
        [
            (CheckedField::Pci, ValuePattern::Offset, -301, 1),
            (CheckedField::Pci, ValuePattern::Constant, 0, 1),
            (CheckedField::AreaCode, ValuePattern::BytesSwapped, 0, 1),
            (CheckedField::AreaCode, ValuePattern::Constant, 0xE31C, 1),
        ]
    );
    let only_the_serving_cell = BTreeSet::from([serving]);
    assert!(report.value_patterns.values().all(|count| count.cells == only_the_serving_cell), "each pattern names the cell it was seen on");
}
