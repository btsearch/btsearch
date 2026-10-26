use std::collections::BTreeMap;

use engine_geo::Point;
use engine_geo::plane::LocalPlane;
use engine_geo::square::square_centre;

use crate::input::{CENTI_PER_UNIT, Context, Site, Technology};
use crate::objective::{HandoverRow, LevelRow, Problem, SectorSquare, TimingAdvanceRow, saturated_weight};

const STALE_AFTER_DAYS: i32 = 365;
const STALE_SHARE: f64 = 0.25;

fn saturated(weight_milli: i64, last_seen_on: i32, site_last_seen_on: i32) -> f64 {
    let recency = if site_last_seen_on - last_seen_on > STALE_AFTER_DAYS { STALE_SHARE } else { 1.0 };
    saturated_weight(weight_milli) * recency
}

fn weighted_centre(points: impl Iterator<Item = (Point, f64)>) -> Option<Point> {
    let (latitude, longitude, total) = points.fold((0.0, 0.0, 0.0), |(latitude, longitude, total), (point, weight)| {
        (latitude + point.latitude * weight, longitude + point.longitude * weight, total + weight)
    });
    (total > 0.0).then(|| Point::new(latitude / total, longitude / total))
}

fn sector_squares(site: &Site, site_last_seen_on: i32, place: &impl Fn(u64) -> (f64, f64)) -> Vec<SectorSquare> {
    let mut cells_by_channel: BTreeMap<(Technology, i32), Vec<usize>> = BTreeMap::new();
    for (cell, input) in site.cells.iter().enumerate() {
        if let Some(channel) = input.channel {
            cells_by_channel.entry((input.technology, channel)).or_default().push(cell);
        }
    }
    let mut served_in_square: BTreeMap<((Technology, i32), u64), Vec<(usize, f64)>> = BTreeMap::new();
    for (channel, cells) in cells_by_channel.iter().filter(|(_, cells)| cells.len() > 1) {
        for (slot, &cell) in cells.iter().enumerate() {
            for bin in site.cells[cell].bins.iter().filter(|bin| bin.serving_weight_milli > 0) {
                let served = served_in_square.entry((*channel, bin.square)).or_insert_with(|| cells.iter().map(|&other| (other, 0.0)).collect());
                served[slot].1 = saturated(bin.serving_weight_milli, bin.last_seen_on, site_last_seen_on);
            }
        }
    }
    served_in_square
        .into_iter()
        .map(|((_, square), served)| {
            let (east, north) = place(square);
            SectorSquare { east, north, served }
        })
        .collect()
}

fn rows_of_cell<Cells: IntoIterator<Item = usize>>(cell_count: usize, cells_of_rows: impl Iterator<Item = Cells>) -> Vec<Vec<usize>> {
    let mut rows = vec![Vec::new(); cell_count];
    for (index, cells) in cells_of_rows.enumerate() {
        for cell in cells {
            rows[cell].push(index);
        }
    }
    rows
}

impl<'a> Problem<'a> {
    pub fn new(site: &Site, context: &'a Context) -> Option<Self> {
        let site_last_seen_on = site.last_seen_on()?;
        let weighted_squares = site.cells.iter().flat_map(|cell| {
            let bins = cell.bins.iter().map(|bin| (square_centre(bin.square), saturated(bin.weight_milli, bin.last_seen_on, site_last_seen_on)));
            let timing_advance =
                cell.timing_advance.iter().map(|row| (square_centre(row.square), saturated(row.weight_milli, row.last_seen_on, site_last_seen_on)));
            bins.chain(timing_advance)
        });
        let plane = LocalPlane::around(weighted_centre(weighted_squares)?);
        let place = |square: u64| plane.to_plane(square_centre(square));

        let mut centroids = BTreeMap::new();
        let mut levels = Vec::new();
        for (cell, input) in site.cells.iter().enumerate() {
            for bin in input.bins.iter().filter(|bin| bin.weight_milli > 0) {
                let (east, north) = place(bin.square);
                let mean = |weighted_sum: i64| weighted_sum as f64 / bin.weight_milli as f64 / CENTI_PER_UNIT;
                let centroid = (east + mean(bin.offset_x_wsum), north + mean(bin.offset_y_wsum));
                centroids.insert((cell, bin.square), centroid);
                levels.push(LevelRow {
                    cell,
                    square: bin.square,
                    east: centroid.0,
                    north: centroid.1,
                    level_db: mean(bin.level_wsum),
                    weight: saturated(bin.weight_milli, bin.last_seen_on, site_last_seen_on),
                });
            }
        }

        let timing_advance = site
            .cells
            .iter()
            .enumerate()
            .flat_map(|(cell, input)| input.timing_advance.iter().map(move |row| (cell, row)))
            .filter(|(_, row)| row.error_model < context.error_tables.len())
            .map(|(cell, row)| {
                let (east, north) = centroids.get(&(cell, row.square)).copied().unwrap_or_else(|| place(row.square));
                TimingAdvanceRow {
                    cell,
                    square: row.square,
                    east,
                    north,
                    distance_m: row.distance_m,
                    weight: saturated(row.weight_milli, row.last_seen_on, site_last_seen_on),
                    error_table: row.error_model,
                }
            })
            .filter(|row| row.weight > 0.0)
            .collect::<Vec<_>>();

        let sectors = sector_squares(site, site_last_seen_on, &place);

        let handovers = site
            .handovers
            .iter()
            .filter(|row| row.from_cell < site.cells.len() && row.to_cell < site.cells.len() && row.from_cell != row.to_cell)
            .map(|row| {
                let (east, north) = place(row.square);
                HandoverRow {
                    from_cell: row.from_cell,
                    to_cell: row.to_cell,
                    east,
                    north,
                    weight: saturated(row.weight_milli, row.last_seen_on, site_last_seen_on),
                }
            })
            .filter(|row| row.weight > 0.0)
            .collect::<Vec<_>>();

        let prior_points =
            levels.iter().map(|row| (row.east, row.north, row.weight)).chain(timing_advance.iter().map(|row| (row.east, row.north, row.weight)));
        let (east_sum, north_sum, total) = prior_points.fold((0.0, 0.0, 0.0), |(east, north, total), (row_east, row_north, weight)| {
            (east + row_east * weight, north + row_north * weight, total + weight)
        });
        if total <= 0.0 {
            return None;
        }

        let cell_count = site.cells.len();
        let levels_of_cell = rows_of_cell(cell_count, levels.iter().map(|row| [row.cell]));
        let sectors_of_cell = rows_of_cell(cell_count, sectors.iter().map(|square| square.served.iter().map(|&(cell, _)| cell)));
        let handovers_of_cell = rows_of_cell(cell_count, handovers.iter().map(|row| [row.from_cell, row.to_cell]));

        Some(Self {
            plane,
            cell_count,
            timing_advance,
            levels,
            sectors,
            handovers,
            prior_centre: (east_sum / total, north_sum / total),
            error_tables: &context.error_tables,
            level_models: site.cells.iter().map(|cell| context.level_model(cell.technology, cell.area_class)).collect(),
            levels_of_cell,
            sectors_of_cell,
            handovers_of_cell,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_saturated_weight_counts_a_parked_phone_about_as_much_as_a_passing_car() {
        let parked = saturated(3_600_000, 0, 0);
        let passing = saturated(10_000, 0, 0);
        assert!(parked <= 1.0 && parked / passing < 1.05);
        assert_eq!(saturated(10_000, 0, 400), passing * STALE_SHARE);
    }
}
