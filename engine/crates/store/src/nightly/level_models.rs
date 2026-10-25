use std::collections::{BTreeMap, BTreeSet};

use engine_estimate::antenna::bearing_deg;
use engine_estimate::calibration::{AreaClass, LEAST_GROUP_STATIONS, LevelModel, LevelSquare, fit_level_model};
use engine_estimate::input::{CENTI_PER_UNIT, Technology};
use engine_estimate::objective::{saturated_weight, slant_m};
use engine_geo::plane::LocalPlane;
use engine_geo::square::square_centre;
use tokio_postgres::types::ToSql;
use tokio_postgres::{Client, Transaction};

use crate::StoreError;
use crate::calibrated::{rat_of, technology_of};
use crate::ground_truth::GROUND_TRUTH;
use crate::nightly::calibrate::GroundTruth;
use crate::nightly::{Half, stream_rows};

const NEAREST_SQUARE_M: f64 = 100.0;
const LEAST_CELL_SQUARES: usize = 10;
const LEAST_GROUP_SQUARES: usize = 2_000;

#[derive(Debug, Clone, Copy)]
pub struct LevelRow {
    pub observed_cell_id: i32,
    pub technology: Technology,
    pub station_id: i32,
    pub area_class: AreaClass,
    pub east_m: f64,
    pub north_m: f64,
    pub level_db: f64,
    pub weight: f64,
}

struct CellSquares {
    station_id: i32,
    squares: Vec<LevelSquare>,
}

#[derive(Default)]
pub struct LevelRows {
    groups: BTreeMap<(Technology, AreaClass), BTreeMap<i32, CellSquares>>,
}

impl LevelRows {
    pub fn add(&mut self, row: LevelRow) {
        if row.east_m.hypot(row.north_m) < NEAREST_SQUARE_M {
            return;
        }
        let cell = self
            .groups
            .entry((row.technology, row.area_class))
            .or_default()
            .entry(row.observed_cell_id)
            .or_insert_with(|| CellSquares { station_id: row.station_id, squares: Vec::new() });
        cell.squares.push(LevelSquare {
            distance_m: slant_m(row.east_m, row.north_m),
            bearing_deg: bearing_deg(row.east_m, row.north_m),
            level_db: row.level_db,
            weight: row.weight,
        });
    }

    pub fn into_models(self) -> BTreeMap<(Technology, AreaClass), (LevelModel, usize)> {
        self.groups
            .into_iter()
            .filter_map(|(group, cells)| {
                let kept: Vec<CellSquares> = cells.into_values().filter(|cell| cell.squares.len() >= LEAST_CELL_SQUARES).collect();
                let square_count: usize = kept.iter().map(|cell| cell.squares.len()).sum();
                let station_count = kept.iter().map(|cell| cell.station_id).collect::<BTreeSet<_>>().len();
                if square_count < LEAST_GROUP_SQUARES || station_count < LEAST_GROUP_STATIONS {
                    return None;
                }
                let squares: Vec<&[LevelSquare]> = kept.iter().map(|cell| cell.squares.as_slice()).collect();
                Some((group, (fit_level_model(&squares)?, square_count)))
            })
            .collect()
    }
}

pub(crate) async fn fit_level_models(
    client: &Client,
    half: Half,
    stations: &BTreeMap<i32, GroundTruth>,
) -> Result<BTreeMap<(Technology, AreaClass), (LevelModel, usize)>, StoreError> {
    let mut rows = LevelRows::default();
    let parity = half.parity();
    let statement = format!(
        "SELECT b.observed_cell_id, oc.rat::text, st.id, b.bin, b.weight_milli, b.level_wsum, b.offset_x_wsum, b.offset_y_wsum
         FROM observations.cell_bins b
         JOIN observations.cell_matches m ON m.observed_cell_id = b.observed_cell_id
         JOIN observations.observed_cells oc ON oc.id = b.observed_cell_id
         JOIN public.cells c ON c.id = m.cell_id
         JOIN public.stations st ON st.id = c.station_id
         WHERE b.weight_milli > 0 AND oc.rat IN ('GSM', 'UMTS', 'LTE', 'NR') AND st.id % 2 = $1 AND {GROUND_TRUTH}"
    );
    stream_rows(client, &statement, &[&parity as &(dyn ToSql + Sync)], |row| {
        let (Some(technology), Some(station)) = (technology_of(row.get(1)), stations.get(&row.get::<_, i32>(2))) else {
            return Ok(());
        };
        let weight_milli: i64 = row.get(4);
        let mean = |column: usize| row.get::<_, i64>(column) as f64 / weight_milli as f64 / CENTI_PER_UNIT;
        let (east_m, north_m) = LocalPlane::around(station.point).to_plane(square_centre(row.get::<_, i64>(3) as u64));
        rows.add(LevelRow {
            observed_cell_id: row.get(0),
            technology,
            station_id: row.get(2),
            area_class: station.area_class,
            east_m: east_m + mean(6),
            north_m: north_m + mean(7),
            level_db: mean(5),
            weight: saturated_weight(weight_milli),
        });
        Ok(())
    })
    .await?;
    tokio::task::spawn_blocking(move || rows.into_models()).await.map_err(|error| StoreError::data(format!("the level fit stopped: {error}")))
}

pub(crate) async fn write_level_models(
    transaction: &Transaction<'_>,
    run_id: i32,
    models: &BTreeMap<(Technology, AreaClass), (LevelModel, usize)>,
) -> Result<(), StoreError> {
    for (&(technology, area_class), (model, square_count)) in models {
        transaction
            .execute(
                "INSERT INTO observations.level_models (calibration_run_id, rat, area_class, slope_db_per_decade, scatter_db, bin_count)
                 VALUES ($1, $2::text::rat, $3::text::area_class, $4, $5, $6)",
                &[
                    &run_id,
                    &rat_of(technology),
                    &area_class.label(),
                    &(model.slope_db_per_decade as f32),
                    &(model.scatter_db as f32),
                    &(*square_count as i32),
                ],
            )
            .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_estimate::antenna::{angle_between_deg, gain_db};

    fn add_cells(rows: &mut LevelRows, technology: Technology, stations: i32) {
        for station_id in 0..stations {
            let mut index = 0;
            for ring in 1..=12 {
                for spoke in 0..12 {
                    let (distance_m, bearing) = (f64::from(ring) * 150.0, f64::from(spoke) * 30.0);
                    let (east_m, north_m) = (distance_m * bearing.to_radians().sin(), distance_m * bearing.to_radians().cos());
                    let shadowing_db = f64::from((index * 7 + station_id * 3) % 25 - 12);
                    let level_db = -30.0 + gain_db(angle_between_deg(bearing, 0.0)) - 38.0 * slant_m(east_m, north_m).log10() + shadowing_db;
                    rows.add(row_of(station_id, technology, (east_m, north_m), level_db));
                    index += 1;
                }
            }
            rows.add(row_of(station_id, technology, (40.0, 30.0), 10.0));
        }
    }

    fn row_of(station_id: i32, technology: Technology, (east_m, north_m): (f64, f64), level_db: f64) -> LevelRow {
        LevelRow { observed_cell_id: station_id, technology, station_id, area_class: AreaClass::Town, east_m, north_m, level_db, weight: 1.0 }
    }

    #[test]
    fn a_group_under_the_minimum_keeps_the_default_model() {
        let mut rows = LevelRows::default();
        add_cells(&mut rows, Technology::Lte, 25);
        add_cells(&mut rows, Technology::Gsm, 10);
        let models = rows.into_models();
        let (_, square_count) = models.get(&(Technology::Lte, AreaClass::Town)).expect("3,600 squares at 25 stations are enough");
        assert_eq!(*square_count, 25 * 144, "the squares nearer than 100 m are left out");
        assert!(!models.contains_key(&(Technology::Gsm, AreaClass::Town)), "1,440 squares at 10 stations are too few");
    }
}
