use std::cmp::Reverse;
use std::collections::BTreeMap;

use engine_geo::Point;
use engine_geo::plane::distance_meters;
use engine_geo::square::square_centre;
use tokio_postgres::Client;

use crate::StoreError;
use crate::nightly::stream_rows;

pub const SHORTEST_LENGTH: u32 = 22;
pub const LONGEST_LENGTH: u32 = 32;
const NCI_BITS: u32 = 36;
const TOGETHER_WITHIN_M: f64 = 3_000.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NrCell {
    pub nci: i64,
    pub node_id: Option<i64>,
    pub centre: Point,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LengthResult {
    pub length: u32,
    pub cells: i32,
    pub together: i32,
    pub apart: i32,
    pub sites: i32,
}

fn gnb_of(nci: i64, length: u32) -> i64 {
    nci >> (NCI_BITS - length)
}

pub fn cut_length(cells: &[NrCell]) -> Option<u32> {
    let mut counts: BTreeMap<u32, usize> = BTreeMap::new();
    for cell in cells {
        let Some(node_id) = cell.node_id else {
            continue;
        };
        if let Some(length) = (SHORTEST_LENGTH..=LONGEST_LENGTH).find(|&length| gnb_of(cell.nci, length) == node_id) {
            *counts.entry(length).or_insert(0) += 1;
        }
    }
    counts.into_iter().max_by_key(|&(length, count)| (count, Reverse(length))).map(|(length, _)| length)
}

pub fn test_network(cells: &[NrCell]) -> Vec<LengthResult> {
    (SHORTEST_LENGTH..=LONGEST_LENGTH)
        .map(|length| {
            let mut sites: BTreeMap<i64, Vec<Point>> = BTreeMap::new();
            for cell in cells {
                sites.entry(gnb_of(cell.nci, length)).or_default().push(cell.centre);
            }
            let (mut together, mut apart) = (0, 0);
            for centres in sites.values().filter(|centres| centres.len() > 1) {
                let count = centres.len() as f64;
                let latitude = centres.iter().map(|point| point.latitude).sum::<f64>() / count;
                let longitude = centres.iter().map(|point| point.longitude).sum::<f64>() / count;
                let middle = Point::new(latitude, longitude);
                let stands_together = centres.iter().all(|&centre| distance_meters(centre, middle) <= TOGETHER_WITHIN_M);
                if stands_together {
                    together += centres.len() as i32;
                } else {
                    apart += centres.len() as i32;
                }
            }
            LengthResult { length, cells: cells.len() as i32, together, apart, sites: sites.len() as i32 }
        })
        .collect()
}

#[derive(Default)]
struct Sums {
    plmn: String,
    nci: i64,
    node_id: Option<i64>,
    latitude: f64,
    longitude: f64,
    weight: f64,
}

pub async fn test_lengths(client: &Client, run_id: i32) -> Result<usize, StoreError> {
    let mut sums: BTreeMap<i32, Sums> = BTreeMap::new();
    stream_rows(
        client,
        "SELECT c.id, c.plmn, c.cell_key, s.node_id, b.bin, b.serving_weight_milli
         FROM observations.observed_cells c
         LEFT JOIN observations.observed_sites s ON s.id = c.observed_site_id AND s.retired_at IS NULL
         JOIN observations.cell_bins b ON b.observed_cell_id = c.id
         WHERE c.rat = 'NR' AND b.serving_weight_milli > 0",
        &[],
        |row| {
            let centre = square_centre(row.get::<_, i64>(4) as u64);
            let weight = row.get::<_, i64>(5) as f64;
            let cell = sums.entry(row.get(0)).or_insert_with(|| Sums { plmn: row.get(1), nci: row.get(2), node_id: row.get(3), ..Sums::default() });
            cell.latitude += centre.latitude * weight;
            cell.longitude += centre.longitude * weight;
            cell.weight += weight;
            Ok(())
        },
    )
    .await?;

    let mut networks: BTreeMap<String, Vec<NrCell>> = BTreeMap::new();
    for cell in sums.into_values().filter(|cell| cell.weight > 0.0) {
        let centre = Point::new(cell.latitude / cell.weight, cell.longitude / cell.weight);
        networks.entry(cell.plmn).or_default().push(NrCell { nci: cell.nci, node_id: cell.node_id, centre });
    }
    for (plmn, cells) in &networks {
        let cut = cut_length(cells);
        for result in test_network(cells) {
            client
                .execute(
                    "INSERT INTO observations.gnb_length_tests (evaluation_run_id, plmn, length, is_cut_length, cells, together, apart, sites)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                    &[&run_id, plmn, &(result.length as i16), &(cut == Some(result.length)), &result.cells, &result.together, &result.apart, &result.sites],
                )
                .await?;
        }
    }
    Ok(networks.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_geo::plane::LocalPlane;

    fn network() -> Vec<NrCell> {
        let plane = LocalPlane::around(Point::new(52.0, 21.0));
        (0..3_i64)
            .flat_map(|site| (0..3_i64).map(move |cell| (100 + site, site, cell)))
            .map(|(gnb, site, cell)| {
                let centre = plane.to_point(site as f64 * 20_000.0 + cell as f64 * 300.0, 0.0);
                NrCell { nci: (gnb << (NCI_BITS - 24)) | (cell + 1), node_id: Some(gnb), centre }
            })
            .collect()
    }

    #[test]
    fn the_length_of_the_network_keeps_each_gnb_together() {
        let results = test_network(&network());
        let at = |length: u32| results.iter().find(|result| result.length == length).copied().expect("a result per length");
        assert_eq!((at(24).together, at(24).apart, at(24).sites), (9, 0, 3));
        assert_eq!(at(22).apart, 9, "two bits too few merge the three gNBs, 20 km apart");
        assert_eq!(cut_length(&network()), Some(24));
    }
}
