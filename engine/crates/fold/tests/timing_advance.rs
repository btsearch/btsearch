mod common;

use common::{fixture_document, inputs, no_outlines, read_batch};
use engine_fold::deltas::CellTaBinKey;
use engine_fold::fold;
use serde_json::Value;

fn timing_advance_bins(name: &str, change: impl FnOnce(&mut Value)) -> Vec<CellTaBinKey> {
    let mut document = fixture_document(name);
    change(&mut document["snapshots"][0]);
    let outlines = no_outlines();
    fold(&read_batch(&document), &inputs(&outlines)).deltas.cell_ta_bins.into_keys().collect()
}

fn timing_advances(name: &str, change: impl FnOnce(&mut Value)) -> Vec<i16> {
    timing_advance_bins(name, change).iter().map(|key| key.timing_advance).collect()
}

#[test]
fn a_timing_advance_counts_only_while_the_phone_is_connected_to_the_cell() {
    assert_eq!(timing_advances("nr-standalone.json", |_| {}), [4]);
    let idle = timing_advances("nr-standalone.json", |snapshot| snapshot["measurements"][0]["connectionStatus"] = "none".into());
    assert!(idle.is_empty(), "an idle phone repeats the last value it had, from wherever it was then");
}

#[test]
fn without_a_connection_status_the_data_activity_decides() {
    assert_eq!(timing_advances("appendix-a.json", |_| {}), [12]);
    for idle in ["none", "dormant"] {
        assert!(timing_advances("appendix-a.json", |snapshot| snapshot["dataActivity"] = idle.into()).is_empty(), "{idle}");
    }
    let unknown = timing_advances("appendix-a.json", |snapshot| {
        snapshot.as_object_mut().expect("a snapshot").remove("dataActivity");
    });
    assert!(unknown.is_empty());
}

#[test]
fn a_neighbour_has_no_timing_advance_of_its_own() {
    assert!(timing_advances("nr-standalone.json", |snapshot| snapshot["measurements"][0]["role"] = "neighbour".into()).is_empty());
}

#[test]
fn a_modem_log_timing_advance_is_current_without_any_connection_state() {
    let groups: Vec<i16> = timing_advance_bins("shizuku-and-modem-log.json", |_| {}).iter().map(|key| key.ta_group_id).collect();
    assert!(groups.contains(&2), "the modem log's reading reports neither a connection status nor data activity");
}
