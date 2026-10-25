use engine_batch::document::Fix;
use engine_geo::Point;
use engine_geo::plane::{LocalPlane, bearing_degrees, distance_meters};

use crate::report::DropReason;

const MAX_ACCURACY_METERS: f64 = 50.0;
const MAX_SPEED_METERS_PER_SECOND: f64 = 100.0;
const MAX_ALTITUDE_METERS: f64 = 3_000.0;
const MAX_FIX_DISTANCE_MILLIS: u64 = 5_000;
const MAX_FIX_GAP_MILLIS: u64 = 10_000;
const MAX_EXTRAPOLATION_MILLIS: u64 = 2_000;
const STANDING_SPEED_METERS_PER_SECOND: f64 = 0.5;
const STANDING_MILLIS: u64 = 60_000;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub point: Point,
    pub accuracy_meters: f64,
    pub speed_meters_per_second: f64,
    pub is_standing_still: bool,
}

#[derive(Clone, Copy)]
enum FixQuality {
    Kept,
    Mock,
    PoorAccuracy,
    Implausible,
}

#[derive(Clone, Copy)]
struct TrackFix {
    t: u64,
    point: Point,
    accuracy_meters: f64,
    speed_meters_per_second: f64,
    bearing_degrees: Option<f64>,
    is_standing_still: bool,
}

pub struct Track {
    kept: Vec<TrackFix>,
    every_fix: Vec<(u64, FixQuality)>,
}

impl Track {
    pub fn build(fixes: &[Fix]) -> Self {
        let mut ordered: Vec<&Fix> = fixes.iter().collect();
        ordered.sort_by_key(|fix| fix.t);

        let mut every_fix = Vec::with_capacity(ordered.len());
        let mut kept: Vec<TrackFix> = Vec::with_capacity(ordered.len());
        for fix in ordered {
            let point = Point::new(fix.latitude, fix.longitude);
            let quality = if fix.is_mock {
                FixQuality::Mock
            } else if fix.accuracy_meters > MAX_ACCURACY_METERS {
                FixQuality::PoorAccuracy
            } else if fix.altitude_meters.is_some_and(|altitude| altitude > MAX_ALTITUDE_METERS) || jumps_from(kept.last(), fix.t, point) {
                FixQuality::Implausible
            } else {
                FixQuality::Kept
            };
            every_fix.push((fix.t, quality));
            if matches!(quality, FixQuality::Kept) {
                let travelled = kept.last().map(|previous| (previous, distance_meters(previous.point, point)));
                let speed = fix.speed_meters_per_second.unwrap_or_else(|| match travelled {
                    Some((previous, meters)) if fix.t > previous.t => meters / ((fix.t - previous.t) as f64 / 1_000.0),
                    _ => 0.0,
                });
                let bearing = fix.bearing_degrees.or_else(|| travelled.filter(|(_, meters)| *meters > 0.0).map(|(previous, _)| bearing_degrees(previous.point, point)));
                kept.push(TrackFix { t: fix.t, point, accuracy_meters: fix.accuracy_meters, speed_meters_per_second: speed, bearing_degrees: bearing, is_standing_still: false });
            }
        }
        mark_standing_still(&mut kept);
        Self { kept, every_fix }
    }

    pub fn place(&self, t: u64) -> Result<Placement, DropReason> {
        let after_index = self.kept.partition_point(|fix| fix.t <= t);
        let before = after_index.checked_sub(1).map(|index| &self.kept[index]);
        let after = self.kept.get(after_index);

        if let Some(before) = before.filter(|before| before.t == t) {
            return Ok(Placement { point: before.point, accuracy_meters: before.accuracy_meters, speed_meters_per_second: before.speed_meters_per_second, is_standing_still: before.is_standing_still });
        }
        if let (Some(before), Some(after)) = (before, after)
            && t - before.t <= MAX_FIX_DISTANCE_MILLIS
            && after.t - t <= MAX_FIX_DISTANCE_MILLIS
            && after.t - before.t <= MAX_FIX_GAP_MILLIS
        {
            return Ok(interpolate(before, after, t));
        }
        if let Some(before) = before.filter(|before| t - before.t <= MAX_EXTRAPOLATION_MILLIS) {
            return Ok(extrapolate(before, t));
        }
        Err(self.why_unplaced(t))
    }

    fn why_unplaced(&self, t: u64) -> DropReason {
        let after_index = self.every_fix.partition_point(|(fix_t, _)| *fix_t <= t);
        let nearest = [after_index.checked_sub(1).map(|index| self.every_fix[index]), self.every_fix.get(after_index).copied()];
        let nearby: Vec<FixQuality> = nearest.into_iter().flatten().filter(|(fix_t, _)| fix_t.abs_diff(t) <= MAX_FIX_DISTANCE_MILLIS).map(|(_, quality)| quality).collect();
        if nearby.iter().any(|quality| matches!(quality, FixQuality::Mock)) {
            DropReason::MockLocation
        } else if nearby.iter().any(|quality| matches!(quality, FixQuality::PoorAccuracy)) {
            DropReason::PoorAccuracy
        } else if nearby.iter().any(|quality| matches!(quality, FixQuality::Implausible)) {
            DropReason::ImplausibleFix
        } else {
            DropReason::NoPosition
        }
    }
}

fn jumps_from(previous: Option<&TrackFix>, t: u64, point: Point) -> bool {
    let Some(previous) = previous else {
        return false;
    };
    let meters = distance_meters(previous.point, point);
    if t == previous.t {
        return meters > 0.0;
    }
    meters / ((t - previous.t) as f64 / 1_000.0) > MAX_SPEED_METERS_PER_SECOND
}

fn mark_standing_still(fixes: &mut [TrackFix]) {
    let is_moving = |fix: &TrackFix| fix.speed_meters_per_second >= STANDING_SPEED_METERS_PER_SECOND;
    for run in fixes.chunk_by_mut(|first, second| is_moving(first) == is_moving(second)) {
        if !is_moving(&run[0]) && run[run.len() - 1].t - run[0].t > STANDING_MILLIS {
            for fix in run {
                fix.is_standing_still = true;
            }
        }
    }
}

fn interpolate(before: &TrackFix, after: &TrackFix, t: u64) -> Placement {
    let share = (t - before.t) as f64 / (after.t - before.t) as f64;
    let plane = LocalPlane::around(before.point);
    let (east, north) = plane.to_plane(after.point);
    let point = plane.to_point(east * share, north * share);
    let nearer = if share <= 0.5 { before } else { after };
    let segment_meters = east.hypot(north);
    Placement {
        point,
        accuracy_meters: before.accuracy_meters.max(after.accuracy_meters) + distance_meters(point, nearer.point) / 2.0,
        speed_meters_per_second: segment_meters / ((after.t - before.t) as f64 / 1_000.0),
        is_standing_still: nearer.is_standing_still,
    }
}

fn extrapolate(before: &TrackFix, t: u64) -> Placement {
    let seconds = (t - before.t) as f64 / 1_000.0;
    let meters = before.speed_meters_per_second * seconds;
    let point = match before.bearing_degrees {
        Some(bearing) if meters > 0.0 => {
            let bearing = bearing.to_radians();
            LocalPlane::around(before.point).to_point(meters * bearing.sin(), meters * bearing.cos())
        }
        _ => before.point,
    };
    Placement {
        point,
        accuracy_meters: before.accuracy_meters + meters / 2.0,
        speed_meters_per_second: before.speed_meters_per_second,
        is_standing_still: before.is_standing_still,
    }
}
