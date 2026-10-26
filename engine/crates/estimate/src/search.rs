use crate::objective::{CellParameters, Problem};

const COARSE_STEP_M: f64 = 200.0;
const FINE_STEP_M: f64 = 50.0;
const FINE_REACH_M: f64 = 200.0;
const LEAST_PADDING_M: f64 = 500.0;
const MOST_PADDING_M: f64 = 15_000.0;
const COARSE_CANDIDATES: usize = 10;
const KEPT_MINIMA: usize = 5;
pub(crate) const MINIMA_APART_M: f64 = 500.0;
const SETTLED_M: f64 = 1.0;
const REFINE_ROUNDS: usize = 10;
const MARQUARDT_ITERATIONS: usize = 40;
const FIRST_DAMPING: f64 = 1e-3;
const DAMPING_FACTOR: f64 = 10.0;
const LEAST_DAMPING: f64 = 1e-9;
const MOST_DAMPING: f64 = 1e9;
const DERIVATIVE_STEP_M: f64 = 5.0;
const CURVATURE_STEP_M: f64 = 10.0;
const AZIMUTH_STEP_DEG: f64 = 10.0;
const POWER_REACH_DB: f64 = 10.0;
const GOLDEN_ITERATIONS: usize = 24;
const PARAMETER_SWEEPS: usize = 2;
const PROFILED_SWEEPS: usize = 1;

#[derive(Debug, Clone)]
pub(crate) struct Fit {
    pub east: f64,
    pub north: f64,
    pub parameters: Vec<CellParameters>,
    pub cost: f64,
}

pub(crate) fn distance_between(a: (f64, f64), b: (f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
}

fn coarse_cost(problem: &Problem, east: f64, north: f64) -> f64 {
    if problem.has_timing_advance() {
        return problem.timing_advance_cost(east, north) + problem.prior_cost(east, north);
    }
    let sightlines = problem.sightlines(east, north);
    problem.total_cost_along(east, north, &sightlines, &problem.likely_parameters(&sightlines))
}

fn search_area(problem: &Problem) -> (f64, f64, f64, f64) {
    let points = problem
        .timing_advance
        .iter()
        .map(|row| (row.east, row.north))
        .chain(problem.levels.iter().map(|row| (row.east, row.north)))
        .chain(problem.sectors.iter().map(|square| (square.east, square.north)));
    let (west, south, east, north) = points
        .fold((f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY), |(west, south, east, north), (x, y)| {
            (west.min(x), south.min(y), east.max(x), north.max(y))
        });
    let farthest = problem.timing_advance.iter().map(|row| row.distance_m).fold(0.0, f64::max);
    let padding = farthest.clamp(LEAST_PADDING_M, MOST_PADDING_M);
    (west - padding, south - padding, east + padding, north + padding)
}

fn grid_points(west: f64, south: f64, east: f64, north: f64, step: f64) -> (Vec<(f64, f64)>, usize) {
    let columns = ((east - west) / step).floor() as usize + 1;
    let rows = ((north - south) / step).floor() as usize + 1;
    let points = (0..rows).flat_map(|row| (0..columns).map(move |column| (west + column as f64 * step, south + row as f64 * step))).collect();
    (points, columns)
}

fn starting_points(problem: &Problem) -> Vec<(f64, f64)> {
    let (west, south, east, north) = search_area(problem);
    let (points, columns) = grid_points(west, south, east, north, COARSE_STEP_M);
    let costs: Vec<f64> = points.iter().map(|&(x, y)| coarse_cost(problem, x, y)).collect();
    let rows = points.len() / columns;
    let is_local_minimum = |index: usize| {
        let (row, column) = ((index / columns) as isize, (index % columns) as isize);
        (-1..=1)
            .flat_map(|row_step| (-1..=1).map(move |column_step| (row + row_step, column + column_step)))
            .filter(|&(near_row, near_column)| near_row >= 0 && near_column >= 0 && near_row < rows as isize && near_column < columns as isize)
            .all(|(near_row, near_column)| costs[near_row as usize * columns + near_column as usize] >= costs[index])
    };

    let mut minima: Vec<usize> = (0..points.len()).filter(|&index| is_local_minimum(index)).collect();
    minima.sort_by(|&a, &b| costs[a].total_cmp(&costs[b]).then(a.cmp(&b)));
    minima.truncate(COARSE_CANDIDATES);

    let mut refined: Vec<((f64, f64), f64)> = minima
        .into_iter()
        .map(|index| {
            let (x, y) = points[index];
            let (fine, _) = grid_points(x - FINE_REACH_M, y - FINE_REACH_M, x + FINE_REACH_M, y + FINE_REACH_M, FINE_STEP_M);
            fine.into_iter()
                .map(|point| (point, coarse_cost(problem, point.0, point.1)))
                .min_by(|a, b| a.1.total_cmp(&b.1))
                .unwrap_or(((x, y), costs[index]))
        })
        .collect();
    refined.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.0.total_cmp(&b.0.0)).then(a.0.1.total_cmp(&b.0.1)));

    let mut kept: Vec<(f64, f64)> = Vec::new();
    for (point, _) in refined {
        if kept.len() < KEPT_MINIMA && kept.iter().all(|&other| distance_between(other, point) >= MINIMA_APART_M) {
            kept.push(point);
        }
    }
    kept
}

fn golden_minimum(mut low: f64, mut high: f64, cost: &mut impl FnMut(f64) -> f64) -> f64 {
    let ratio = (5f64.sqrt() - 1.0) / 2.0;
    let mut left = high - ratio * (high - low);
    let mut right = low + ratio * (high - low);
    let (mut left_cost, mut right_cost) = (cost(left), cost(right));
    for _ in 0..GOLDEN_ITERATIONS {
        if left_cost <= right_cost {
            high = right;
            right = left;
            right_cost = left_cost;
            left = high - ratio * (high - low);
            left_cost = cost(left);
        } else {
            low = left;
            left = right;
            left_cost = right_cost;
            right = low + ratio * (high - low);
            right_cost = cost(right);
        }
    }
    if left_cost <= right_cost { left } else { right }
}

pub(crate) fn best_azimuth_deg(mut cost: impl FnMut(f64) -> f64) -> f64 {
    let scanned = (0..(360.0 / AZIMUTH_STEP_DEG) as usize)
        .map(|step| step as f64 * AZIMUTH_STEP_DEG)
        .map(|azimuth_deg| (azimuth_deg, cost(azimuth_deg)))
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map_or(0.0, |(azimuth_deg, _)| azimuth_deg);
    golden_minimum(scanned - AZIMUTH_STEP_DEG, scanned + AZIMUTH_STEP_DEG, &mut cost).rem_euclid(360.0)
}

pub(crate) fn fit_parameters(problem: &Problem, east: f64, north: f64, start: &[CellParameters], sweeps: usize) -> Vec<CellParameters> {
    let sightlines = problem.sightlines(east, north);
    let mut parameters = start.to_vec();
    for _ in 0..sweeps {
        for cell in (0..problem.cell_count).filter(|&cell| problem.has_cell_terms(cell)) {
            let azimuth = best_azimuth_deg(|azimuth_deg| {
                parameters[cell].azimuth_deg = azimuth_deg.rem_euclid(360.0);
                problem.cell_cost(cell, &sightlines, &parameters)
            });
            parameters[cell].azimuth_deg = azimuth;

            let fitted = problem.fitted_power_db(cell, &sightlines, azimuth);
            let mut power_cost = |power_db: f64| {
                parameters[cell].power_db = power_db;
                problem.cell_cost(cell, &sightlines, &parameters)
            };
            let power = golden_minimum(fitted - POWER_REACH_DB, fitted + POWER_REACH_DB, &mut power_cost);
            parameters[cell].power_db = power;
        }
    }
    parameters
}

struct Derivatives {
    gradient: [f64; 2],
    hessian: [[f64; 2]; 2],
}

fn derivatives(cost: &impl Fn(f64, f64) -> f64, east: f64, north: f64, centre_cost: f64, step: f64) -> Derivatives {
    let (e_plus, e_minus) = (cost(east + step, north), cost(east - step, north));
    let (n_plus, n_minus) = (cost(east, north + step), cost(east, north - step));
    let cross = cost(east + step, north + step) - cost(east + step, north - step) - cost(east - step, north + step) + cost(east - step, north - step);
    Derivatives {
        gradient: [(e_plus - e_minus) / (2.0 * step), (n_plus - n_minus) / (2.0 * step)],
        hessian: [
            [(e_plus - 2.0 * centre_cost + e_minus) / (step * step), cross / (4.0 * step * step)],
            [cross / (4.0 * step * step), (n_plus - 2.0 * centre_cost + n_minus) / (step * step)],
        ],
    }
}

fn solve(matrix: [[f64; 2]; 2], right: [f64; 2]) -> Option<[f64; 2]> {
    let determinant = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
    (determinant.abs() > f64::EPSILON).then(|| {
        [(right[0] * matrix[1][1] - right[1] * matrix[0][1]) / determinant, (matrix[0][0] * right[1] - matrix[1][0] * right[0]) / determinant]
    })
}

fn minimise_position(cost: &impl Fn(f64, f64) -> f64, start: (f64, f64)) -> (f64, f64) {
    let (mut position, mut current) = (start, cost(start.0, start.1));
    let mut derivatives_at_position: Option<Derivatives> = None;
    let mut damping = FIRST_DAMPING;
    for _ in 0..MARQUARDT_ITERATIONS {
        let Derivatives { gradient, hessian } =
            *derivatives_at_position.get_or_insert_with(|| derivatives(cost, position.0, position.1, current, DERIVATIVE_STEP_M));
        let scale = hessian[0][0].abs() + hessian[1][1].abs() + 1e-9;
        let damped = [[hessian[0][0] + damping * scale, hessian[0][1]], [hessian[1][0], hessian[1][1] + damping * scale]];
        let Some(step) = solve(damped, [-gradient[0], -gradient[1]]) else {
            damping *= DAMPING_FACTOR;
            continue;
        };
        let candidate = (position.0 + step[0], position.1 + step[1]);
        let candidate_cost = cost(candidate.0, candidate.1);
        if candidate_cost < current {
            let moved = distance_between(position, candidate);
            position = candidate;
            current = candidate_cost;
            derivatives_at_position = None;
            damping = (damping / DAMPING_FACTOR).max(LEAST_DAMPING);
            if moved < SETTLED_M {
                break;
            }
        } else {
            damping *= DAMPING_FACTOR;
            if damping > MOST_DAMPING {
                break;
            }
        }
    }
    position
}

pub(crate) fn refine(problem: &Problem, start: (f64, f64), start_parameters: &[CellParameters]) -> Fit {
    let mut position = start;
    let mut parameters = fit_parameters(problem, position.0, position.1, start_parameters, PARAMETER_SWEEPS);
    for _ in 0..REFINE_ROUNDS {
        let moved = minimise_position(&|east, north| problem.total_cost(east, north, &parameters), position);
        parameters = fit_parameters(problem, moved.0, moved.1, &parameters, PARAMETER_SWEEPS);
        let settled = distance_between(moved, position) < SETTLED_M;
        position = moved;
        if settled {
            break;
        }
    }
    Fit { east: position.0, north: position.1, cost: problem.total_cost(position.0, position.1, &parameters), parameters }
}

pub(crate) fn best_fits(problem: &Problem) -> Vec<Fit> {
    let mut fits: Vec<Fit> = starting_points(problem)
        .into_iter()
        .map(|(east, north)| refine(problem, (east, north), &problem.likely_parameters(&problem.sightlines(east, north))))
        .collect();
    fits.sort_by(|a, b| a.cost.total_cmp(&b.cost).then(a.east.total_cmp(&b.east)).then(a.north.total_cmp(&b.north)));
    fits
}

pub(crate) fn profiled_curvature(problem: &Problem, fit: &Fit) -> [[f64; 2]; 2] {
    let profiled = |east: f64, north: f64| {
        let parameters = fit_parameters(problem, east, north, &fit.parameters, PROFILED_SWEEPS);
        problem.total_cost(east, north, &parameters)
    };
    derivatives(&profiled, fit.east, fit.north, profiled(fit.east, fit.north), CURVATURE_STEP_M).hessian
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_golden_section_finds_a_parabola_minimum() {
        let mut parabola = |x: f64| (x - 3.25).powi(2);
        assert!((golden_minimum(0.0, 10.0, &mut parabola) - 3.25).abs() < 1e-3);
    }

    #[test]
    fn derivatives_of_a_quadratic_are_exact() {
        let quadratic = |x: f64, y: f64| 2.0 * x * x + 3.0 * x * y + 5.0 * y * y + x;
        let Derivatives { gradient, hessian } = derivatives(&quadratic, 1.0, 2.0, quadratic(1.0, 2.0), 0.5);
        assert!((gradient[0] - (4.0 + 6.0 + 1.0)).abs() < 1e-9);
        assert!((gradient[1] - (3.0 + 20.0)).abs() < 1e-9);
        assert!((hessian[0][0] - 4.0).abs() < 1e-9 && (hessian[0][1] - 3.0).abs() < 1e-9 && (hessian[1][1] - 10.0).abs() < 1e-9);
    }
}
