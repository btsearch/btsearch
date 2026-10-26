#![allow(dead_code)]

use std::collections::BTreeMap;

use engine_estimate::antenna::{angle_between_deg, bearing_deg, gain_db};
use engine_estimate::calibration::AreaClass;
use engine_estimate::input::{Bin, Cell, Context, Site, Technology, TimingAdvance};
use engine_estimate::objective::slant_m;
use engine_estimate::timing_advance::GSM_STEP_M;
use engine_geo::Point;
use engine_geo::plane::LocalPlane;
use engine_geo::square::{offset_centimetres, square_at};

pub const SITE: Point = Point { latitude: 52.2297, longitude: 21.0122 };
pub const DAY: i32 = 20_400;
const READING_WEIGHT_MILLI: i64 = 1_000;
const CHANNEL: i32 = 1_300;
const PATH_LOSS_DB_PER_DECADE: f64 = 35.0;

pub struct Sector {
    pub key: i64,
    pub azimuth_deg: f64,
    pub power_db: f64,
}

pub fn three_sectors() -> Vec<Sector> {
    [0.0, 120.0, 240.0]
        .into_iter()
        .enumerate()
        .map(|(index, azimuth_deg)| Sector { key: 31_604_736 + index as i64 + 1, azimuth_deg, power_db: 40.0 })
        .collect()
}

pub fn context() -> Context {
    Context::uncalibrated()
}

pub fn plane() -> LocalPlane {
    LocalPlane::around(SITE)
}

pub fn ring_of_readings(from_m: f64, to_m: f64, distance_step_m: f64, bearing_step_deg: f64) -> Vec<(f64, f64)> {
    let mut readings = Vec::new();
    let mut distance = from_m;
    while distance <= to_m {
        let mut bearing: f64 = 0.0;
        while bearing < 360.0 {
            readings.push((distance * bearing.to_radians().sin(), distance * bearing.to_radians().cos()));
            bearing += bearing_step_deg;
        }
        distance += distance_step_m;
    }
    readings
}

pub fn reflection_m(index: usize) -> f64 {
    ((index * 37) % 41) as f64
}

fn measured_m(technology: Technology, distance_m: f64, index: usize) -> f64 {
    match technology {
        Technology::Gsm => (distance_m / GSM_STEP_M).round() * GSM_STEP_M,
        _ => distance_m + reflection_m(index),
    }
}

fn uncalibrated_error_table(technology: Technology) -> usize {
    Context::uncalibrated_error_table(technology).expect("the technology has timing advance")
}

#[derive(Default)]
struct BinSums {
    sample_count: i64,
    weight_milli: i64,
    serving_weight_milli: i64,
    level_wsum: i64,
    offset_x_wsum: i64,
    offset_y_wsum: i64,
}

pub fn site_from_readings(sectors: &[Sector], readings: &[(f64, f64)], site_at: (f64, f64), with_timing_advance: bool) -> Site {
    site_of(Technology::Lte, sectors, readings, site_at, with_timing_advance)
}

pub fn site_of(technology: Technology, sectors: &[Sector], readings: &[(f64, f64)], site_at: (f64, f64), with_timing_advance: bool) -> Site {
    let plane = plane();
    let mut bins: BTreeMap<(usize, u64), BinSums> = BTreeMap::new();
    let mut timing_advance: Vec<Vec<TimingAdvance>> = sectors.iter().map(|_| Vec::new()).collect();
    for (index, &(east, north)) in readings.iter().enumerate() {
        let point = plane.to_point(east, north);
        let square = square_at(point);
        let (offset_east, offset_north) = offset_centimetres(square, point);
        let (from_site_east, from_site_north) = (east - site_at.0, north - site_at.1);
        let bearing = bearing_deg(from_site_east, from_site_north);
        let distance = slant_m(from_site_east, from_site_north);
        let levels: Vec<f64> = sectors
            .iter()
            .map(|sector| sector.power_db + gain_db(angle_between_deg(bearing, sector.azimuth_deg)) - PATH_LOSS_DB_PER_DECADE * distance.log10())
            .collect();
        let serving = (0..sectors.len()).max_by(|&a, &b| levels[a].total_cmp(&levels[b])).unwrap_or(0);
        for (cell, level) in levels.iter().enumerate() {
            let sums = bins.entry((cell, square)).or_default();
            sums.sample_count += 1;
            sums.weight_milli += READING_WEIGHT_MILLI;
            sums.level_wsum += READING_WEIGHT_MILLI * (level * 100.0).round() as i64;
            sums.offset_x_wsum += READING_WEIGHT_MILLI * i64::from(offset_east);
            sums.offset_y_wsum += READING_WEIGHT_MILLI * i64::from(offset_north);
            if cell == serving {
                sums.serving_weight_milli += READING_WEIGHT_MILLI;
            }
        }
        if with_timing_advance {
            timing_advance[serving].push(TimingAdvance {
                square,
                distance_m: measured_m(technology, distance, index),
                sample_count: 1,
                weight_milli: READING_WEIGHT_MILLI,
                last_seen_on: DAY,
                error_model: uncalibrated_error_table(technology),
            });
        }
    }

    let cells = sectors
        .iter()
        .enumerate()
        .zip(timing_advance)
        .map(|((cell, sector), timing_advance)| Cell {
            key: sector.key,
            technology,
            area_class: AreaClass::Town,
            channel: Some(CHANNEL),
            bins: bins
                .iter()
                .filter(|((of, _), _)| *of == cell)
                .map(|(&(_, square), sums)| Bin {
                    square,
                    sample_count: sums.sample_count,
                    weight_milli: sums.weight_milli,
                    serving_weight_milli: sums.serving_weight_milli,
                    level_wsum: sums.level_wsum,
                    offset_x_wsum: sums.offset_x_wsum,
                    offset_y_wsum: sums.offset_y_wsum,
                    quality_weight_milli: 0,
                    quality_wsum: 0,
                    sinr_weight_milli: 0,
                    sinr_wsum: 0,
                    stationary_count: 0,
                    first_seen_on: DAY - 3,
                    last_seen_on: DAY,
                })
                .collect(),
            timing_advance,
        })
        .collect();
    Site { cells, handovers: Vec::new(), contributor_count: 3, person_count: 2 }
}

pub fn timing_advance_only(key: i64, readings: &[(f64, f64)], site_at: (f64, f64)) -> Cell {
    let plane = plane();
    let timing_advance = readings
        .iter()
        .enumerate()
        .map(|(index, &(east, north))| TimingAdvance {
            square: square_at(plane.to_point(east, north)),
            distance_m: measured_m(Technology::Lte, slant_m(east - site_at.0, north - site_at.1), index),
            sample_count: 1,
            weight_milli: READING_WEIGHT_MILLI,
            last_seen_on: DAY,
            error_model: uncalibrated_error_table(Technology::Lte),
        })
        .collect();
    Cell { key, technology: Technology::Lte, area_class: AreaClass::Town, channel: None, bins: Vec::new(), timing_advance }
}

pub fn metres_from_site(point: Point) -> f64 {
    let (east, north) = plane().to_plane(point);
    (east * east + north * north).sqrt()
}
