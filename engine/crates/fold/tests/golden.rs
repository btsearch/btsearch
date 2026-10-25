mod common;

use std::fs;
use std::path::Path;

use common::{fixture, fixture_names, inputs, launch_block, no_outlines};
use engine_fold::fold;
use serde_json::{Value, json};

#[test]
fn every_fixture_folds_to_its_pinned_deltas() {
    let outlines = no_outlines();
    let mut inputs = inputs(&outlines);
    inputs.reading_blocks = vec![launch_block()];
    let golden_directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden");
    let rewrite = std::env::var_os("UPDATE_GOLDEN").is_some();

    let mut mismatches = Vec::new();
    for name in fixture_names() {
        let fold = fold(&fixture(&name), &inputs);
        let folded = json!({ "deltas": fold.deltas, "report": fold.report });
        let path = golden_directory.join(&name);
        match fs::read(&path) {
            Ok(pinned) if !rewrite => {
                let pinned: Value = serde_json::from_slice(&pinned).expect("a golden file is JSON");
                if pinned != folded {
                    mismatches.push(name);
                }
            }
            _ => {
                fs::create_dir_all(&golden_directory).expect("tests/golden can be made");
                fs::write(&path, serde_json::to_string_pretty(&folded).expect("deltas serialize") + "\n").expect("a golden file can be written");
            }
        }
    }
    assert!(mismatches.is_empty(), "these fixtures fold differently from tests/golden; run with UPDATE_GOLDEN=1 once the change is meant: {mismatches:?}");
}
