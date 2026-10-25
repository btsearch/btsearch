mod common;

use common::database_enum;
use engine_estimate::input::EvidenceClass;
use engine_fold::deltas::ValueKind;
use engine_fold::report::{DropReason, ValuePattern};

#[test]
fn drop_reasons_are_the_database_enum() {
    let in_engine: Vec<&str> = DropReason::ALL.iter().map(|reason| reason.as_str()).collect();
    assert_eq!(in_engine, database_enum("sample_drop_reason"));
}

#[test]
fn cell_value_kinds_are_the_database_enum() {
    let in_engine: Vec<&str> = ValueKind::ALL.iter().map(|kind| kind.as_str()).collect();
    assert_eq!(in_engine, database_enum("cell_value_field"));
}

#[test]
fn evidence_classes_are_the_database_enum() {
    let in_engine: Vec<&str> = EvidenceClass::ALL.iter().map(|class| class.label()).collect();
    assert_eq!(in_engine, database_enum("evidence_class"));
}

#[test]
fn value_patterns_are_the_database_enum() {
    let in_engine: Vec<&str> = ValuePattern::ALL.iter().map(|pattern| pattern.as_str()).collect();
    assert_eq!(in_engine, database_enum("value_pattern"));
}
