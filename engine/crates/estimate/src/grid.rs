use engine_geo::Point;

use crate::Estimate;
use crate::confidence::tempered;
use crate::input::{Context, Site};
use crate::objective::Problem;

const GRID_CELL_M: f64 = 50.0;
const REACH_IN_RADII: f64 = 3.0;
const LEAST_REACH_M: f64 = 500.0;
const MOST_REACH_M: f64 = 2_500.0;
const SHOWN_BELOW_COST: f64 = 6.0;
const COST_STEPS_PER_UNIT: f64 = 10.0;

#[derive(Debug, Clone, PartialEq)]
pub struct EvidenceGrid {
    pub origin: Point,
    pub cell_m: i16,
    pub columns: i16,
    pub rows: i16,
    pub cost: Vec<u8>,
}

pub fn evidence_grid(site: &Site, estimate: &Estimate, context: &Context) -> Option<EvidenceGrid> {
    let problem = Problem::new(site, context)?;
    let parameters = estimate.cell_parameters();
    let (centre_east, centre_north) = problem.plane.to_plane(estimate.point);
    let reach = (f64::from(estimate.uncertainty_m) * REACH_IN_RADII).clamp(LEAST_REACH_M, MOST_REACH_M);
    let steps = (reach / GRID_CELL_M).ceil() as i32;
    let side = (2 * steps + 1) as usize;
    let offset_m = |step: i32| f64::from(step) * GRID_CELL_M;

    let costs: Vec<f64> = (-steps..=steps)
        .flat_map(|row| (-steps..=steps).map(move |column| (row, column)))
        .map(|(row, column)| {
            let (east, north) = (centre_east + offset_m(column), centre_north + offset_m(row));
            let sightlines = problem.sightlines(east, north);
            let fitted = problem.total_cost_along(east, north, &sightlines, &parameters);
            let likely = problem.total_cost_along(east, north, &sightlines, &problem.likely_parameters(&sightlines));
            tempered((fitted.min(likely) - estimate.cost).max(0.0), estimate.ellipse_scale)
        })
        .collect();
    let shown: Vec<(usize, usize)> = (0..side)
        .flat_map(|row| (0..side).map(move |column| (row, column)))
        .filter(|&(row, column)| costs[row * side + column] < SHOWN_BELOW_COST)
        .collect();
    let (first_row, last_row) = (shown.iter().map(|&(row, _)| row).min()?, shown.iter().map(|&(row, _)| row).max()?);
    let (first_column, last_column) = (
        shown.iter().map(|&(_, column)| column).min()?,
        shown.iter().map(|&(_, column)| column).max()?,
    );

    let cost = (first_row..=last_row)
        .flat_map(|row| (first_column..=last_column).map(move |column| (row, column)))
        .map(|(row, column)| (costs[row * side + column] * COST_STEPS_PER_UNIT).round().clamp(0.0, 255.0) as u8)
        .collect();
    let origin_east = centre_east + offset_m(first_column as i32 - steps) - GRID_CELL_M / 2.0;
    let origin_north = centre_north + offset_m(first_row as i32 - steps) - GRID_CELL_M / 2.0;
    Some(EvidenceGrid {
        origin: problem.plane.to_point(origin_east, origin_north),
        cell_m: GRID_CELL_M as i16,
        columns: (last_column - first_column + 1) as i16,
        rows: (last_row - first_row + 1) as i16,
        cost,
    })
}
