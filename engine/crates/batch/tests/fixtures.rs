mod common;

use std::fs;
use std::path::PathBuf;

use common::{APPENDIX_A_DEVICE_ID, APPENDIX_A_UPLOAD_ID, fixtures_directory};
use engine_batch::document::{Cell, Role};
use engine_batch::read_document;

fn fixture_paths() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = fs::read_dir(fixtures_directory())
        .expect("engine/fixtures/v1 is readable")
        .map(|entry| entry.expect("a readable entry").path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "json"))
        .collect();
    paths.sort();
    paths
}

fn own_ids(document: &[u8]) -> (String, String) {
    let value: serde_json::Value = serde_json::from_slice(document).expect("a fixture is JSON");
    let id = |name: &str| value[name].as_str().expect("a fixture names its ids").to_owned();
    (id("uploadId"), id("deviceId"))
}

#[test]
fn every_fixture_reads_and_keeps_every_value() {
    let paths = fixture_paths();
    assert!(!paths.is_empty(), "engine/fixtures/v1 holds no fixtures");
    for path in paths {
        let document = fs::read(&path).expect("a fixture is readable");
        let (upload_id, device_id) = own_ids(&document);
        let upload = read_document(&document, &upload_id, &device_id).unwrap_or_else(|rejection| panic!("{} is rejected: {rejection}", path.display()));
        assert!(upload.dropped_values.is_empty(), "{} drops {:?}", path.display(), upload.dropped_values);
    }
}

#[test]
fn appendix_a_reads_as_the_plan_shows_it() {
    let document = fs::read(fixtures_directory().join("appendix-a.json")).expect("the Appendix A fixture is readable");
    let batch = read_document(&document, APPENDIX_A_UPLOAD_ID, APPENDIX_A_DEVICE_ID).expect("Appendix A reads").batch;

    assert_eq!((batch.cells.len(), batch.fixes.len(), batch.snapshots.len()), (3, 2, 1));
    let Cell::Lte(serving) = &batch.cells[0] else { panic!("the first cell is not LTE") };
    assert_eq!((serving.eci, serving.tac, serving.pci, serving.earfcn), (Some(31_604_747), Some(58_140), Some(301), Some(1_300)));
    let corrected = serving.common.corrected.as_ref().and_then(|corrected| corrected.get("tac"));
    assert_eq!(corrected.map(String::as_str), Some("tacByteOrder"));

    let measurements = &batch.snapshots[0].measurements;
    let roles: Vec<Role> = measurements.iter().map(|measurement| measurement.role).collect();
    assert_eq!(roles, [Role::Serving, Role::Neighbour, Role::NrSecondary]);
    assert_eq!(measurements[0].timing_advance, Some(12));
}

#[test]
fn shizuku_fixture_reads_the_flags_under_their_names() {
    let document = fs::read(fixtures_directory().join("shizuku-and-modem-log.json")).expect("the Shizuku fixture is readable");
    let (upload_id, device_id) = own_ids(&document);
    let batch = read_document(&document, &upload_id, &device_id).expect("the Shizuku fixture reads").batch;

    assert_eq!(batch.readers[0].uses_shizuku, Some(true));
    let Cell::Lte(anchor) = &batch.cells[0] else { panic!("the first cell is not LTE") };
    assert_eq!(anchor.supports_endc, Some(true));
    let barred = batch.cells[3].common();
    assert_eq!(barred.is_barred, Some(true));
    assert_eq!(barred.reserved_for_operator_use_plmns, Some(Vec::new()));
    let snapshot = &batch.snapshots[0];
    assert_eq!((snapshot.is_nr_available, snapshot.is_dc_nr_restricted), (Some(true), Some(false)));
}
