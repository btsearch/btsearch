mod common;

use std::collections::BTreeSet;

use common::{fixture, fixture_document, inputs, no_outlines, read_batch};
use engine_fold::fold;
use engine_fold::inputs::{BlockMode, ReaderVersion, ReadingBlock};
use engine_fold::report::DropReason;
use serde_json::json;

#[test]
fn a_shadow_reader_counts_as_a_duplicate_unless_its_readings_are_blocked_whole() {
    let outlines = no_outlines();
    let batch = fixture("shadow-reader.json");

    let unblocked = fold(&batch, &inputs(&outlines));
    assert_eq!(unblocked.report.drops.get(&DropReason::Duplicate), Some(&1));
    let readers: BTreeSet<&str> = unblocked.deltas.cell_readers.keys().map(|key| key.reader.name.as_str()).collect();
    assert_eq!(readers, BTreeSet::from(["btsearch"]));

    let shadow = ReaderVersion { name: "netmonsterCore".to_owned(), version: "1.2.9".to_owned() };
    let mut blocking = inputs(&outlines);
    blocking.reading_blocks =
        vec![ReadingBlock { id: 3, reader_version: Some(shadow.clone()), rats: None, roles: None, fields: None, mode: BlockMode::Drop }];
    let blocked = fold(&batch, &blocking);
    assert_eq!(blocked.report.drops.get(&DropReason::ReadingBlock), Some(&1));
    assert_eq!(blocked.report.drops.get(&DropReason::Duplicate), None);
    assert_eq!(blocked.report.blocked_values.get(&3).map(|counts| (counts.held, counts.dropped)), Some((0, 1)));
    assert!(blocked.report.readers.contains_key(&shadow), "the blocked reader version is still reported");
    assert_eq!(blocked.report.kept_samples(), 1);
}

#[test]
fn an_empty_snapshot_does_not_take_its_moment_from_another_readers_readings() {
    let outlines = no_outlines();
    let mut document = fixture_document("shadow-reader.json");
    document["snapshots"][0]["measurements"] = json!([]);

    let folded = fold(&read_batch(&document), &inputs(&outlines));
    assert_eq!(folded.report.drops.get(&DropReason::Duplicate), None);
    assert_eq!(folded.report.kept_samples(), 1);
}
