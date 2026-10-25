mod edges;
mod footprint;

pub use edges::{Beyond, EDGE_DAYS, EDGE_ZOOM, Edge, EdgeKind, Surroundings, edge_squares, edges_of};

use std::collections::BTreeMap;

use engine_geo::Point;
use engine_geo::plane::LocalPlane;
use engine_geo::square::square_centre;

use crate::Estimate;
use crate::antenna::{bearing_deg, circular_mean_deg};
use crate::input::{Bin, Cell};
use crate::search::distance_between;
use crate::statistics::weighted_quantile;
use footprint::footprint_of;

pub const SHAPE_VERSION: i16 = 1;
const LEAST_SAMPLES: i64 = 200;
const SPREAD_SHARE: f64 = 0.8;
const REACH_SHARE: f64 = 0.95;
const PROFILE_BAND_M: f64 = 250.0;

#[derive(Debug, Clone, PartialEq)]
pub struct LevelBand {
    pub distance_band: i16,
    pub mean_level_centi_db: i32,
    pub mean_sinr_centi_db: Option<i32>,
    pub sample_count: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Shape {
    pub bearing_deg: f64,
    pub spread_deg: f64,
    pub reach_m: i32,
    pub reach_ta_m: Option<i32>,
    pub mean_quality_centi_db: Option<i32>,
    pub mean_sinr_centi_db: Option<i32>,
    pub footprint: Vec<Point>,
    pub profile: Vec<LevelBand>,
}

struct ServedSquare {
    distance_m: f64,
    bearing_deg: f64,
    weight: f64,
}

#[derive(Default)]
struct BandSums {
    level_wsum: i64,
    weight_milli: i64,
    sinr_wsum: i64,
    sinr_weight_milli: i64,
    sample_count: i64,
}

pub fn shape_of(cell: &Cell, estimate: &Estimate) -> Option<Shape> {
    let sample_count: i64 = cell.bins.iter().map(|bin| bin.sample_count).sum();
    if estimate.alternative_point.is_some() || sample_count < LEAST_SAMPLES {
        return None;
    }
    let plane = LocalPlane::around(estimate.point);
    let place_of = |square: u64| plane.to_plane(square_centre(square));
    let served: Vec<ServedSquare> = cell
        .bins
        .iter()
        .filter(|bin| bin.serving_weight_milli > 0)
        .map(|bin| {
            let place = place_of(bin.square);
            ServedSquare {
                distance_m: distance_between(place, (0.0, 0.0)),
                bearing_deg: bearing_deg(place.0, place.1),
                weight: bin.serving_weight_milli as f64,
            }
        })
        .collect();
    let uncertainty = f64::from(estimate.uncertainty_m.max(1));
    let certainty = |served: &ServedSquare| served.distance_m.powi(2) / (served.distance_m.powi(2) + uncertainty.powi(2));
    let bearings: Vec<(f64, f64)> = served
        .iter()
        .map(|square| (square.bearing_deg, square.weight * certainty(square)))
        .collect();
    let bearing = circular_mean_deg(bearings.iter().copied())?;
    let footprint = footprint_of(cell, &plane)?;

    Some(Shape {
        bearing_deg: bearing,
        spread_deg: narrowest_arc_deg(bearings, SPREAD_SHARE),
        reach_m: weighted_quantile(served.iter().map(|square| (square.distance_m, square.weight)).collect(), REACH_SHARE)?.round() as i32,
        reach_ta_m: weighted_quantile(
            cell.timing_advance.iter().map(|row| (row.distance_m, row.weight_milli as f64)).collect(),
            REACH_SHARE,
        )
        .map(|reach| reach.round() as i32),
        mean_quality_centi_db: mean_centi(cell.bins.iter().map(|bin| (bin.quality_wsum, bin.quality_weight_milli))),
        mean_sinr_centi_db: mean_centi(cell.bins.iter().map(|bin| (bin.sinr_wsum, bin.sinr_weight_milli))),
        footprint: footprint.iter().map(|&(east, north)| plane.to_point(east, north)).collect(),
        profile: profile_of(&cell.bins, &place_of),
    })
}

fn mean_centi(weighted_sums: impl Iterator<Item = (i64, i64)>) -> Option<i32> {
    let (sum, weight) = weighted_sums.fold((0_i64, 0_i64), |(sum, weight), (bin_sum, bin_weight)| {
        (sum + bin_sum, weight + bin_weight)
    });
    (weight > 0).then(|| (sum as f64 / weight as f64).round() as i32)
}

fn narrowest_arc_deg(mut bearings: Vec<(f64, f64)>, share: f64) -> f64 {
    bearings.sort_by(|a, b| a.0.total_cmp(&b.0));
    let total: f64 = bearings.iter().map(|(_, weight)| weight).sum();
    let around: Vec<(f64, f64)> = bearings
        .iter()
        .copied()
        .chain(bearings.iter().map(|&(bearing, weight)| (bearing + 360.0, weight)))
        .collect();
    let mut narrowest: f64 = 360.0;
    let (mut end, mut held) = (0, 0.0);
    for start in 0..bearings.len() {
        while end < start + bearings.len() && held < total * share {
            held += around[end].1;
            end += 1;
        }
        if held >= total * share {
            narrowest = narrowest.min(around[end - 1].0 - around[start].0);
        }
        held -= around[start].1;
    }
    narrowest
}

fn profile_of(bins: &[Bin], place_of: &impl Fn(u64) -> (f64, f64)) -> Vec<LevelBand> {
    let mut bands: BTreeMap<i16, BandSums> = BTreeMap::new();
    for bin in bins.iter().filter(|bin| bin.weight_milli > 0) {
        let band = (distance_between(place_of(bin.square), (0.0, 0.0)) / PROFILE_BAND_M).floor() as i16;
        let sums = bands.entry(band).or_default();
        sums.level_wsum += bin.level_wsum;
        sums.weight_milli += bin.weight_milli;
        sums.sinr_wsum += bin.sinr_wsum;
        sums.sinr_weight_milli += bin.sinr_weight_milli;
        sums.sample_count += bin.sample_count;
    }
    bands
        .into_iter()
        .map(|(distance_band, sums)| LevelBand {
            distance_band,
            mean_level_centi_db: (sums.level_wsum as f64 / sums.weight_milli as f64).round() as i32,
            mean_sinr_centi_db: (sums.sinr_weight_milli > 0).then(|| (sums.sinr_wsum as f64 / sums.sinr_weight_milli as f64).round() as i32),
            sample_count: sums.sample_count.min(i64::from(i32::MAX)) as i32,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_narrowest_arc_wraps_around_north() {
        let bearings = vec![(350.0, 1.0), (0.0, 1.0), (10.0, 1.0), (180.0, 0.1)];
        assert!((narrowest_arc_deg(bearings, 0.8) - 20.0).abs() < 1e-9);
    }
}
