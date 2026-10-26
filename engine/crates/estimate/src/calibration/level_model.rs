use crate::antenna::{angle_between_deg, gain_db};
use crate::search::best_azimuth_deg;

const LEAST_SLOPE_DB_PER_DECADE: f64 = 20.0;
const MOST_SLOPE_DB_PER_DECADE: f64 = 45.0;
const LEAST_SCATTER_DB: f64 = 4.0;
const MOST_SCATTER_DB: f64 = 15.0;
const SLOPE_ROUNDS: usize = 10;
const SLOPE_SETTLED_DB_PER_DECADE: f64 = 0.01;
const PARAMETERS_PER_CELL: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LevelModel {
    pub slope_db_per_decade: f64,
    pub scatter_db: f64,
}

impl LevelModel {
    pub const UNCALIBRATED: Self = Self { slope_db_per_decade: 35.0, scatter_db: 9.0 };
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LevelSquare {
    pub distance_m: f64,
    pub bearing_deg: f64,
    pub level_db: f64,
    pub weight: f64,
}

struct LevelCell<'a> {
    squares: &'a [LevelSquare],
    log_distances: Vec<f64>,
    azimuth_deg: f64,
}

fn gain_corrected_db(square: &LevelSquare, azimuth_deg: f64) -> f64 {
    square.level_db - gain_db(angle_between_deg(square.bearing_deg, azimuth_deg))
}

impl<'a> LevelCell<'a> {
    fn new(squares: &'a [LevelSquare]) -> Self {
        Self { squares, log_distances: squares.iter().map(|square| square.distance_m.log10()).collect(), azimuth_deg: 0.0 }
    }

    fn residual_spread(&self, slope_db_per_decade: f64, azimuth_deg: f64) -> f64 {
        let (total, sum, sum_of_squares) =
            self.squares.iter().zip(&self.log_distances).fold((0.0, 0.0, 0.0), |(total, sum, sum_of_squares), (square, log_distance)| {
                let reference_db = gain_corrected_db(square, azimuth_deg) + slope_db_per_decade * log_distance;
                (total + square.weight, sum + square.weight * reference_db, sum_of_squares + square.weight * reference_db * reference_db)
            });
        if total > 0.0 { sum_of_squares - sum * sum / total } else { 0.0 }
    }

    fn fit_azimuth(&mut self, slope_db_per_decade: f64) {
        self.azimuth_deg = best_azimuth_deg(|azimuth_deg| self.residual_spread(slope_db_per_decade, azimuth_deg));
    }
}

fn pooled_slope(cells: &[LevelCell]) -> Option<f64> {
    let (mut joint, mut spread) = (0.0, 0.0);
    for cell in cells {
        let total: f64 = cell.squares.iter().map(|square| square.weight).sum();
        if total <= 0.0 {
            continue;
        }
        let corrected: Vec<f64> = cell.squares.iter().map(|square| gain_corrected_db(square, cell.azimuth_deg)).collect();
        let mean_log_distance =
            cell.squares.iter().zip(&cell.log_distances).map(|(square, log_distance)| square.weight * log_distance).sum::<f64>() / total;
        let mean_level_db = cell.squares.iter().zip(&corrected).map(|(square, level_db)| square.weight * level_db).sum::<f64>() / total;
        for ((square, log_distance), level_db) in cell.squares.iter().zip(&cell.log_distances).zip(&corrected) {
            joint += square.weight * (log_distance - mean_log_distance) * (level_db - mean_level_db);
            spread += square.weight * (log_distance - mean_log_distance).powi(2);
        }
    }
    (spread > 0.0).then(|| -joint / spread)
}

fn fitted_scatter_db(cells: &[LevelCell], slope_db_per_decade: f64) -> Option<f64> {
    let square_count: usize = cells.iter().map(|cell| cell.squares.len()).sum();
    let parameter_count = PARAMETERS_PER_CELL * cells.len() + 1;
    let total: f64 = cells.iter().flat_map(|cell| cell.squares).map(|square| square.weight).sum();
    if square_count <= parameter_count || total <= 0.0 {
        return None;
    }
    let residual: f64 = cells.iter().map(|cell| cell.residual_spread(slope_db_per_decade, cell.azimuth_deg)).sum();
    Some((residual / total * square_count as f64 / (square_count - parameter_count) as f64).sqrt())
}

pub fn fit_level_model(cells: &[&[LevelSquare]]) -> Option<LevelModel> {
    let mut cells: Vec<LevelCell> = cells.iter().map(|&squares| LevelCell::new(squares)).collect();
    let mut slope_db_per_decade = LevelModel::UNCALIBRATED.slope_db_per_decade;
    for _ in 0..SLOPE_ROUNDS {
        for cell in &mut cells {
            cell.fit_azimuth(slope_db_per_decade);
        }
        let fitted = pooled_slope(&cells)?;
        let settled = (fitted - slope_db_per_decade).abs() < SLOPE_SETTLED_DB_PER_DECADE;
        slope_db_per_decade = fitted;
        if settled {
            break;
        }
    }
    for cell in &mut cells {
        cell.fit_azimuth(slope_db_per_decade);
    }
    let scatter_db = fitted_scatter_db(&cells, slope_db_per_decade)?;
    let is_plausible = (LEAST_SLOPE_DB_PER_DECADE..=MOST_SLOPE_DB_PER_DECADE).contains(&slope_db_per_decade)
        && (LEAST_SCATTER_DB..=MOST_SCATTER_DB).contains(&scatter_db);
    is_plausible.then_some(LevelModel { slope_db_per_decade, scatter_db })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Shadowing(u64);

    impl Shadowing {
        fn uniform(&mut self) -> f64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            ((self.0 >> 11) as f64 + 0.5) / (1_u64 << 53) as f64
        }

        fn draw_db(&mut self, scatter_db: f64) -> f64 {
            let (radius, angle) = (self.uniform(), self.uniform());
            scatter_db * (-2.0 * radius.ln()).sqrt() * (std::f64::consts::TAU * angle).cos()
        }
    }

    fn matched_cells(stations: usize, slope_db_per_decade: f64, scatter_db: f64) -> Vec<Vec<LevelSquare>> {
        let mut shadowing = Shadowing(0x9E37_79B9_7F4A_7C15);
        let mut cells = Vec::new();
        for station in 0..stations {
            for sector in 0..3 {
                let azimuth_deg = ((station * 47 + sector * 120) % 360) as f64;
                let reach_rings = 8 + (station + sector) % 5 * 3;
                let reference_db = -45.0 + 2.0 * reach_rings as f64;
                let mut squares = Vec::new();
                for ring in 1..=reach_rings {
                    for spoke in 0..18 {
                        let (distance_m, bearing_deg) = (ring as f64 * 150.0, f64::from(spoke) * 20.0 + 5.0);
                        let off_axis_deg = angle_between_deg(bearing_deg, azimuth_deg);
                        if off_axis_deg > 90.0 && ring > 4 {
                            continue;
                        }
                        let shadowing_db = shadowing.draw_db(scatter_db);
                        let level_db = reference_db + gain_db(off_axis_deg) - slope_db_per_decade * distance_m.log10() + shadowing_db;
                        squares.push(LevelSquare { distance_m, bearing_deg, level_db, weight: 1.0 });
                    }
                }
                cells.push(squares);
            }
        }
        cells
    }

    fn fitted(cells: &[Vec<LevelSquare>]) -> Option<LevelModel> {
        fit_level_model(&cells.iter().map(Vec::as_slice).collect::<Vec<_>>())
    }

    #[test]
    fn the_level_fit_sees_through_each_cells_power_pattern_and_reach() {
        let model = fitted(&matched_cells(30, 38.0, 7.0)).expect("a model");
        assert!((model.slope_db_per_decade - 38.0).abs() < 1.0 && (model.scatter_db - 7.0).abs() < 0.4, "{model:?}");
    }

    #[test]
    fn a_slope_steeper_than_any_macro_cell_model_is_not_kept() {
        assert_eq!(fitted(&matched_cells(30, 60.0, 7.0)), None);
    }
}
