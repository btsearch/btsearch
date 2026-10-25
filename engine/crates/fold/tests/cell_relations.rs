mod common;

use common::{Leg, drive_document, inputs, no_outlines, read_batch};
use engine_fold::fold;
use engine_fold::identity::{CellIdentity, Rat};
use serde_json::json;

fn lte(cell_key: i64) -> CellIdentity {
    CellIdentity { plmn: "26006".to_owned(), rat: Rat::Lte, cell_key }
}

#[test]
fn a_change_of_cell_on_one_enb_is_a_handover_and_to_another_enb_a_transition() {
    let mut document = drive_document("01a12096-8da0-7c1d-9b2e-5f6a7b8c9e02", &[Leg { seconds: 3, meters_per_second: 10.0 }], None, (None, None));
    document["cells"] = json!([
        { "rat": "lte", "plmn": "26006", "eci": 31_604_747, "earfcn": 1_300, "pci": 301 },
        { "rat": "lte", "plmn": "26006", "eci": 31_604_748, "earfcn": 1_300, "pci": 302 },
        { "rat": "lte", "plmn": "26006", "eci": 31_605_003, "earfcn": 1_300, "pci": 303 }
    ]);
    for (snapshot, cell) in [0, 1, 2].into_iter().enumerate() {
        document["snapshots"][snapshot]["measurements"][0]["cell"] = cell.into();
    }
    let outlines = no_outlines();
    let deltas = fold(&read_batch(&document), &inputs(&outlines)).deltas;

    let handovers: Vec<(CellIdentity, CellIdentity)> = deltas.handover_bins.keys().map(|key| (key.from.clone(), key.to.clone())).collect();
    assert_eq!(handovers, [(lte(31_604_747), lte(31_604_748))]);
    let transitions: Vec<(CellIdentity, CellIdentity)> = deltas.cell_transitions.keys().map(|key| (key.from.clone(), key.to.clone())).collect();
    assert_eq!(transitions, [(lte(31_604_748), lte(31_605_003))]);
}

#[test]
fn an_nr_cell_reported_once_per_network_group_gives_one_same_reading_pair() {
    let mut document = drive_document("01a12096-8da0-7c1d-9b2e-5f6a7b8c9e03", &[Leg { seconds: 1, meters_per_second: 10.0 }], None, (None, None));
    document["cells"] = json!([
        { "rat": "nr", "plmn": "26002", "nci": 5_056_786_433_i64, "arfcn": 643_334, "pci": 412, "additionalPlmns": [] },
        { "rat": "nr", "plmn": "26003", "nci": 5_056_786_434_i64, "arfcn": 643_334, "pci": 412, "additionalPlmns": [] }
    ]);
    document["snapshots"][0]["measurements"] = json!([
        { "cell": 0, "role": "serving", "ssRsrpDbm": -92 },
        { "cell": 1, "role": "neighbour", "ssRsrpDbm": -92 }
    ]);
    let outlines = no_outlines();
    let deltas = fold(&read_batch(&document), &inputs(&outlines)).deltas;

    let pairs: Vec<(&str, &str)> = deltas.same_reading_pairs.keys().map(|key| (key.first.plmn.as_str(), key.second.plmn.as_str())).collect();
    assert_eq!(pairs, [("26002", "26003")]);
    assert_eq!(deltas.same_reading_pairs.values().map(|count| count.sample_count).sum::<i64>(), 1);
}
