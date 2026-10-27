#![allow(dead_code)]

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use engine_batch::document::{Batch, ReaderSource};
use engine_batch::read_document;
use engine_fold::inputs::{BlockField, BlockMode, FoldInputs, ReadingBlock};
use engine_geo::outlines::CountryOutlines;
use serde_json::{Value, json};

pub const USER_ID: &str = "11111111-1111-4111-8111-111111111111";
pub const DEVICE_ID: &str = "01a0bdd4-4400-7d2e-8f30-415263748596";
pub const RECEIVED_AT_MILLIS: i64 = 1_791_554_400_000;
pub const CLOCK_ELAPSED_MILLIS: u64 = 812_345_000;
pub const CLOCK_EPOCH_MILLIS: i64 = 1_791_547_200_000;

pub fn fixtures_directory() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/v1")
}

pub fn fixture_names() -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(fixtures_directory())
        .expect("engine/fixtures/v1 is readable")
        .map(|entry| entry.expect("a readable entry").file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".json"))
        .collect();
    names.sort();
    names
}

pub fn database_enum(name: &str) -> Vec<String> {
    let schema = package_file("drizzle/schemas/observations.ts");
    let declaration = schema.split(&format!("pgEnum(\"{name}\", ")).nth(1).unwrap_or_else(|| panic!("observations.ts declares {name}"));
    if let Some(list) = declaration.strip_prefix('[') {
        return quoted_strings(list);
    }
    let constant = declaration.split(')').next().expect("the enum names its constant");
    let constants = package_file("shared/src/contract/constants.ts");
    let list = constants.split(&format!("export const {constant} = [")).nth(1).unwrap_or_else(|| panic!("constants.ts declares {constant}"));
    quoted_strings(list)
}

fn package_file(path: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packages").join(path);
    fs::read_to_string(&path).unwrap_or_else(|error| panic!("{} cannot be read: {error}", path.display()))
}

fn quoted_strings(list: &str) -> Vec<String> {
    let list = list.split(']').next().expect("the list ends");
    list.split('"').skip(1).step_by(2).map(str::to_owned).collect()
}

pub fn read_batch(document: &Value) -> Batch {
    let bytes = serde_json::to_vec(document).expect("a JSON value serializes");
    let id = |name: &str| document[name].as_str().expect("the document names its ids").to_owned();
    read_document(&bytes, &id("uploadId"), &id("deviceId")).expect("the document reads").batch
}

pub fn fixture_document(name: &str) -> Value {
    serde_json::from_slice(&fs::read(fixtures_directory().join(name)).expect("the fixture is readable")).expect("the fixture is JSON")
}

pub fn fixture(name: &str) -> Batch {
    read_batch(&fixture_document(name))
}

pub fn no_outlines() -> CountryOutlines {
    CountryOutlines::new(Vec::new())
}

pub fn inputs(outlines: &CountryOutlines) -> FoldInputs<'_> {
    FoldInputs {
        received_at_millis: RECEIVED_AT_MILLIS,
        device_id: DEVICE_ID.to_owned(),
        user_id: Some(USER_ID.to_owned()),
        device_weight_milli: 1_000,
        ta_groups: BTreeMap::from([(ReaderSource::Api, 1), (ReaderSource::ModemLog, 2), (ReaderSource::ModemPoll, 3)]),
        outlines,
        closed_countries: BTreeSet::new(),
        blocked_quirk_rules: BTreeSet::new(),
        reading_blocks: Vec::new(),
        confirmed_cells: BTreeMap::new(),
    }
}

pub fn launch_block() -> ReadingBlock {
    ReadingBlock {
        id: 1,
        reader_version: None,
        rats: None,
        roles: None,
        fields: Some(vec![BlockField::Pci, BlockField::Channel]),
        mode: BlockMode::Corroborate,
    }
}

pub struct Leg {
    pub seconds: u64,
    pub meters_per_second: f64,
}

pub fn drive_document(upload_id: &str, legs: &[Leg], gap_after_leg: Option<(usize, u64)>, marks: (Option<bool>, Option<bool>)) -> Value {
    let start = CLOCK_ELAPSED_MILLIS + 1_000;
    let mut t = start;
    let mut north_meters = 0.0;
    let mut fixes = Vec::new();
    let mut snapshots = Vec::new();
    for (index, leg) in legs.iter().enumerate() {
        for _ in 0..leg.seconds {
            let latitude = 52.0 + north_meters / 111_195.08;
            fixes.push(json!({
                "t": t, "gnssTimeMillis": CLOCK_EPOCH_MILLIS - CLOCK_ELAPSED_MILLIS as i64 + t as i64,
                "latitude": latitude, "longitude": 21.0, "accuracyMeters": 4.0,
                "speedMetersPerSecond": leg.meters_per_second, "bearingDegrees": 0.0, "provider": "gps", "isMock": false
            }));
            snapshots.push(json!({
                "t": t + 100, "simSlot": 0, "reader": 0,
                "measurements": [{
                    "cell": 0, "role": "serving", "connectionStatus": "primaryServing", "rsrpDbm": -95, "rsrqDb": -11, "timingAdvance": 3
                }]
            }));
            t += 1_000;
            north_meters += leg.meters_per_second;
        }
        if let Some((_, pause)) = gap_after_leg.filter(|(leg, _)| *leg == index) {
            t += pause;
        }
    }
    let mut document = json!({
        "formatVersion": 1, "uploadId": upload_id, "deviceId": DEVICE_ID,
        "app": { "versionCode": 140, "versionName": "1.4.0" }, "os": { "sdkInt": 35 },
        "clock": { "elapsedRealtimeMillis": CLOCK_ELAPSED_MILLIS, "epochMillis": CLOCK_EPOCH_MILLIS },
        "sessions": [], "sims": [{ "slot": 0, "simPlmn": "26006", "registeredPlmn": "26006", "isDataSim": true }],
        "readers": [{ "name": "btsearch", "version": "0.4.0", "source": "api" }],
        "cells": [{ "rat": "lte", "plmn": "26006", "eci": 31_604_747, "tac": 58_140, "earfcn": 1_300, "pci": 301 }],
        "fixes": fixes, "snapshots": snapshots
    });
    if let Some(starts) = marks.0 {
        document["startsMidTrip"] = starts.into();
    }
    if let Some(ends) = marks.1 {
        document["endsMidTrip"] = ends.into();
    }
    document
}

pub fn drive(legs: &[Leg], gap_after_leg: Option<(usize, u64)>, marks: (Option<bool>, Option<bool>)) -> Batch {
    read_batch(&drive_document("01a12096-8da0-7c1d-9b2e-5f6a7b8c9e01", legs, gap_after_leg, marks))
}
