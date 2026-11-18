mod common;

use common::{fixture_document, inputs, no_outlines, read_batch};
use engine_fold::deltas::NsaKey;
use engine_fold::fold;
use engine_fold::identity::{CellIdentity, Rat};
use serde_json::json;

const SERVING_NCI: i64 = 3_342_213_121;

#[test]
fn an_nr_secondary_leg_under_an_nr_serving_cell_is_linked_to_that_cell() {
    let mut document = fixture_document("appendix-a.json");
    document["cells"][0] = json!({ "rat": "nr", "plmn": "26006", "nci": SERVING_NCI, "tac": 58_140, "pci": 301, "arfcn": 428_000, "bands": [1] });
    document["snapshots"][0]["measurements"][0] =
        json!({ "cell": 0, "role": "serving", "elapsedRealtimeMillis": 812_346_350, "ssRsrpDbm": -95, "ssRsrqDb": -11, "ssSinrDb": 7 });
    let outlines = no_outlines();
    let folded = fold(&read_batch(&document), &inputs(&outlines));

    let serving = CellIdentity { plmn: "26006".to_owned(), rat: Rat::Nr, cell_key: SERVING_NCI };
    let links: Vec<(&CellIdentity, i64, i64)> =
        folded.deltas.nsa_links.keys().map(|link: &NsaKey| (&link.anchor, link.nr_arfcn, link.nr_pci)).collect();
    assert_eq!(links, [(&serving, 636_666, 512)]);
}
