mod common;

use common::{Leg, drive_document, inputs, no_outlines, read_batch};
use engine_fold::report::DropReason;
use engine_fold::{Fold, fold};
use serde_json::{Value, json};

fn with_a_neighbour_known_only_by_its_channel(snapshot_registered_plmn: Option<Value>) -> Fold {
    let mut document = drive_document("01a12096-8da0-7c1d-9b2e-5f6a7b8c9e04", &[Leg { seconds: 1, meters_per_second: 10.0 }], None, (None, None));
    document["cells"].as_array_mut().expect("the cells").push(json!({ "rat": "lte", "earfcn": 1_300, "pci": 302 }));
    let snapshot = &mut document["snapshots"][0];
    snapshot["measurements"] = json!([{ "cell": 1, "role": "neighbour", "rsrpDbm": -101 }]);
    if let Some(registered_plmn) = snapshot_registered_plmn {
        snapshot["registeredPlmn"] = registered_plmn;
    }
    let outlines = no_outlines();
    fold(&read_batch(&document), &inputs(&outlines))
}

fn credited_networks(folded: &Fold) -> Vec<&str> {
    folded.deltas.neighbour_bins.keys().map(|key| key.plmn.as_str()).collect()
}

#[test]
fn a_neighbour_known_only_by_its_channel_goes_to_the_network_the_sim_is_registered_on() {
    assert_eq!(credited_networks(&with_a_neighbour_known_only_by_its_channel(None)), ["26006"], "the network in `sims`");
    assert_eq!(credited_networks(&with_a_neighbour_known_only_by_its_channel(Some(json!("26003")))), ["26003"]);
}

#[test]
fn a_neighbour_known_only_by_its_channel_is_no_identity_while_the_sim_is_registered_on_no_network() {
    let unregistered = with_a_neighbour_known_only_by_its_channel(Some(Value::Null));

    assert!(credited_networks(&unregistered).is_empty(), "not the network the SIM had when the upload began");
    assert_eq!(unregistered.report.drops.get(&DropReason::NoIdentity), Some(&1));
}
