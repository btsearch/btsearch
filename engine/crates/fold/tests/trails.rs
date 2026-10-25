mod common;

use common::{Leg, drive, inputs, no_outlines};
use engine_batch::document::Batch;
use engine_fold::fold;

const SIX_MINUTES: u64 = 6 * 60 * 1000;
const SPEED: f64 = 9.0;

fn public_samples(batch: &Batch) -> i64 {
    let outlines = no_outlines();
    fold(batch, &inputs(&outlines)).deltas.trail_levels.values().map(|count| count.sample_count).sum()
}

fn person_samples(batch: &Batch) -> i64 {
    let outlines = no_outlines();
    fold(batch, &inputs(&outlines)).deltas.person_trail_bins.values().map(|bin| bin.sample_count).sum()
}

fn leg(seconds: u64, meters_per_second: f64) -> Leg {
    Leg { seconds, meters_per_second }
}

#[test]
fn trails_leave_out_100_m_at_each_end_the_upload_does_not_mark() {
    let one_trip = [leg(100, SPEED)];
    assert_eq!(public_samples(&drive(&one_trip, None, (None, None))), 76, "readings 12 to 87 of 0 to 99, 9 m apart");
    assert_eq!(public_samples(&drive(&one_trip, None, (Some(true), None))), 88);
    assert_eq!(public_samples(&drive(&one_trip, None, (None, Some(true)))), 88);
    assert_eq!(public_samples(&drive(&one_trip, None, (Some(true), Some(true)))), 100);
    assert_eq!(person_samples(&drive(&one_trip, None, (None, None))), 100);
}

#[test]
fn a_five_minute_gap_ends_one_trip_and_starts_another() {
    let legs = [leg(80, SPEED), leg(80, SPEED)];
    assert_eq!(public_samples(&drive(&legs, None, (None, None))), 136);
    assert_eq!(public_samples(&drive(&legs, Some((0, SIX_MINUTES)), (None, None))), 112);
    assert_eq!(public_samples(&drive(&legs, Some((0, SIX_MINUTES)), (Some(true), Some(true)))), 136);
}

#[test]
fn a_stop_ends_a_trip_and_its_readings_stay_out_of_public_trails() {
    let legs = [leg(80, SPEED), leg(90, 0.0), leg(80, SPEED)];
    let batch = drive(&legs, None, (Some(true), Some(true)));
    assert_eq!(public_samples(&batch), 136);
    assert_eq!(person_samples(&batch), 250);
}
