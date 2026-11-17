mod common;

use std::collections::BTreeSet;

use common::{fixture_document, inputs, no_outlines, read_batch};
use engine_batch::document::Batch;
use engine_fold::report::DropReason;
use engine_fold::{Fold, fold};
use serde_json::{Value, json};

fn appendix_a_with(change: impl FnOnce(&mut Value)) -> Batch {
    let mut document = fixture_document("appendix-a.json");
    change(&mut document);
    read_batch(&document)
}

fn fold_blocking(batch: &Batch, rules: &[&str]) -> Fold {
    let outlines = no_outlines();
    let mut inputs = inputs(&outlines);
    inputs.blocked_quirk_rules = rules.iter().map(|rule| (*rule).to_owned()).collect();
    fold(batch, &inputs)
}

fn deltas_of(fold: &Fold) -> Value {
    serde_json::to_value(&fold.deltas).expect("the deltas serialize")
}

fn count_of(fold: &Fold, rule: &str) -> Option<i64> {
    fold.report.corrections.get(rule).map(|correction| correction.value_count)
}

#[test]
fn a_dropped_value_counts_for_its_rule_and_blocking_the_rule_changes_no_digest_row() {
    let batch = appendix_a_with(|document| {
        let serving = &mut document["snapshots"][0]["measurements"][0];
        serving.as_object_mut().expect("a measurement is an object").remove("rssnrDb");
        serving["dropped"] = json!({ "rssnrDb": "samsungZeroRssnr" });
    });
    let applied = fold_blocking(&batch, &[]);
    assert_eq!(count_of(&applied, "samsungZeroRssnr"), Some(1));

    let blocked = fold_blocking(&batch, &["samsungZeroRssnr"]);
    assert_eq!(count_of(&blocked, "samsungZeroRssnr"), None);
    assert_eq!(blocked.report.skipped_rules, BTreeSet::from(["samsungZeroRssnr".to_owned()]));
    assert_eq!(blocked.report.kept_samples(), 3);
    assert_eq!(deltas_of(&blocked), deltas_of(&applied), "the value is gone either way");
}

#[test]
fn measurements_a_rule_removed_count_for_it() {
    let batch = appendix_a_with(|document| document["snapshots"][0]["removed"] = json!({ "mediatekPhantomNr": 2 }));
    let applied = fold_blocking(&batch, &[]);
    assert_eq!(count_of(&applied, "mediatekPhantomNr"), Some(2));

    let blocked = fold_blocking(&batch, &["mediatekPhantomNr"]);
    assert_eq!(count_of(&blocked, "mediatekPhantomNr"), None);
    assert!(blocked.report.skipped_rules.contains("mediatekPhantomNr"));
    assert_eq!(deltas_of(&blocked), deltas_of(&applied));
}

#[test]
fn a_blocked_rule_that_changed_the_role_drops_the_measurement() {
    let rule = "nsaLegReportedAsServing";
    let batch = appendix_a_with(|document| {
        document["cells"][2]["dropped"] = json!({ "nci": rule, "tac": rule });
        document["snapshots"][0]["measurements"][2]["corrected"] = json!({ "role": rule, "connectionStatus": rule });
    });
    let applied = fold_blocking(&batch, &[]);
    assert_eq!(applied.report.kept_samples(), 3);
    assert_eq!(count_of(&applied, rule), Some(4), "two dropped fields and two corrected ones on one kept reading");
    assert!(!applied.deltas.nsa_links.is_empty());

    let blocked = fold_blocking(&batch, &[rule]);
    assert_eq!(blocked.report.drops.get(&DropReason::BlockedRule), Some(&1));
    assert_eq!(blocked.report.kept_samples(), 2);
    assert!(blocked.deltas.nsa_links.is_empty(), "the leg's own role is not in the upload");
    assert_eq!(count_of(&blocked, rule), None);
    assert!(blocked.report.skipped_rules.contains(rule));
}
