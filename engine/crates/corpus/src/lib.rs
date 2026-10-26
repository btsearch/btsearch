use std::fs;
use std::io;
use std::path::Path;

use serde_json::Value;
use uuid::{Builder, Uuid, Version};

const METERS_PER_DEGREE_OF_LATITUDE: f64 = 111_195.08;
const OFFSET_STEP_METERS: f64 = 150.0;
const EAST_STEPS: u64 = 9;
const NORTH_STEPS: u64 = 7;
const DAY_MILLIS: i64 = 86_400_000;
const DAYS_BACK: u64 = 20;
const ARRIVAL_AFTER_LAST_READING_MILLIS: i64 = 60 * 60 * 1000;
const DEVICE_ID_STREAM: u64 = 10;
const UPLOAD_ID_STREAM: u64 = 20;
const DAYS_BACK_STREAM: u64 = 30;

pub struct Options {
    pub uploads: usize,
    pub devices: usize,
    pub seed: u64,
}

pub struct GeneratedUpload {
    pub upload_id: Uuid,
    pub device_id: Uuid,
    pub received_at_millis: i64,
    pub document: Value,
}

pub fn read_fixtures(directory: &Path) -> io::Result<Vec<(String, Value)>> {
    let mut names: Vec<String> = fs::read_dir(directory)?
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".json"))
        .collect();
    names.sort();
    names
        .into_iter()
        .map(|name| {
            let document = serde_json::from_slice(&fs::read(directory.join(&name))?).map_err(io::Error::other)?;
            Ok((name, document))
        })
        .collect()
}

fn pseudo_random(seed: u64, stream: u64, index: u64) -> u64 {
    let mut value = seed ^ stream.wrapping_mul(0x9e37_79b9_7f4a_7c15) ^ index.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn uuid_builder(seed: u64, stream: u64, index: u64) -> Builder {
    let high = u128::from(pseudo_random(seed, stream, index));
    let low = u128::from(pseudo_random(seed, stream + 1, index));
    Builder::from_random_bytes(((high << 64) | low).to_be_bytes())
}

fn device_ids(options: &Options) -> Vec<Uuid> {
    (0..options.devices.max(1) as u64).map(|index| uuid_builder(options.seed, DEVICE_ID_STREAM, index).into_uuid()).collect()
}

pub fn generate(fixtures: &[Value], options: &Options) -> Vec<GeneratedUpload> {
    let devices = device_ids(options);
    (0..options.uploads)
        .map(|position| {
            let index = position as u64;
            let fixture = &fixtures[position % fixtures.len()];
            let upload_id = uuid_builder(options.seed, UPLOAD_ID_STREAM, index).with_version(Version::SortRand).into_uuid();
            let device_id = devices[position % devices.len()];
            let east_meters = (index % EAST_STEPS) as f64 * OFFSET_STEP_METERS;
            let north_meters = ((index / EAST_STEPS) % NORTH_STEPS) as f64 * OFFSET_STEP_METERS;
            let days_back = (pseudo_random(options.seed, DAYS_BACK_STREAM, index) % DAYS_BACK) as i64;
            moved(fixture, upload_id, device_id, east_meters, north_meters, days_back * DAY_MILLIS)
        })
        .collect()
}

fn moved(fixture: &Value, upload_id: Uuid, device_id: Uuid, east_meters: f64, north_meters: f64, earlier_millis: i64) -> GeneratedUpload {
    let mut document = fixture.clone();
    document["uploadId"] = upload_id.hyphenated().to_string().into();
    document["deviceId"] = device_id.hyphenated().to_string().into();
    let shift = |value: &mut Value, millis: i64| {
        if let Some(time) = value.as_i64() {
            *value = (time - millis).into();
        }
    };
    shift(&mut document["clock"]["epochMillis"], earlier_millis);
    if let Some(fixes) = document["fixes"].as_array_mut() {
        for fix in fixes {
            shift(&mut fix["gnssTimeMillis"], earlier_millis);
            let latitude = fix["latitude"].as_f64().unwrap_or_default();
            let meters_per_degree_of_longitude = METERS_PER_DEGREE_OF_LATITUDE * latitude.to_radians().cos();
            fix["latitude"] = (latitude + north_meters / METERS_PER_DEGREE_OF_LATITUDE).into();
            fix["longitude"] = (fix["longitude"].as_f64().unwrap_or_default() + east_meters / meters_per_degree_of_longitude).into();
        }
    }
    let received_at_millis = last_reading_millis(&document) + ARRIVAL_AFTER_LAST_READING_MILLIS;
    GeneratedUpload { upload_id, device_id, received_at_millis, document }
}

fn last_reading_millis(document: &Value) -> i64 {
    let elapsed_at_clock = document["clock"]["elapsedRealtimeMillis"].as_i64().unwrap_or_default();
    let epoch_at_clock = document["clock"]["epochMillis"].as_i64().unwrap_or_default();
    let times =
        ["fixes", "snapshots"].into_iter().flat_map(|list| document[list].as_array().into_iter().flatten()).filter_map(|item| item["t"].as_i64());
    let latest = times.fold(elapsed_at_clock, i64::max);
    epoch_at_clock + (latest - elapsed_at_clock)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;
    use serde_json::json;

    fn one_fixture() -> Vec<Value> {
        vec![json!({
            "uploadId": "x", "deviceId": "y",
            "clock": { "elapsedRealtimeMillis": 1_000, "epochMillis": 1_791_547_200_000_i64 },
            "fixes": [{ "t": 2_000, "gnssTimeMillis": 1_791_547_201_000_i64, "latitude": 52.0, "longitude": 21.0 }],
            "snapshots": [{ "t": 5_000 }]
        })]
    }

    #[test]
    fn the_same_seed_gives_the_same_corpus() {
        let options = Options { uploads: 20, devices: 3, seed: 7 };
        let first = generate(&one_fixture(), &options);
        let second = generate(&one_fixture(), &options);
        assert!(first.iter().zip(&second).all(|(one, other)| one.upload_id == other.upload_id && one.document == other.document));
        assert_eq!(first.iter().map(|upload| upload.upload_id).collect::<BTreeSet<_>>().len(), 20);
        assert_eq!(first.iter().map(|upload| upload.device_id).collect::<BTreeSet<_>>().len(), 3);
    }

    #[test]
    fn an_upload_arrives_an_hour_after_its_last_reading() {
        let options = Options { uploads: 1, devices: 1, seed: 7 };
        let upload = generate(&one_fixture(), &options).remove(0);
        let epoch = upload.document["clock"]["epochMillis"].as_i64().expect("a shifted clock");
        assert_eq!(upload.received_at_millis, epoch + 4_000 + ARRIVAL_AFTER_LAST_READING_MILLIS);
        assert_eq!(upload.document["uploadId"], upload.upload_id.hyphenated().to_string());
    }
}
