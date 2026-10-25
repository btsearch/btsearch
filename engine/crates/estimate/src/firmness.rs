use engine_geo::square::square_centre;

use crate::Estimate;
use crate::antenna::bearing_deg;
use crate::input::{Cell, Context, Site};
use crate::objective::Problem;
use crate::search::{distance_between, refine};

const BEARING_SECTORS: usize = 8;
const LEAST_SECTOR_SHARE: f64 = 0.1;
const LEAST_SECTORS: usize = 3;

fn bearing_sector(east: f64, north: f64) -> usize {
    (bearing_deg(east, north) / (360.0 / BEARING_SECTORS as f64)) as usize % BEARING_SECTORS
}

fn without_squares(site: &Site, is_left_out: impl Fn(u64) -> bool) -> Site {
    let cells = site
        .cells
        .iter()
        .map(|cell| Cell {
            bins: cell.bins.iter().filter(|bin| !is_left_out(bin.square)).copied().collect(),
            timing_advance: cell.timing_advance.iter().filter(|row| !is_left_out(row.square)).copied().collect(),
            ..*cell
        })
        .collect();
    Site {
        cells,
        handovers: site.handovers.iter().filter(|row| !is_left_out(row.square)).copied().collect(),
        ..*site
    }
}

pub fn leave_out_shift_m(site: &Site, estimate: &Estimate, context: &Context) -> Option<i32> {
    let problem = Problem::new(site, context)?;
    let (east, north) = problem.plane.to_plane(estimate.point);
    let sector_of_square = |square: u64| {
        let (square_east, square_north) = problem.plane.to_plane(square_centre(square));
        bearing_sector(square_east - east, square_north - north)
    };

    let mut weights = [0.0; BEARING_SECTORS];
    let levels = problem.levels.iter().map(|row| (row.square, row.weight));
    let timing_advance = problem.timing_advance.iter().map(|row| (row.square, row.weight));
    for (square, weight) in levels.chain(timing_advance) {
        weights[sector_of_square(square)] += weight;
    }
    let total: f64 = weights.iter().sum();
    let held: Vec<usize> = (0..BEARING_SECTORS)
        .filter(|&sector| weights[sector] >= LEAST_SECTOR_SHARE * total)
        .collect();
    if held.len() < LEAST_SECTORS {
        return None;
    }

    let parameters = estimate.cell_parameters();
    held.into_iter()
        .filter_map(|left_out| {
            let rest = without_squares(site, |square| sector_of_square(square) == left_out);
            let reduced = Problem::new(&rest, context)?;
            let start = reduced.plane.to_plane(estimate.point);
            let refit = refine(&reduced, start, &parameters);
            Some(distance_between((refit.east, refit.north), start))
        })
        .reduce(f64::max)
        .map(|shift_m| shift_m.round() as i32)
}
