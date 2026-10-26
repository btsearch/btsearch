mod build;

use engine_geo::plane::LocalPlane;

use crate::antenna::{angle_between_deg, bearing_deg, circular_mean_deg, gain_db};
use crate::calibration::LevelModel;
use crate::error_model::ErrorTable;

const ANTENNA_HEIGHT_M: f64 = 30.0;
const SATURATION_WEIGHT: f64 = 3.0;
const SOFTMAX_TEMPERATURE_DB: f64 = 4.0;
const LEVEL_TERM_SHARE: f64 = 0.25;
const PRIOR_SIGMA_M: f64 = 5_000.0;
const SHORTEST_DISTANCE_M: f64 = 10.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CellParameters {
    pub azimuth_deg: f64,
    pub power_db: f64,
}

pub(crate) struct TimingAdvanceRow {
    pub cell: usize,
    pub square: u64,
    pub east: f64,
    pub north: f64,
    pub distance_m: f64,
    pub weight: f64,
    error_table: usize,
}

impl TimingAdvanceRow {
    pub fn residual_m(&self, east: f64, north: f64) -> f64 {
        self.distance_m - slant_m(self.east - east, self.north - north)
    }
}

pub(crate) struct LevelRow {
    pub cell: usize,
    pub square: u64,
    pub east: f64,
    pub north: f64,
    pub level_db: f64,
    pub weight: f64,
}

impl LevelRow {
    fn sightline_from(&self, east: f64, north: f64) -> LevelSightline {
        let (east_offset, north_offset) = (self.east - east, self.north - north);
        LevelSightline {
            bearing_deg: bearing_deg(east_offset, north_offset),
            log_distance: slant_m(east_offset, north_offset).max(SHORTEST_DISTANCE_M).log10(),
        }
    }
}

pub(crate) struct SectorSquare {
    pub east: f64,
    pub north: f64,
    pub served: Vec<(usize, f64)>,
}

impl SectorSquare {
    fn bearing_from(&self, east: f64, north: f64) -> f64 {
        bearing_deg(self.east - east, self.north - north)
    }
}

pub(crate) struct HandoverRow {
    pub from_cell: usize,
    pub to_cell: usize,
    pub east: f64,
    pub north: f64,
    pub weight: f64,
}

impl HandoverRow {
    fn bearing_from(&self, east: f64, north: f64) -> f64 {
        bearing_deg(self.east - east, self.north - north)
    }
}

#[derive(Clone, Copy)]
struct LevelSightline {
    bearing_deg: f64,
    log_distance: f64,
}

pub(crate) struct Sightlines {
    sector_bearings_deg: Vec<f64>,
    handover_bearings_deg: Vec<f64>,
    levels: Vec<LevelSightline>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Terms {
    pub timing_advance: f64,
    pub sectors: f64,
    pub handovers: f64,
    pub levels: f64,
    pub prior: f64,
}

impl Terms {
    fn total(&self) -> f64 {
        self.timing_advance + self.sectors + self.handovers + self.levels + self.prior
    }
}

pub struct Problem<'a> {
    pub plane: LocalPlane,
    pub(crate) cell_count: usize,
    pub(crate) timing_advance: Vec<TimingAdvanceRow>,
    pub(crate) levels: Vec<LevelRow>,
    pub(crate) sectors: Vec<SectorSquare>,
    pub(crate) handovers: Vec<HandoverRow>,
    prior_centre: (f64, f64),
    error_tables: &'a [ErrorTable],
    level_models: Vec<LevelModel>,
    levels_of_cell: Vec<Vec<usize>>,
    sectors_of_cell: Vec<Vec<usize>>,
    handovers_of_cell: Vec<Vec<usize>>,
}

pub fn slant_m(east: f64, north: f64) -> f64 {
    (east * east + north * north + ANTENNA_HEIGHT_M * ANTENNA_HEIGHT_M).sqrt()
}

pub fn saturated_weight(weight_milli: i64) -> f64 {
    let weight = weight_milli as f64 / 1_000.0;
    1.0 - (-weight / SATURATION_WEIGHT).exp()
}

impl Problem<'_> {
    pub(crate) fn has_timing_advance(&self) -> bool {
        !self.timing_advance.is_empty()
    }

    pub(crate) fn has_cell_terms(&self, cell: usize) -> bool {
        !self.levels_of_cell[cell].is_empty() || !self.sectors_of_cell[cell].is_empty()
    }

    pub(crate) fn timing_advance_cost(&self, east: f64, north: f64) -> f64 {
        self.timing_advance.iter().map(|row| row.weight * self.error_tables[row.error_table].cost(row.residual_m(east, north))).sum()
    }

    fn power_towards_db(parameters: &CellParameters, bearing: f64) -> f64 {
        parameters.power_db + gain_db(angle_between_deg(bearing, parameters.azimuth_deg))
    }

    pub(crate) fn sightlines(&self, east: f64, north: f64) -> Sightlines {
        Sightlines {
            sector_bearings_deg: self.sectors.iter().map(|square| square.bearing_from(east, north)).collect(),
            handover_bearings_deg: self.handovers.iter().map(|row| row.bearing_from(east, north)).collect(),
            levels: self.levels.iter().map(|row| row.sightline_from(east, north)).collect(),
        }
    }

    fn sector_cost(&self, square: &SectorSquare, bearing: f64, parameters: &[CellParameters], scaled_powers: &mut Vec<f64>) -> f64 {
        scaled_powers.clear();
        scaled_powers.extend(square.served.iter().map(|&(cell, _)| Self::power_towards_db(&parameters[cell], bearing) / SOFTMAX_TEMPERATURE_DB));
        let highest = scaled_powers.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let normaliser = highest + scaled_powers.iter().map(|power| (power - highest).exp()).sum::<f64>().ln();
        square.served.iter().zip(scaled_powers.iter()).map(|(&(_, weight), power)| -weight * (power - normaliser)).sum()
    }

    fn handover_cost(&self, row: &HandoverRow, bearing: f64, parameters: &[CellParameters]) -> f64 {
        let from_db = Self::power_towards_db(&parameters[row.from_cell], bearing);
        let to_db = Self::power_towards_db(&parameters[row.to_cell], bearing);
        let difference = (from_db - to_db) / SOFTMAX_TEMPERATURE_DB;
        row.weight * difference * difference / 2.0
    }

    fn predicted_level_db(&self, row: &LevelRow, sightline: LevelSightline, parameters: &CellParameters) -> f64 {
        let slope_db_per_decade = self.level_models[row.cell].slope_db_per_decade;
        Self::power_towards_db(parameters, sightline.bearing_deg) - slope_db_per_decade * sightline.log_distance
    }

    fn level_cost(&self, row: &LevelRow, sightline: LevelSightline, parameters: &[CellParameters]) -> f64 {
        let residual = row.level_db - self.predicted_level_db(row, sightline, &parameters[row.cell]);
        let scatter_db = self.level_models[row.cell].scatter_db;
        LEVEL_TERM_SHARE * row.weight * residual * residual / (2.0 * scatter_db * scatter_db)
    }

    pub(crate) fn prior_cost(&self, east: f64, north: f64) -> f64 {
        let (east, north) = (east - self.prior_centre.0, north - self.prior_centre.1);
        (east * east + north * north) / (2.0 * PRIOR_SIGMA_M * PRIOR_SIGMA_M)
    }

    pub fn terms(&self, east: f64, north: f64, parameters: &[CellParameters]) -> Terms {
        self.terms_along(east, north, &self.sightlines(east, north), parameters)
    }

    fn terms_along(&self, east: f64, north: f64, sightlines: &Sightlines, parameters: &[CellParameters]) -> Terms {
        let mut scaled_powers = Vec::new();
        Terms {
            timing_advance: self.timing_advance_cost(east, north),
            sectors: self
                .sectors
                .iter()
                .zip(&sightlines.sector_bearings_deg)
                .map(|(square, &bearing)| self.sector_cost(square, bearing, parameters, &mut scaled_powers))
                .sum(),
            handovers: self
                .handovers
                .iter()
                .zip(&sightlines.handover_bearings_deg)
                .map(|(row, &bearing)| self.handover_cost(row, bearing, parameters))
                .sum(),
            levels: self.levels.iter().zip(&sightlines.levels).map(|(row, &sightline)| self.level_cost(row, sightline, parameters)).sum(),
            prior: self.prior_cost(east, north),
        }
    }

    pub(crate) fn total_cost(&self, east: f64, north: f64, parameters: &[CellParameters]) -> f64 {
        self.terms(east, north, parameters).total()
    }

    pub(crate) fn total_cost_along(&self, east: f64, north: f64, sightlines: &Sightlines, parameters: &[CellParameters]) -> f64 {
        self.terms_along(east, north, sightlines, parameters).total()
    }

    pub(crate) fn cell_cost(&self, cell: usize, sightlines: &Sightlines, parameters: &[CellParameters]) -> f64 {
        let mut scaled_powers = Vec::new();
        let sectors: f64 = self.sectors_of_cell[cell]
            .iter()
            .map(|&index| self.sector_cost(&self.sectors[index], sightlines.sector_bearings_deg[index], parameters, &mut scaled_powers))
            .sum();
        let handovers: f64 = self.handovers_of_cell[cell]
            .iter()
            .map(|&index| self.handover_cost(&self.handovers[index], sightlines.handover_bearings_deg[index], parameters))
            .sum();
        let levels: f64 =
            self.levels_of_cell[cell].iter().map(|&index| self.level_cost(&self.levels[index], sightlines.levels[index], parameters)).sum();
        sectors + handovers + levels
    }

    pub(crate) fn fitted_power_db(&self, cell: usize, sightlines: &Sightlines, azimuth_deg: f64) -> f64 {
        let at_zero = CellParameters { azimuth_deg, power_db: 0.0 };
        let (sum, total) = self.levels_of_cell[cell].iter().fold((0.0, 0.0), |(sum, total), &index| {
            let row = &self.levels[index];
            (sum + row.weight * (row.level_db - self.predicted_level_db(row, sightlines.levels[index], &at_zero)), total + row.weight)
        });
        if total > 0.0 { sum / total } else { 0.0 }
    }

    pub(crate) fn likely_parameters(&self, sightlines: &Sightlines) -> Vec<CellParameters> {
        (0..self.cell_count)
            .map(|cell| {
                let bearings = self.levels_of_cell[cell].iter().map(|&index| (sightlines.levels[index].bearing_deg, self.levels[index].weight));
                let azimuth_deg = circular_mean_deg(bearings).unwrap_or(0.0);
                CellParameters { azimuth_deg, power_db: self.fitted_power_db(cell, sightlines, azimuth_deg) }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calibration::AreaClass;
    use crate::input::{Bin, Cell, Context, Site, Technology, TimingAdvance};
    use engine_geo::Point;
    use engine_geo::square::square_at;

    fn bin(square: u64, weight_milli: i64, level_db: f64, serving: bool) -> Bin {
        Bin {
            square,
            sample_count: 10,
            weight_milli,
            serving_weight_milli: if serving { weight_milli } else { 0 },
            level_wsum: (level_db * 100.0) as i64 * weight_milli,
            offset_x_wsum: 0,
            offset_y_wsum: 0,
            quality_weight_milli: 0,
            quality_wsum: 0,
            sinr_weight_milli: 0,
            sinr_wsum: 0,
            stationary_count: 0,
            first_seen_on: 20_000,
            last_seen_on: 20_000,
        }
    }

    fn cell(key: i64, channel: Option<i32>, bins: Vec<Bin>, timing_advance: Vec<TimingAdvance>) -> Cell {
        Cell { key, technology: Technology::Lte, area_class: AreaClass::Town, channel, bins, timing_advance }
    }

    fn site(cells: Vec<Cell>) -> Site {
        Site { cells, handovers: Vec::new(), contributor_count: 2, person_count: 2 }
    }

    const ORIGIN: Point = Point { latitude: 52.0, longitude: 21.0 };

    fn square_from_origin(east: f64, north: f64) -> u64 {
        square_at(LocalPlane::around(ORIGIN).to_point(east, north))
    }

    #[test]
    fn the_timing_advance_term_is_lowest_at_the_distance_the_rows_give() {
        let square = square_from_origin(1_000.0, 0.0);
        let row = TimingAdvance { square, distance_m: 1_000.0, sample_count: 20, weight_milli: 20_000, last_seen_on: 20_000, error_model: 0 };
        let context = Context::uncalibrated();
        let site = site(vec![cell(1, None, vec![bin(square, 20_000, -90.0, true)], vec![row])]);
        let problem = Problem::new(&site, &context).expect("a problem");
        let (square_east, square_north) = (problem.timing_advance[0].east, problem.timing_advance[0].north);
        let cost_at = |distance: f64| problem.timing_advance_cost(square_east - distance, square_north);
        assert!(cost_at(1_000.0) < cost_at(1_200.0));
        assert!(cost_at(1_000.0) < cost_at(800.0));
        assert!(cost_at(1_200.0) > cost_at(800.0), "rows that say closer than the site cost more than rows that say farther");
    }

    #[test]
    fn the_sector_term_prefers_the_azimuth_of_the_squares_a_cell_served() {
        let north_square = square_from_origin(0.0, 800.0);
        let south_square = square_from_origin(0.0, -800.0);
        let context = Context::uncalibrated();
        let site = site(vec![
            cell(1, Some(100), vec![bin(north_square, 30_000, -80.0, true), bin(south_square, 30_000, -95.0, false)], Vec::new()),
            cell(2, Some(100), vec![bin(north_square, 30_000, -95.0, false), bin(south_square, 30_000, -80.0, true)], Vec::new()),
        ]);
        let problem = Problem::new(&site, &context).expect("a problem");
        let (east, north) = problem.plane.to_plane(ORIGIN);
        let facing = [CellParameters { azimuth_deg: 0.0, power_db: 40.0 }, CellParameters { azimuth_deg: 180.0, power_db: 40.0 }];
        let swapped = [CellParameters { azimuth_deg: 180.0, power_db: 40.0 }, CellParameters { azimuth_deg: 0.0, power_db: 40.0 }];
        let sector_cost = |parameters: &[CellParameters]| problem.terms(east, north, parameters).sectors;
        assert!(sector_cost(&facing) < sector_cost(&swapped));
    }

    #[test]
    fn the_level_term_fits_the_power_that_explains_the_levels() {
        let square = square_from_origin(500.0, 0.0);
        let context = Context::uncalibrated();
        let site = site(vec![cell(1, None, vec![bin(square, 10_000, -90.0, true)], Vec::new())]);
        let problem = Problem::new(&site, &context).expect("a problem");
        let (east, north) = problem.plane.to_plane(ORIGIN);
        let sightlines = problem.sightlines(east, north);
        let power = problem.fitted_power_db(0, &sightlines, 90.0);
        let fitted = [CellParameters { azimuth_deg: 90.0, power_db: power }];
        assert!(problem.cell_cost(0, &sightlines, &fitted) < 1e-9);
        assert!(problem.cell_cost(0, &sightlines, &[CellParameters { azimuth_deg: 90.0, power_db: power + 9.0 }]) > 0.0);
    }

    #[test]
    fn a_fitted_level_model_changes_only_the_level_term_of_its_own_technology() {
        let east_square = square_from_origin(1_000.0, 0.0);
        let north_square = square_from_origin(0.0, 600.0);
        let row =
            TimingAdvance { square: east_square, distance_m: 1_000.0, sample_count: 20, weight_milli: 20_000, last_seen_on: 20_000, error_model: 0 };
        let gsm = Cell { technology: Technology::Gsm, ..cell(3, None, vec![bin(north_square, 20_000, -75.0, true)], Vec::new()) };
        let site = site(vec![
            cell(1, Some(100), vec![bin(east_square, 20_000, -85.0, true), bin(north_square, 20_000, -95.0, false)], vec![row]),
            cell(2, Some(100), vec![bin(east_square, 20_000, -97.0, false), bin(north_square, 20_000, -80.0, true)], Vec::new()),
            gsm,
        ]);
        let uncalibrated = Context::uncalibrated();
        let mut calibrated = Context::uncalibrated();
        calibrated.level_models.insert((Technology::Lte, AreaClass::Town), LevelModel { slope_db_per_decade: 40.0, scatter_db: 7.0 });
        let by_default = Problem::new(&site, &uncalibrated).expect("a problem");
        let fitted = Problem::new(&site, &calibrated).expect("a problem");
        let (east, north) = by_default.plane.to_plane(ORIGIN);
        let parameters = [
            CellParameters { azimuth_deg: 90.0, power_db: 30.0 },
            CellParameters { azimuth_deg: 0.0, power_db: 30.0 },
            CellParameters { azimuth_deg: 0.0, power_db: 20.0 },
        ];
        let (default_terms, fitted_terms) = (by_default.terms(east, north, &parameters), fitted.terms(east, north, &parameters));
        assert_ne!(fitted_terms.levels, default_terms.levels);
        assert_eq!(Terms { levels: fitted_terms.levels, ..default_terms }, fitted_terms, "every other term stays as it was");
        let gsm_cell_cost = |problem: &Problem| problem.cell_cost(2, &problem.sightlines(east, north), &parameters);
        assert_eq!(gsm_cell_cost(&by_default), gsm_cell_cost(&fitted), "the GSM cell keeps the default model");
    }
}
