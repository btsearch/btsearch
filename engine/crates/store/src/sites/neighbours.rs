use std::collections::{BTreeMap, BTreeSet};

use deadpool_postgres::Object;
use engine_estimate::{ALGORITHM_VERSION, Estimate};
use engine_fold::deltas::NEIGHBOUR_ZOOM;
use engine_geo::Point;
use engine_geo::plane::{METERS_PER_DEGREE, distance_meters};
use engine_geo::square::Tile;
use tokio_postgres::GenericClient;

use crate::StoreError;
use crate::calibrated::rat_of;
use crate::sites::inputs::{CellCodes, load_current_codes};
use crate::sites::{Previous, SiteInput};

const MOST_REACH_M: f64 = 15_000.0;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Key {
    plmn: String,
    rat: String,
    channel: i32,
    pci: i16,
}

#[derive(Debug, Clone, Copy)]
pub struct Reach {
    pub site: Point,
    pub reach_m: f64,
}

impl Reach {
    fn of(site: Point, max_distance_m: i32) -> Self {
        Self { site, reach_m: f64::from(max_distance_m).min(MOST_REACH_M) }
    }

    fn covers(&self, point: Point) -> bool {
        distance_meters(self.site, point) <= self.reach_m
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Contender {
    pub cell_id: i32,
    pub reach: Reach,
}

pub fn resolve(bin: Point, contenders: &[Contender]) -> Option<i32> {
    let mut covering = contenders.iter().filter(|contender| contender.reach.covers(bin));
    let only = covering.next()?;
    covering.next().is_none().then_some(only.cell_id)
}

pub fn resolvable_bins(rows: impl IntoIterator<Item = (u64, bool)>) -> BTreeSet<u64> {
    rows.into_iter().filter(|&(_, held)| !held).map(|(bin, _)| bin).collect()
}

fn centre_of(bin: u64) -> Point {
    Tile::from_quadkey(bin, NEIGHBOUR_ZOOM).centre()
}

async fn cell_networks(client: &impl GenericClient, cell_ids: &[i32]) -> Result<BTreeMap<i32, (String, String)>, StoreError> {
    let rows = client.query("SELECT id, plmn, rat::text FROM observations.observed_cells WHERE id = ANY($1)", &[&cell_ids]).await?;
    Ok(rows.iter().map(|row| (row.get(0), (row.get(1), row.get(2)))).collect())
}

async fn load_contenders(client: &impl GenericClient, keys: &BTreeMap<Key, Vec<Reach>>) -> Result<BTreeMap<Key, Vec<Contender>>, StoreError> {
    let regions: Vec<&Reach> = keys.values().flatten().collect();
    let latitudes: Vec<f64> = regions.iter().map(|region| region.site.latitude).collect();
    let longitudes: Vec<f64> = regions.iter().map(|region| region.site.longitude).collect();
    let reaches: Vec<f64> = regions.iter().map(|region| region.reach_m).collect();
    let networks: BTreeSet<(&str, &str)> = keys.keys().map(|key| (key.plmn.as_str(), key.rat.as_str())).collect();
    let (plmns, rats): (Vec<&str>, Vec<&str>) = networks.into_iter().unzip();
    let rows = client
        .query(
            "SELECT DISTINCT c.id, c.plmn, c.rat::text, ST_Y(e.point), ST_X(e.point), e.max_distance_m
             FROM unnest($1::float8[], $2::float8[], $3::float8[]) AS q(latitude, longitude, reach)
             JOIN observations.site_estimates e ON e.algorithm_version = $4
               AND ST_DWithin(e.point, ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326), (q.reach + $5) / ($6 * cos(radians(q.latitude))))
             JOIN observations.observed_cells p ON p.observed_site_id = e.observed_site_id
             CROSS JOIN LATERAL (
               SELECT p.id UNION ALL SELECT k.observed_cell_id FROM observations.cell_copies k WHERE k.primary_cell_id = p.id
             ) AS cell(id)
             JOIN observations.observed_cells c ON c.id = cell.id
             WHERE (c.plmn, c.rat::text) IN (SELECT * FROM unnest($7::text[], $8::text[]))
             ORDER BY 1",
            &[&latitudes, &longitudes, &reaches, &ALGORITHM_VERSION, &MOST_REACH_M, &METERS_PER_DEGREE, &plmns, &rats],
        )
        .await?;
    let cell_ids: Vec<i32> = rows.iter().map(|row| row.get(0)).collect();
    let codes = load_current_codes(client, &cell_ids).await?;
    let mut contenders: BTreeMap<Key, Vec<Contender>> = BTreeMap::new();
    for row in &rows {
        let cell_id: i32 = row.get(0);
        let Some(&CellCodes { channel: Some(channel), pci: Some(pci) }) = codes.get(&cell_id) else {
            continue;
        };
        let Ok(pci) = i16::try_from(pci) else {
            continue;
        };
        let key = Key { plmn: row.get(1), rat: row.get(2), channel, pci };
        if keys.contains_key(&key) {
            let reach = Reach::of(Point::new(row.get(3), row.get(4)), row.get(5));
            contenders.entry(key).or_default().push(Contender { cell_id, reach });
        }
    }
    Ok(contenders)
}

async fn load_bins(client: &impl GenericClient, keys: &[&Key]) -> Result<Vec<BTreeSet<u64>>, StoreError> {
    let plmns: Vec<&str> = keys.iter().map(|key| key.plmn.as_str()).collect();
    let rats: Vec<&str> = keys.iter().map(|key| key.rat.as_str()).collect();
    let channels: Vec<i32> = keys.iter().map(|key| key.channel).collect();
    let pcis: Vec<i16> = keys.iter().map(|key| key.pci).collect();
    let rows = client
        .query(
            "SELECT k.n, n.bin, n.held
             FROM unnest($1::text[], $2::text[], $3::int[], $4::int2[]) WITH ORDINALITY AS k(plmn, rat, channel, pci, n)
             JOIN observations.neighbour_bins n ON n.plmn = k.plmn AND n.rat = k.rat::rat AND n.channel = k.channel AND n.pci = k.pci",
            &[&plmns, &rats, &channels, &pcis],
        )
        .await?;
    let mut rows_by_key: Vec<Vec<(u64, bool)>> = vec![Vec::new(); keys.len()];
    for row in &rows {
        let position = row.get::<_, i64>(0) as usize - 1;
        rows_by_key[position].push((row.get::<_, i64>(1) as u64, row.get(2)));
    }
    Ok(rows_by_key.into_iter().map(resolvable_bins).collect())
}

pub(crate) async fn resolve_neighbours(
    client: &mut Object,
    estimated: &[(&SiteInput, &Estimate)],
    previous: &BTreeMap<i32, Previous>,
) -> Result<(), StoreError> {
    let cell_ids: Vec<i32> = estimated.iter().flat_map(|(input, _)| input.cell_ids.iter().flatten().copied()).collect();
    let networks = cell_networks(&***client, &cell_ids).await?;

    let mut keys: BTreeMap<Key, Vec<Reach>> = BTreeMap::new();
    for (input, estimate) in estimated {
        let mut regions = vec![Reach::of(estimate.point, estimate.evidence.max_distance_m)];
        regions.extend(previous.get(&input.site_id).map(|before| Reach::of(before.point, before.reach_m)));
        for ((cell, ids), pci) in input.site.cells.iter().zip(&input.cell_ids).zip(&input.cell_pcis) {
            let (Some(channel), Some(pci)) = (cell.channel, pci.and_then(|pci| i16::try_from(pci).ok())) else {
                continue;
            };
            for id in ids {
                let Some((plmn, rat)) = networks.get(id) else {
                    continue;
                };
                if rat != rat_of(cell.technology) {
                    continue;
                }
                keys.entry(Key { plmn: plmn.clone(), rat: rat.clone(), channel, pci }).or_default().extend(regions.iter().copied());
            }
        }
    }
    if keys.is_empty() {
        return Ok(());
    }

    let ordered: Vec<&Key> = keys.keys().collect();
    let (contenders, bins_by_key) = tokio::try_join!(load_contenders(&***client, &keys), load_bins(&***client, &ordered))?;
    let mut cleared: Vec<(&Key, u64)> = Vec::new();
    let mut resolved: Vec<(&Key, u64, i32)> = Vec::new();
    for (&key, bins) in ordered.iter().zip(&bins_by_key) {
        let regions = &keys[key];
        let rivals = contenders.get(key).map(Vec::as_slice).unwrap_or_default();
        for &bin in bins {
            let centre = centre_of(bin);
            if !regions.iter().any(|region| region.covers(centre)) {
                continue;
            }
            cleared.push((key, bin));
            if let Some(cell_id) = resolve(centre, rivals) {
                resolved.push((key, bin, cell_id));
            }
        }
    }

    let transaction = client.transaction().await?;
    let (plmns, rats, channels, pcis, bins) = columns_of(&cleared);
    transaction
        .execute(
            "DELETE FROM observations.resolved_neighbours r
             USING unnest($1::text[], $2::text[], $3::int[], $4::int2[], $5::int8[]) AS t(plmn, rat, channel, pci, bin)
             WHERE r.plmn = t.plmn AND r.rat = t.rat::rat AND r.channel = t.channel AND r.pci = t.pci AND r.bin = t.bin",
            &[&plmns, &rats, &channels, &pcis, &bins],
        )
        .await?;
    let (plmns, rats, channels, pcis, bins) = columns_of(&resolved.iter().map(|&(key, bin, _)| (key, bin)).collect::<Vec<_>>());
    let cells: Vec<i32> = resolved.iter().map(|&(_, _, cell_id)| cell_id).collect();
    transaction
        .execute(
            "INSERT INTO observations.resolved_neighbours (plmn, rat, channel, pci, bin, observed_cell_id)
             SELECT plmn, rat::rat, channel, pci, bin, cell FROM unnest($1::text[], $2::text[], $3::int[], $4::int2[], $5::int8[], $6::int[])
               AS t(plmn, rat, channel, pci, bin, cell)
             ORDER BY 1, 2, 3, 4, 5
             ON CONFLICT (plmn, rat, channel, pci, bin) DO UPDATE SET observed_cell_id = excluded.observed_cell_id",
            &[&plmns, &rats, &channels, &pcis, &bins, &cells],
        )
        .await?;
    transaction.commit().await?;
    Ok(())
}

fn columns_of<'a>(rows: &[(&'a Key, u64)]) -> (Vec<&'a str>, Vec<&'a str>, Vec<i32>, Vec<i16>, Vec<i64>) {
    (
        rows.iter().map(|(key, _)| key.plmn.as_str()).collect(),
        rows.iter().map(|(key, _)| key.rat.as_str()).collect(),
        rows.iter().map(|(key, _)| key.channel).collect(),
        rows.iter().map(|(key, _)| key.pci).collect(),
        rows.iter().map(|&(_, bin)| bin as i64).collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_geo::plane::LocalPlane;

    const HERE: Point = Point { latitude: 52.2297, longitude: 21.0122 };

    fn contender(cell_id: i32, east_m: f64, reach_m: f64) -> Contender {
        Contender { cell_id, reach: Reach { site: LocalPlane::around(HERE).to_point(east_m, 0.0), reach_m } }
    }

    #[test]
    fn a_neighbour_square_belongs_to_the_only_cell_that_reaches_it() {
        assert_eq!(resolve(HERE, &[contender(1, 500.0, 1_000.0), contender(2, 9_000.0, 2_000.0)]), Some(1));
    }

    #[test]
    fn a_neighbour_square_two_cells_reach_stays_unresolved() {
        assert_eq!(resolve(HERE, &[contender(1, 500.0, 1_000.0), contender(2, -800.0, 1_000.0)]), None);
        assert_eq!(resolve(HERE, &[contender(1, 5_000.0, 1_000.0)]), None);
    }

    #[test]
    fn a_held_neighbour_resolves_only_where_a_plain_row_agrees() {
        let bins = resolvable_bins([(10, true), (10, false), (11, true)]);
        assert_eq!(bins, BTreeSet::from([10]));
    }
}
