mod common;

use std::collections::BTreeMap;

use common::{fixture_document, inputs, no_outlines, read_batch};
use engine_fold::identity::{CellIdentity, Rat};
use engine_fold::inputs::ConfirmedCell;
use engine_fold::report::DropReason;
use engine_fold::{Fold, fold};
use engine_geo::plane::LocalPlane;
use engine_geo::square::square_centre;
use serde_json::Value;

fn with_serving_reading(change: impl FnOnce(&mut Value)) -> Fold {
    let mut document = fixture_document("gsm.json");
    change(&mut document["snapshots"][0]["measurements"][0]);
    let outlines = no_outlines();
    fold(&read_batch(&document), &inputs(&outlines))
}

fn in_idle_mode_at(rssi_dbm: i64) -> Fold {
    with_serving_reading(|measurement| {
        measurement.as_object_mut().expect("a measurement").remove("timingAdvance");
        measurement["rssiDbm"] = rssi_dbm.into();
    })
}

fn levels_dbm(folded: &Fold) -> Vec<i64> {
    folded.deltas.cell_bins.values().map(|bin| bin.level_wsum / bin.weight_milli / 100).collect()
}

fn timing_advances(folded: &Fold) -> Vec<i16> {
    folded.deltas.cell_ta_bins.keys().map(|key| key.timing_advance).collect()
}

#[test]
fn a_gsm_timing_advance_of_63_is_saturated_and_no_distance() {
    assert!(timing_advances(&with_serving_reading(|measurement| measurement["timingAdvance"] = 63.into())).is_empty());
    assert_eq!(timing_advances(&with_serving_reading(|measurement| measurement["timingAdvance"] = 62.into())), [62]);
}

#[test]
fn a_gsm_level_at_either_end_of_what_android_reports_is_no_level() {
    for censored in [-113, -111, -51] {
        let folded = in_idle_mode_at(censored);
        assert!(levels_dbm(&folded).is_empty(), "{censored} dBm");
        assert_eq!(folded.report.drops.get(&DropReason::NoLevel), Some(&1), "{censored} dBm");
    }
    assert_eq!(levels_dbm(&in_idle_mode_at(-109)), [-109]);
    assert_eq!(levels_dbm(&in_idle_mode_at(-53)), [-53]);
}

#[test]
fn a_gsm_reading_in_dedicated_mode_gives_its_timing_advance_but_not_its_level() {
    let dedicated = with_serving_reading(|_| {});
    assert_eq!(timing_advances(&dedicated), [3]);
    assert!(levels_dbm(&dedicated).is_empty(), "the channel of a call may be under downlink power control");
    assert_eq!(levels_dbm(&in_idle_mode_at(-79)), [-79], "the BCCH is sent at a steady level");
}

#[test]
fn a_reading_with_timing_advance_and_no_level_is_kept_for_its_distance_and_not_counted_as_no_level() {
    let mut document = fixture_document("gsm.json");
    document["snapshots"][0]["measurements"].as_array_mut().expect("the measurements").truncate(1);
    let outlines = no_outlines();
    let during_a_call = fold(&read_batch(&document), &inputs(&outlines));

    assert_eq!(timing_advances(&during_a_call), [3]);
    assert_eq!(during_a_call.report.drops.get(&DropReason::NoLevel), None);
    assert_eq!(during_a_call.report.distance_only_count, 1);
    assert_eq!(during_a_call.report.kept_samples(), 1, "an upload made only during calls is not rejected");
    assert_eq!(in_idle_mode_at(-113).report.distance_only_count, 0, "a reading with neither a level nor timing advance stays noLevel");
}

fn agreement_with_our_station_at(meters: f64) -> (i64, i64) {
    let outlines = no_outlines();
    let batch = read_batch(&fixture_document("gsm.json"));
    let square = fold(&batch, &inputs(&outlines)).deltas.cell_ta_bins.keys().next().expect("the reading's timing advance").bin;
    let serving = CellIdentity { plmn: "26001".to_owned(), rat: Rat::Gsm, cell_key: (50_114 << 16) | 12_345 };
    let station = LocalPlane::around(square_centre(square)).to_point(0.0, meters);
    let mut compared = inputs(&outlines);
    compared.confirmed_cells = BTreeMap::from([(serving, ConfirmedCell { station_id: 7, station, pci: None, channel: None, area_code: None })]);
    let reader = fold(&batch, &compared).report.readers.into_values().next().expect("one reader");
    (reader.ta_on_confirmed, reader.ta_within_tolerance)
}

#[test]
fn a_gsm_reading_may_put_our_station_closer_by_its_rounding_and_one_symbol_of_phone_tolerance() {
    assert_eq!(agreement_with_our_station_at(2_300.0), (1, 1), "timing advance 3 says 1,660 m: 640 m closer");
    assert_eq!(agreement_with_our_station_at(2_700.0), (1, 0), "1,040 m closer is more than a symbol and a half");
}
