use std::collections::{BTreeMap, BTreeSet};

use engine_estimate::input::Cell;
use engine_estimate::shape::{Beyond, EDGE_DAYS, EDGE_ZOOM, Edge, SHAPE_VERSION, Shape, Surroundings, edge_squares, edges_of};
use engine_geo::Point;
use tokio_postgres::{GenericClient, Transaction};

use crate::StoreError;
use crate::calibrated::rat_of;
use crate::sites::{SiteInput, Worked};

pub(crate) struct CellShape {
    pub shape: Shape,
    pub edges: Vec<Edge>,
}

#[derive(Default)]
struct TrailLayers {
    by_square: BTreeMap<u64, Vec<(String, i32)>>,
}

impl Surroundings for TrailLayers {
    fn beyond(&self, square: u64, cell: &Cell) -> Beyond {
        let Some(layers) = self.by_square.get(&square) else {
            return Beyond::Nobody;
        };
        let rat = rat_of(cell.technology);
        if layers.iter().any(|(layer_rat, channel)| layer_rat == rat && Some(*channel) == cell.channel) {
            Beyond::SameLayer
        } else {
            Beyond::OtherLayersOnly
        }
    }
}

async fn load_trail_layers(
    client: &impl GenericClient,
    squares_by_plmn: &BTreeMap<&str, BTreeSet<u64>>,
) -> Result<BTreeMap<String, TrailLayers>, StoreError> {
    let plmns: Vec<&str> = squares_by_plmn.keys().copied().collect();
    let bins: Vec<i64> = squares_by_plmn.values().flatten().map(|&square| square as i64).collect::<BTreeSet<_>>().into_iter().collect();
    let rows = client
        .query(
            "SELECT plmn, bin, rat::text, channel FROM observations.trail_squares
             WHERE plmn = ANY($1) AND zoom = $2 AND NOT held AND last_seen_on >= current_date - $3::int AND bin = ANY($4)",
            &[&plmns, &i16::from(EDGE_ZOOM), &EDGE_DAYS, &bins],
        )
        .await?;
    let mut layers: BTreeMap<String, TrailLayers> = BTreeMap::new();
    for row in &rows {
        let (plmn, square): (String, u64) = (row.get(0), row.get::<_, i64>(1) as u64);
        if squares_by_plmn.get(plmn.as_str()).is_some_and(|squares| squares.contains(&square)) {
            layers.entry(plmn).or_default().by_square.entry(square).or_default().push((row.get(2), row.get(3)));
        }
    }
    Ok(layers)
}

pub(crate) async fn label_edges(client: &impl GenericClient, worked: &mut [(SiteInput, Option<Worked>)]) -> Result<(), StoreError> {
    let mut squares_by_plmn: BTreeMap<&str, BTreeSet<u64>> = BTreeMap::new();
    for (input, work) in worked.iter() {
        let Some(work) = work else {
            continue;
        };
        for cell_shape in work.shapes.iter().flatten() {
            squares_by_plmn.entry(input.plmn.as_str()).or_default().extend(edge_squares(&cell_shape.shape, work.estimate.point));
        }
    }
    let layers_by_plmn = if squares_by_plmn.is_empty() { BTreeMap::new() } else { load_trail_layers(client, &squares_by_plmn).await? };
    let nobody = TrailLayers::default();
    for (input, work) in worked.iter_mut() {
        let Some(work) = work else {
            continue;
        };
        let layers = layers_by_plmn.get(&input.plmn).unwrap_or(&nobody);
        for (cell, cell_shape) in input.site.cells.iter().zip(work.shapes.iter_mut()) {
            if let Some(cell_shape) = cell_shape {
                cell_shape.edges = edges_of(cell, &cell_shape.shape, work.estimate.point, layers);
            }
        }
    }
    Ok(())
}

pub(crate) async fn write_shapes(transaction: &Transaction<'_>, worked: &[(SiteInput, Option<Worked>)]) -> Result<(), StoreError> {
    let mut unshaped_ids: Vec<i32> = Vec::new();
    let mut shaped: Vec<(i32, &CellShape)> = Vec::new();
    for (input, work) in worked {
        for (index, ids) in input.cell_ids.iter().enumerate() {
            let Some(&cell_id) = ids.first() else {
                continue;
            };
            match work.as_ref().and_then(|work| work.shapes.get(index)).and_then(Option::as_ref) {
                Some(cell_shape) => shaped.push((cell_id, cell_shape)),
                None => unshaped_ids.push(cell_id),
            }
        }
    }
    if !unshaped_ids.is_empty() {
        transaction
            .execute("DELETE FROM observations.cell_shapes WHERE observed_cell_id = ANY($1) AND shape_version = $2", &[&unshaped_ids, &SHAPE_VERSION])
            .await?;
    }
    if shaped.is_empty() {
        return Ok(());
    }
    let shaped_ids: Vec<i32> = shaped.iter().map(|&(cell_id, _)| cell_id).collect();
    upsert_shapes(transaction, &shaped, &shaped_ids).await?;
    replace_level_profiles(transaction, &shaped, &shaped_ids).await?;
    replace_edges(transaction, &shaped, &shaped_ids).await
}

fn coordinates_wkt(points: impl Iterator<Item = Point>) -> String {
    points.map(|point| format!("{} {}", point.longitude, point.latitude)).collect::<Vec<_>>().join(", ")
}

fn polygon_wkt(footprint: &[Point]) -> String {
    format!("POLYGON(({}))", coordinates_wkt(footprint.iter().chain(footprint.first()).copied()))
}

fn multi_line_wkt(pieces: &[Vec<Point>]) -> String {
    let lines: Vec<String> = pieces.iter().map(|piece| format!("({})", coordinates_wkt(piece.iter().copied()))).collect();
    format!("MULTILINESTRING({})", lines.join(", "))
}

async fn upsert_shapes(transaction: &Transaction<'_>, shaped: &[(i32, &CellShape)], shaped_ids: &[i32]) -> Result<(), StoreError> {
    let shapes: Vec<&Shape> = shaped.iter().map(|(_, cell_shape)| &cell_shape.shape).collect();
    let bearings: Vec<f32> = shapes.iter().map(|shape| shape.bearing_deg as f32).collect();
    let spreads: Vec<f32> = shapes.iter().map(|shape| shape.spread_deg as f32).collect();
    let reaches: Vec<i32> = shapes.iter().map(|shape| shape.reach_m).collect();
    let timing_advance_reaches: Vec<Option<i32>> = shapes.iter().map(|shape| shape.reach_ta_m).collect();
    let qualities: Vec<Option<i32>> = shapes.iter().map(|shape| shape.mean_quality_centi_db).collect();
    let sinrs: Vec<Option<i32>> = shapes.iter().map(|shape| shape.mean_sinr_centi_db).collect();
    let footprints: Vec<String> = shapes.iter().map(|shape| polygon_wkt(&shape.footprint)).collect();
    transaction
        .execute(
            "INSERT INTO observations.cell_shapes (observed_cell_id, shape_version, computed_at, bearing_deg, spread_deg, reach_m, reach_ta_m,
               mean_quality_centi_db, mean_sinr_centi_db, footprint)
             SELECT cell_id, $1::int2, now(), bearing, spread, reach, reach_ta, quality, sinr, ST_GeomFromText(footprint, 4326)
             FROM unnest($2::int[], $3::real[], $4::real[], $5::int[], $6::int[], $7::int[], $8::int[], $9::text[])
               AS t(cell_id, bearing, spread, reach, reach_ta, quality, sinr, footprint)
             ORDER BY cell_id
             ON CONFLICT (observed_cell_id, shape_version) DO UPDATE SET
               computed_at = excluded.computed_at, bearing_deg = excluded.bearing_deg, spread_deg = excluded.spread_deg, reach_m = excluded.reach_m,
               reach_ta_m = excluded.reach_ta_m, mean_quality_centi_db = excluded.mean_quality_centi_db,
               mean_sinr_centi_db = excluded.mean_sinr_centi_db, footprint = excluded.footprint",
            &[&SHAPE_VERSION, &shaped_ids, &bearings, &spreads, &reaches, &timing_advance_reaches, &qualities, &sinrs, &footprints],
        )
        .await?;
    Ok(())
}

async fn replace_level_profiles(transaction: &Transaction<'_>, shaped: &[(i32, &CellShape)], shaped_ids: &[i32]) -> Result<(), StoreError> {
    transaction
        .execute(
            "DELETE FROM observations.cell_level_profiles WHERE observed_cell_id = ANY($1) AND shape_version = $2",
            &[&shaped_ids, &SHAPE_VERSION],
        )
        .await?;
    let bands = shaped.iter().flat_map(|&(cell_id, cell_shape)| cell_shape.shape.profile.iter().map(move |band| (cell_id, band)));
    let mut cell_ids: Vec<i32> = Vec::new();
    let mut distance_bands: Vec<i16> = Vec::new();
    let mut levels: Vec<i32> = Vec::new();
    let mut sinrs: Vec<Option<i32>> = Vec::new();
    let mut samples: Vec<i32> = Vec::new();
    for (cell_id, band) in bands {
        cell_ids.push(cell_id);
        distance_bands.push(band.distance_band);
        levels.push(band.mean_level_centi_db);
        sinrs.push(band.mean_sinr_centi_db);
        samples.push(band.sample_count);
    }
    transaction
        .execute(
            "INSERT INTO observations.cell_level_profiles (observed_cell_id, shape_version, distance_band, mean_level_centi_db, mean_sinr_centi_db, sample_count)
             SELECT cell_id, $1::int2, band, level, sinr, samples
             FROM unnest($2::int[], $3::int2[], $4::int[], $5::int[], $6::int[]) AS t(cell_id, band, level, sinr, samples)",
            &[&SHAPE_VERSION, &cell_ids, &distance_bands, &levels, &sinrs, &samples],
        )
        .await?;
    Ok(())
}

async fn replace_edges(transaction: &Transaction<'_>, shaped: &[(i32, &CellShape)], shaped_ids: &[i32]) -> Result<(), StoreError> {
    transaction
        .execute("DELETE FROM observations.cell_edges WHERE observed_cell_id = ANY($1) AND shape_version = $2", &[&shaped_ids, &SHAPE_VERSION])
        .await?;
    let edges = shaped.iter().flat_map(|&(cell_id, cell_shape)| cell_shape.edges.iter().map(move |edge| (cell_id, edge)));
    let mut cell_ids: Vec<i32> = Vec::new();
    let mut kinds: Vec<&str> = Vec::new();
    let mut lengths: Vec<i32> = Vec::new();
    let mut lines: Vec<String> = Vec::new();
    for (cell_id, edge) in edges {
        cell_ids.push(cell_id);
        kinds.push(edge.kind.label());
        lengths.push(edge.length_m);
        lines.push(multi_line_wkt(&edge.pieces));
    }
    transaction
        .execute(
            "INSERT INTO observations.cell_edges (observed_cell_id, shape_version, kind, edge, length_m)
             SELECT cell_id, $1::int2, kind::cell_edge_kind, ST_GeomFromText(line, 4326), length
             FROM unnest($2::int[], $3::text[], $4::int[], $5::text[]) AS t(cell_id, kind, length, line)",
            &[&SHAPE_VERSION, &cell_ids, &kinds, &lengths, &lines],
        )
        .await?;
    Ok(())
}
