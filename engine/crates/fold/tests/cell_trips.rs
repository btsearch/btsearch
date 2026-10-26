mod common;

use common::{DEVICE_ID, Leg, drive, drive_document, inputs, no_outlines, read_batch};
use engine_batch::document::Batch;
use engine_fold::deltas::Deltas;
use engine_fold::fold;
use engine_fold::memory::{Direction, MemoryDigest};
use serde_json::json;

const SIX_MINUTES: u64 = 6 * 60 * 1000;
const SPEED: f64 = 9.0;
const FIRST_UPLOAD_ID: &str = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9e01";
const SECOND_UPLOAD_ID: &str = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9e02";
const SECOND_DEVICE_ID: &str = "01a0bdd4-4400-7d2e-8f30-415263748597";

fn leg(seconds: u64, meters_per_second: f64) -> Leg {
    Leg { seconds, meters_per_second }
}

fn there_and_back() -> [Leg; 3] {
    [leg(80, SPEED), leg(90, 0.0), leg(80, SPEED)]
}

fn folded(batch: &Batch, device_id: &str) -> Deltas {
    let outlines = no_outlines();
    let mut inputs = inputs(&outlines);
    inputs.device_id = device_id.to_owned();
    fold(batch, &inputs).deltas
}

fn trip_counts(deltas: &Deltas) -> Vec<i64> {
    deltas.cell_contributors.values().map(|row| row.trip_count).collect()
}

fn trips_with(legs: &[Leg], marks: (Option<bool>, Option<bool>)) -> Vec<i64> {
    trip_counts(&folded(&drive(legs, None, marks), DEVICE_ID))
}

fn digest_of(deltas: &[&Deltas]) -> MemoryDigest {
    let mut digest = MemoryDigest::default();
    for delta in deltas {
        digest.apply(delta, Direction::Add);
    }
    digest
}

fn with_a_neighbour_on_the_way_back(legs: &[Leg]) -> Batch {
    let mut document = drive_document(FIRST_UPLOAD_ID, legs, None, (None, None));
    let neighbour = json!({ "rat": "lte", "plmn": "26006", "eci": 31_604_748, "tac": 58_140, "earfcn": 1_300, "pci": 302 });
    document["cells"].as_array_mut().expect("the drive has cells").push(neighbour);
    let way_back = legs[..legs.len() - 1].iter().map(|leg| leg.seconds as usize).sum::<usize>();
    for snapshot in document["snapshots"].as_array_mut().expect("the drive has snapshots").iter_mut().skip(way_back) {
        let measurements = snapshot["measurements"].as_array_mut().expect("a snapshot has measurements");
        measurements.push(json!({ "cell": 1, "role": "neighbour", "rsrpDbm": -104 }));
    }
    read_batch(&document)
}

#[test]
fn going_from_a_to_b_and_back_after_a_stop_is_two_trips() {
    assert_eq!(trips_with(&there_and_back(), (None, None)), [2]);
}

#[test]
fn readings_before_and_after_a_five_minute_gap_are_two_trips() {
    let one_drive = [leg(80, SPEED), leg(80, SPEED)];
    assert_eq!(trips_with(&one_drive, (None, None)), [1]);
    assert_eq!(trip_counts(&folded(&drive(&one_drive, Some((0, SIX_MINUTES)), (None, None)), DEVICE_ID)), [2]);
}

#[test]
fn a_first_trip_the_batch_marks_as_begun_earlier_is_left_out() {
    assert_eq!(trips_with(&there_and_back(), (Some(true), None)), [1]);
    assert_eq!(trips_with(&there_and_back(), (Some(false), Some(true))), [2]);
    assert_eq!(trips_with(&there_and_back(), (None, Some(true))), [2], "a trip that goes on into the next upload is counted here");
    let stopped_first = [leg(90, 0.0), leg(80, SPEED), leg(90, 0.0), leg(80, SPEED)];
    assert_eq!(trips_with(&stopped_first, (Some(true), None)), [2], "a trip that begins after a stop began in this upload");
}

#[test]
fn trips_are_counted_per_cell_and_per_device() {
    let batch = with_a_neighbour_on_the_way_back(&there_and_back());
    let (phone, other_phone) = (folded(&batch, DEVICE_ID), folded(&batch, SECOND_DEVICE_ID));
    let digest = digest_of(&[&phone, &other_phone]);
    let counts: Vec<(i64, &str, i64)> =
        digest.tables.cell_contributors.iter().map(|(key, row)| (key.cell.cell_key, key.device_id.as_str(), row.trip_count)).collect();
    assert_eq!(
        counts,
        [(31_604_747, DEVICE_ID, 2), (31_604_747, SECOND_DEVICE_ID, 2), (31_604_748, DEVICE_ID, 1), (31_604_748, SECOND_DEVICE_ID, 1)]
    );
}

#[test]
fn folding_and_subtracting_an_upload_leaves_the_trip_count_as_it_was() {
    let first = folded(&drive(&there_and_back(), None, (None, None)), DEVICE_ID);
    let later = folded(&read_batch(&drive_document(SECOND_UPLOAD_ID, &[leg(80, SPEED)], None, (None, None))), DEVICE_ID);
    let before = digest_of(&[&first]);
    let mut digest = digest_of(&[&first, &later]);
    assert_eq!(trip_counts(&digest.tables), [3]);
    digest.apply(&later, Direction::Subtract);
    assert_eq!(digest.tables.cell_contributors, before.tables.cell_contributors);
}

#[test]
fn two_fold_orders_give_one_trip_count() {
    let first = folded(&drive(&there_and_back(), None, (Some(true), None)), DEVICE_ID);
    let second = folded(&read_batch(&drive_document(SECOND_UPLOAD_ID, &there_and_back(), None, (None, None))), DEVICE_ID);
    let forwards = digest_of(&[&first, &second]);
    let backwards = digest_of(&[&second, &first]);
    assert_eq!(trip_counts(&forwards.tables), [3]);
    assert_eq!(forwards.tables.cell_contributors, backwards.tables.cell_contributors);
}
