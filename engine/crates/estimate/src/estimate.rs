use std::collections::BTreeSet;

use engine_geo::Point;
use engine_geo::square::square_centre;

use crate::antenna::bearing_deg;
use crate::confidence::{CHI_SQUARED_95_TWO_DIMENSIONS, circle_radius_95_m, is_surrounded, tempered};
use crate::input::{Context, EvidenceClass, Site, Technology};
use crate::objective::{CellParameters, Problem};
use crate::search::{Fit, MINIMA_APART_M, best_fits, distance_between, profiled_curvature};
use crate::statistics::weighted_quantile;
use crate::timing_advance::shortest_plausible_residual_m;

pub const ALGORITHM_VERSION: i16 = 1;
const AMBIGUITY_MARGIN: f64 = 3.0;
const UNKNOWN_SPREAD_M: f64 = 5_000.0;
const LEAST_JUDGED_WEIGHT: f64 = 3.0;

#[derive(Debug, Clone, PartialEq)]
pub struct CellFit {
    pub key: i64,
    pub azimuth_deg: f64,
    pub power_db: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Evidence {
    pub sample_count: i64,
    pub contributor_count: i32,
    pub person_count: i32,
    pub bin_count: i32,
    pub ta_sample_count: i64,
    pub gsm_ta_sample_count: i64,
    pub angular_coverage_deg: i16,
    pub distinct_days: i32,
    pub max_distance_m: i32,
}

impl Evidence {
    pub fn class(&self) -> EvidenceClass {
        EvidenceClass::of(self.ta_sample_count, self.gsm_ta_sample_count, self.person_count)
    }

    pub fn is_surrounded(&self) -> bool {
        is_surrounded(self.angular_coverage_deg)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Estimate {
    pub point: Point,
    pub cost: f64,
    pub uncertainty_m: i32,
    pub ellipse_major_m: i32,
    pub ellipse_minor_m: i32,
    pub ellipse_azimuth_deg: i16,
    pub ellipse_scale: f64,
    pub alternative_point: Option<Point>,
    pub is_consistent: bool,
    pub cells: Vec<CellFit>,
    pub evidence: Evidence,
}

impl Estimate {
    pub fn cell_parameters(&self) -> Vec<CellParameters> {
        self.cells.iter().map(|cell| CellParameters { azimuth_deg: cell.azimuth_deg, power_db: cell.power_db }).collect()
    }
}

struct Ellipse {
    major_m: f64,
    minor_m: f64,
    azimuth_deg: f64,
}

fn ellipse_of(curvature: [[f64; 2]; 2]) -> Ellipse {
    let [[a, b], [_, d]] = curvature;
    let determinant = a * d - b * b;
    if a <= 0.0 || determinant <= 0.0 {
        return Ellipse { major_m: UNKNOWN_SPREAD_M, minor_m: UNKNOWN_SPREAD_M, azimuth_deg: 0.0 };
    }
    let (variance_east, variance_north, covariance) = (d / determinant, a / determinant, -b / determinant);
    let mean = (variance_east + variance_north) / 2.0;
    let spread = (((variance_east - variance_north) / 2.0).powi(2) + covariance.powi(2)).sqrt();
    let (larger, smaller) = (mean + spread, (mean - spread).max(0.0));
    let axis = if covariance.abs() > f64::EPSILON {
        (larger - variance_north, covariance)
    } else if variance_east >= variance_north {
        (1.0, 0.0)
    } else {
        (0.0, 1.0)
    };
    Ellipse {
        major_m: (CHI_SQUARED_95_TWO_DIMENSIONS * larger).sqrt().min(UNKNOWN_SPREAD_M),
        minor_m: (CHI_SQUARED_95_TWO_DIMENSIONS * smaller).sqrt().min(UNKNOWN_SPREAD_M),
        azimuth_deg: bearing_deg(axis.0, axis.1).rem_euclid(180.0),
    }
}

fn timing_advance_says_closer(problem: &Problem, cell: usize, technology: Technology, fit: &Fit) -> bool {
    let Some(shortest_m) = technology.timing_advance_step_m().map(shortest_plausible_residual_m) else {
        return false;
    };
    let residuals: Vec<(f64, f64)> =
        problem.timing_advance.iter().filter(|row| row.cell == cell).map(|row| (row.residual_m(fit.east, fit.north), row.weight)).collect();
    let is_judged = residuals.iter().map(|(_, weight)| weight).sum::<f64>() >= LEAST_JUDGED_WEIGHT;
    is_judged && weighted_quantile(residuals, 0.5).is_some_and(|median_m| median_m < shortest_m)
}

fn levels_lie_beyond_reach(problem: &Problem, cell: usize, technology: Technology, fit: &Fit) -> bool {
    let distances: Vec<(f64, f64)> = problem
        .levels
        .iter()
        .filter(|row| row.cell == cell)
        .map(|row| (distance_between((row.east, row.north), (fit.east, fit.north)), row.weight))
        .collect();
    weighted_quantile(distances, 0.5).is_some_and(|median_m| median_m > technology.reach_m())
}

fn is_consistent(problem: &Problem, site: &Site, fit: &Fit) -> bool {
    site.cells.iter().enumerate().all(|(cell, input)| {
        !timing_advance_says_closer(problem, cell, input.technology, fit) && !levels_lie_beyond_reach(problem, cell, input.technology, fit)
    })
}

fn angular_coverage_deg(places: &[(f64, f64)], fit: &Fit) -> f64 {
    let mut bearings: Vec<f64> = places.iter().map(|&(east, north)| bearing_deg(east - fit.east, north - fit.north)).collect();
    if bearings.len() < 2 {
        return 0.0;
    }
    bearings.sort_by(f64::total_cmp);
    let gaps = bearings.windows(2).map(|pair| pair[1] - pair[0]);
    let around_north = bearings[0] + 360.0 - bearings[bearings.len() - 1];
    360.0 - gaps.chain(std::iter::once(around_north)).fold(0.0, f64::max)
}

fn evidence_of(problem: &Problem, site: &Site, fit: &Fit) -> Evidence {
    let squares: BTreeSet<u64> =
        site.cells.iter().flat_map(|cell| cell.bins.iter().map(|bin| bin.square).chain(cell.timing_advance.iter().map(|row| row.square))).collect();
    let places: Vec<(f64, f64)> = squares.iter().map(|&square| problem.plane.to_plane(square_centre(square))).collect();

    let days: BTreeSet<i32> = site
        .cells
        .iter()
        .flat_map(|cell| {
            cell.bins.iter().flat_map(|bin| [bin.first_seen_on, bin.last_seen_on]).chain(cell.timing_advance.iter().map(|row| row.last_seen_on))
        })
        .collect();

    Evidence {
        sample_count: site.cells.iter().flat_map(|cell| cell.bins.iter()).map(|bin| bin.sample_count).sum(),
        contributor_count: site.contributor_count,
        person_count: site.person_count,
        bin_count: squares.len() as i32,
        ta_sample_count: site.cells.iter().flat_map(|cell| cell.timing_advance.iter()).map(|row| row.sample_count).sum(),
        gsm_ta_sample_count: site
            .cells
            .iter()
            .filter(|cell| cell.technology == Technology::Gsm)
            .flat_map(|cell| cell.timing_advance.iter())
            .map(|row| row.sample_count)
            .sum(),
        angular_coverage_deg: angular_coverage_deg(&places, fit).round() as i16,
        distinct_days: days.len() as i32,
        max_distance_m: places.iter().map(|&place| distance_between(place, (fit.east, fit.north))).fold(0.0, f64::max).round() as i32,
    }
}

pub fn estimate(site: &Site, context: &Context) -> Option<Estimate> {
    let problem = Problem::new(site, context)?;
    let fits = best_fits(&problem);
    let best = fits.first()?;
    let evidence = evidence_of(&problem, site, best);
    let ellipse_scale = context.ellipse_scale(evidence.class(), evidence.is_surrounded());
    let alternative = fits.iter().skip(1).find(|fit| {
        tempered(fit.cost - best.cost, ellipse_scale) <= AMBIGUITY_MARGIN
            && distance_between((fit.east, fit.north), (best.east, best.north)) >= MINIMA_APART_M
    });

    let nominal = ellipse_of(profiled_curvature(&problem, best));
    let (major_m, minor_m) = (nominal.major_m * ellipse_scale, nominal.minor_m * ellipse_scale);
    let radius_m = circle_radius_95_m(major_m, minor_m);
    let uncertainty_m = alternative.map_or(radius_m, |other| distance_between((other.east, other.north), (best.east, best.north)) + radius_m);

    Some(Estimate {
        point: problem.plane.to_point(best.east, best.north),
        cost: best.cost,
        uncertainty_m: uncertainty_m.round() as i32,
        ellipse_major_m: major_m.round() as i32,
        ellipse_minor_m: minor_m.round() as i32,
        ellipse_azimuth_deg: nominal.azimuth_deg.round() as i16 % 180,
        ellipse_scale,
        alternative_point: alternative.map(|other| problem.plane.to_point(other.east, other.north)),
        is_consistent: is_consistent(&problem, site, best),
        cells: site
            .cells
            .iter()
            .zip(&best.parameters)
            .map(|(cell, parameters)| CellFit { key: cell.key, azimuth_deg: parameters.azimuth_deg, power_db: parameters.power_db })
            .collect(),
        evidence,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_round_curvature_gives_a_circle() {
        let ellipse = ellipse_of([[1.0 / 100.0, 0.0], [0.0, 1.0 / 100.0]]);
        assert!((ellipse.major_m - (CHI_SQUARED_95_TWO_DIMENSIONS * 100.0).sqrt()).abs() < 1e-9);
        assert!((ellipse.major_m - ellipse.minor_m).abs() < 1e-9);
    }

    #[test]
    fn the_ellipse_lies_along_the_flat_direction() {
        let ellipse = ellipse_of([[1.0, 0.0], [0.0, 1.0 / 400.0]]);
        assert!(ellipse.major_m > ellipse.minor_m);
        assert_eq!(ellipse.azimuth_deg.round(), 0.0, "flat towards the north");
    }

    #[test]
    fn a_curvature_that_is_not_a_minimum_gives_the_unknown_spread() {
        let ellipse = ellipse_of([[-1.0, 0.0], [0.0, 1.0]]);
        assert_eq!(ellipse.major_m, UNKNOWN_SPREAD_M);
    }
}
