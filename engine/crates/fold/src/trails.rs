use std::collections::{BTreeMap, BTreeSet};

use engine_geo::Point;
use engine_geo::plane::distance_meters;

use crate::calendar::Day;
use crate::deltas::{CellContributorKey, Contribution, Count, Deltas, TRAIL_ZOOM, TrailLevelKey, TrailSquare, TrailSquareKey, absorb_into};
use crate::identity::{CellIdentity, Rat};
use crate::report::{FoldReport, SquareOrigin};

const TRIP_GAP_MILLIS: i64 = 5 * 60 * 1000;
const TRIP_END_METERS: f64 = 100.0;
const LOWEST_BUCKET_CENTI_DB: i64 = -12_000;
const BUCKET_CENTI_DB: i64 = 1_000;
const HIGHEST_BUCKET: i64 = 7;

pub struct TrailReading {
    pub epoch_millis: i64,
    pub point: Point,
    pub square: u64,
    pub is_standing_still: bool,
    pub plmn: String,
    pub rat: Rat,
    pub channel: Option<i64>,
    pub channel_held: bool,
    pub level_centi_db: i64,
    pub day: Day,
    pub country_code: Option<String>,
}

pub struct TripMarks {
    pub starts_mid_trip: bool,
    pub ends_mid_trip: bool,
}

pub fn fold_trips(
    mut readings: Vec<TrailReading>,
    cell_moments: &BTreeMap<CellIdentity, Vec<i64>>,
    marks: &TripMarks,
    contributor_bit: u64,
    deltas: &mut Deltas,
    report: &mut FoldReport,
) {
    readings.sort_by_key(|reading| reading.epoch_millis);
    let trips = split_into_trips(&readings);
    count_trips_of_cells(&readings, &trips, marks, cell_moments, &mut deltas.cell_contributors);
    for trip in &trips {
        let keeps_start = trip.began_in_an_earlier_upload(marks);
        let keeps_end = trip.goes_on_in_a_later_upload(marks);
        for reading in kept_part(&readings[trip.first..=trip.last], keeps_start, keeps_end) {
            add_to_trail(reading, contributor_bit, deltas, report);
        }
    }
}

struct Trip {
    first: usize,
    last: usize,
    starts_at_upload_start: bool,
    ends_at_upload_end: bool,
}

impl Trip {
    fn began_in_an_earlier_upload(&self, marks: &TripMarks) -> bool {
        self.starts_at_upload_start && marks.starts_mid_trip
    }

    fn goes_on_in_a_later_upload(&self, marks: &TripMarks) -> bool {
        self.ends_at_upload_end && marks.ends_mid_trip
    }
}

fn count_trips_of_cells(
    readings: &[TrailReading],
    trips: &[Trip],
    marks: &TripMarks,
    cell_moments: &BTreeMap<CellIdentity, Vec<i64>>,
    contributions: &mut BTreeMap<CellContributorKey, Contribution>,
) {
    let spans: Vec<(i64, i64)> = trips
        .iter()
        .filter(|trip| !trip.began_in_an_earlier_upload(marks))
        .map(|trip| (readings[trip.first].epoch_millis, readings[trip.last].epoch_millis))
        .collect();
    for (key, contribution) in contributions.iter_mut() {
        let moments = cell_moments.get(&key.cell).into_iter().flatten();
        let trips_seen_on: BTreeSet<usize> = moments.filter_map(|&moment| span_holding(&spans, moment)).collect();
        contribution.trip_count = trips_seen_on.len() as i64;
    }
}

fn span_holding(spans: &[(i64, i64)], moment: i64) -> Option<usize> {
    let index = spans.partition_point(|&(start, _)| start <= moment).checked_sub(1)?;
    (moment <= spans[index].1).then_some(index)
}

fn split_into_trips(readings: &[TrailReading]) -> Vec<Trip> {
    let mut trips: Vec<Trip> = Vec::new();
    let mut current: Option<Trip> = None;
    for (index, reading) in readings.iter().enumerate() {
        if reading.is_standing_still {
            trips.extend(current.take());
            continue;
        }
        if let Some(trip) = current.as_mut()
            && reading.epoch_millis - readings[trip.last].epoch_millis <= TRIP_GAP_MILLIS
        {
            trip.last = index;
            continue;
        }
        trips.extend(current.take());
        current = Some(Trip { first: index, last: index, starts_at_upload_start: index == 0, ends_at_upload_end: false });
    }
    trips.extend(current);
    if let Some(trip) = trips.last_mut() {
        trip.ends_at_upload_end = trip.last + 1 == readings.len();
    }
    trips
}

fn kept_part(trip: &[TrailReading], keeps_start: bool, keeps_end: bool) -> impl Iterator<Item = &TrailReading> {
    let mut along = Vec::with_capacity(trip.len());
    let mut travelled = 0.0;
    for (index, reading) in trip.iter().enumerate() {
        if index > 0 {
            travelled += distance_meters(trip[index - 1].point, reading.point);
        }
        along.push(travelled);
    }
    let total = travelled;
    trip.iter()
        .zip(along)
        .filter(move |(_, along)| (keeps_start || *along >= TRIP_END_METERS) && (keeps_end || total - along >= TRIP_END_METERS))
        .map(|(reading, _)| reading)
}

fn add_to_trail(reading: &TrailReading, contributor_bit: u64, deltas: &mut Deltas, report: &mut FoldReport) {
    let Some(channel) = reading.channel else {
        return;
    };
    let square =
        TrailSquareKey { plmn: reading.plmn.clone(), rat: reading.rat, channel, zoom: TRAIL_ZOOM, bin: reading.square, held: reading.channel_held };
    if !square.held
        && let Some(country_code) = &reading.country_code
    {
        report
            .trail_square_origins
            .entry(square.clone())
            .or_insert_with(|| SquareOrigin { country_code: country_code.clone(), month: reading.day.first_of_month() });
    }
    let level_bucket = level_bucket(reading.level_centi_db);
    absorb_into(&mut deltas.trail_squares, square.clone(), TrailSquare { contributor_bits: contributor_bit, last_seen_on: reading.day });
    absorb_into(&mut deltas.trail_levels, TrailLevelKey { square, level_bucket }, Count { sample_count: 1 });
}

fn level_bucket(level_centi_db: i64) -> u8 {
    if level_centi_db < LOWEST_BUCKET_CENTI_DB {
        return 0;
    }
    ((level_centi_db - LOWEST_BUCKET_CENTI_DB) / BUCKET_CENTI_DB + 1).min(HIGHEST_BUCKET) as u8
}
