use std::collections::{BTreeMap, BTreeSet};

use engine_estimate::grid::EvidenceGrid;
use engine_estimate::{ALGORITHM_VERSION, Estimate};
use futures_util::future::try_join_all;
use tokio_postgres::types::ToSql;
use tokio_postgres::{Statement, Transaction};

use crate::StoreError;
use crate::sites::confirmations::{Confirmation, Sighting, confirmation};
use crate::sites::copies::{CopyBasis, CopyOf, Member};
use crate::sites::inputs::CellRows;
use crate::sites::{SiteInput, Worked};

const ESTIMATE_COLUMNS: &str = "
      calibration_run_id, estimated_at, point, uncertainty_m, ellipse_major_m, ellipse_minor_m,
      ellipse_azimuth_deg, alternative_point, is_consistent, sample_count, contributor_count, person_count, bin_count, ta_sample_count,
      angular_coverage_deg, distinct_days, max_distance_m";

const ESTIMATE_VALUES: &str = "
      $20, now(), ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, $8,
      CASE WHEN $9::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($9, $10), 4326) END,
      $11, $12, $13, $14, $15, $16, $17, $18, $19";

const ESTIMATE_UPDATES: &str = "
      calibration_run_id = excluded.calibration_run_id, estimated_at = excluded.estimated_at, point = excluded.point,
      uncertainty_m = excluded.uncertainty_m, ellipse_major_m = excluded.ellipse_major_m, ellipse_minor_m = excluded.ellipse_minor_m,
      ellipse_azimuth_deg = excluded.ellipse_azimuth_deg, alternative_point = excluded.alternative_point, is_consistent = excluded.is_consistent,
      sample_count = excluded.sample_count, contributor_count = excluded.contributor_count, person_count = excluded.person_count,
      bin_count = excluded.bin_count, ta_sample_count = excluded.ta_sample_count, angular_coverage_deg = excluded.angular_coverage_deg,
      distinct_days = excluded.distinct_days, max_distance_m = excluded.max_distance_m";

const SITE_ESTIMATE_COLUMNS: &str = "leave_out_shift_m, evidence_class, ellipse_scale";

const SITE_ESTIMATE_VALUES: &str = "$21, $22::text::evidence_class, $23";

const SITE_ESTIMATE_UPDATES: &str =
    "leave_out_shift_m = excluded.leave_out_shift_m, evidence_class = excluded.evidence_class, ellipse_scale = excluded.ellipse_scale";

const WRITE_GRIDS: &str = "
    INSERT INTO observations.site_evidence_grids (observed_site_id, algorithm_version, origin, cell_m, columns, rows, cost)
    SELECT g.site_id, $1::int2, ST_SetSRID(ST_MakePoint(g.longitude, g.latitude), 4326), g.cell_m, g.column_count, g.row_count, g.cost
    FROM unnest($2::int[], $3::float8[], $4::float8[], $5::int2[], $6::int2[], $7::int2[], $8::bytea[])
      AS g(site_id, longitude, latitude, cell_m, column_count, row_count, cost)
    ORDER BY g.site_id
    ON CONFLICT (observed_site_id, algorithm_version) DO UPDATE SET
      origin = excluded.origin, cell_m = excluded.cell_m, columns = excluded.columns, rows = excluded.rows, cost = excluded.cost";

const CONFIRM_CELLS: &str = "
    INSERT INTO observations.cell_confirmations (observed_cell_id, basis)
    SELECT id, basis::confirmation_basis FROM unnest($1::int[], $2::text[]) AS confirmed(id, basis)
    ORDER BY id
    ON CONFLICT (observed_cell_id) DO UPDATE SET basis = excluded.basis, confirmed_at = now()
    WHERE cell_confirmations.basis <> excluded.basis";

const CONFIRM_SITES: &str = "
    INSERT INTO observations.site_confirmations (observed_site_id, basis)
    SELECT id, basis::confirmation_basis FROM unnest($1::int[], $2::text[]) AS confirmed(id, basis)
    ORDER BY id
    ON CONFLICT (observed_site_id) DO UPDATE SET basis = excluded.basis, confirmed_at = now()
    WHERE site_confirmations.basis <> excluded.basis";

const WRITE_COPIES: &str = "
    INSERT INTO observations.cell_copies (observed_cell_id, primary_cell_id, basis)
    SELECT id, primary_id, basis::cell_copy_basis FROM unnest($1::int[], $2::int[], $3::text[]) AS found(id, primary_id, basis)
    ORDER BY id
    ON CONFLICT (observed_cell_id) DO UPDATE SET primary_cell_id = excluded.primary_cell_id, basis = excluded.basis, found_at = now()";

pub(crate) fn group_estimate_statement() -> String {
    format!("INSERT INTO observations.group_estimates (lead_site_id, algorithm_version, {ESTIMATE_COLUMNS}) VALUES ($1, $2, {ESTIMATE_VALUES})")
}

fn site_estimate_statement() -> String {
    format!(
        "INSERT INTO observations.site_estimates (observed_site_id, algorithm_version, {ESTIMATE_COLUMNS}, {SITE_ESTIMATE_COLUMNS})
         VALUES ($1, $2, {ESTIMATE_VALUES}, {SITE_ESTIMATE_VALUES})
         ON CONFLICT (observed_site_id, algorithm_version) DO UPDATE SET {ESTIMATE_UPDATES}, {SITE_ESTIMATE_UPDATES}"
    )
}

pub(crate) async fn insert_estimate(
    transaction: &Transaction<'_>,
    statement: &Statement,
    id: i32,
    estimate: &Estimate,
    run_id: Option<i32>,
    site_columns: &[&(dyn ToSql + Sync)],
) -> Result<(), StoreError> {
    let evidence = &estimate.evidence;
    let alternative = estimate.alternative_point;
    let (alternative_longitude, alternative_latitude) = (alternative.map(|point| point.longitude), alternative.map(|point| point.latitude));
    let shared_columns: [&(dyn ToSql + Sync); 20] = [
        &id,
        &ALGORITHM_VERSION,
        &estimate.point.longitude,
        &estimate.point.latitude,
        &estimate.uncertainty_m,
        &estimate.ellipse_major_m,
        &estimate.ellipse_minor_m,
        &estimate.ellipse_azimuth_deg,
        &alternative_longitude,
        &alternative_latitude,
        &estimate.is_consistent,
        &evidence.sample_count,
        &evidence.contributor_count,
        &evidence.person_count,
        &evidence.bin_count,
        &evidence.ta_sample_count,
        &evidence.angular_coverage_deg,
        &evidence.distinct_days,
        &evidence.max_distance_m,
        &run_id,
    ];
    let params: Vec<&(dyn ToSql + Sync)> = shared_columns.into_iter().chain(site_columns.iter().copied()).collect();
    transaction.execute(statement, &params).await?;
    Ok(())
}

pub(crate) async fn write_estimates(
    transaction: &Transaction<'_>,
    worked: &[(SiteInput, Option<Worked>)],
    run_id: Option<i32>,
) -> Result<(), StoreError> {
    let unestimated: Vec<i32> = worked.iter().filter(|(_, work)| work.is_none()).map(|(input, _)| input.site_id).collect();
    transaction
        .execute(
            "DELETE FROM observations.site_estimates WHERE observed_site_id = ANY($1) AND algorithm_version = $2",
            &[&unestimated, &ALGORITHM_VERSION],
        )
        .await?;
    let statement = transaction.prepare(&site_estimate_statement()).await?;
    let upserts = worked.iter().filter_map(|(input, work)| Some((input.site_id, work.as_ref()?))).map(|(site_id, work)| {
        let statement = &statement;
        async move {
            let estimate = &work.estimate;
            let (evidence_class, ellipse_scale) = (estimate.evidence.class().label(), estimate.ellipse_scale as f32);
            let site_columns: [&(dyn ToSql + Sync); 3] = [&work.leave_out_shift_m, &evidence_class, &ellipse_scale];
            insert_estimate(transaction, statement, site_id, estimate, run_id, &site_columns).await
        }
    });
    try_join_all(upserts).await?;
    Ok(())
}

pub(crate) async fn write_grids(transaction: &Transaction<'_>, worked: &[(SiteInput, Option<Worked>)]) -> Result<(), StoreError> {
    let mut grids: Vec<(i32, &EvidenceGrid)> = Vec::new();
    let mut without_grid: Vec<i32> = Vec::new();
    for (input, work) in worked {
        let Some(work) = work else {
            continue;
        };
        match &work.grid {
            Some(grid) => grids.push((input.site_id, grid)),
            None => without_grid.push(input.site_id),
        }
    }
    transaction
        .execute(
            "DELETE FROM observations.site_evidence_grids WHERE observed_site_id = ANY($1) AND algorithm_version = $2",
            &[&without_grid, &ALGORITHM_VERSION],
        )
        .await?;
    let site_ids: Vec<i32> = grids.iter().map(|&(site_id, _)| site_id).collect();
    let longitudes: Vec<f64> = grids.iter().map(|(_, grid)| grid.origin.longitude).collect();
    let latitudes: Vec<f64> = grids.iter().map(|(_, grid)| grid.origin.latitude).collect();
    let cell_sizes: Vec<i16> = grids.iter().map(|(_, grid)| grid.cell_m).collect();
    let column_counts: Vec<i16> = grids.iter().map(|(_, grid)| grid.columns).collect();
    let row_counts: Vec<i16> = grids.iter().map(|(_, grid)| grid.rows).collect();
    let costs: Vec<&[u8]> = grids.iter().map(|(_, grid)| grid.cost.as_slice()).collect();
    transaction
        .execute(WRITE_GRIDS, &[&ALGORITHM_VERSION, &site_ids, &longitudes, &latitudes, &cell_sizes, &column_counts, &row_counts, &costs])
        .await?;
    Ok(())
}

#[derive(Default)]
struct ConfirmationRows {
    confirmed: Vec<i32>,
    bases: Vec<&'static str>,
    unconfirmed: Vec<i32>,
}

impl ConfirmationRows {
    fn add(&mut self, id: i32, basis: Option<Confirmation>) {
        match basis {
            Some(basis) => {
                self.confirmed.push(id);
                self.bases.push(basis.label());
            }
            None => self.unconfirmed.push(id),
        }
    }
}

pub(crate) async fn write_confirmations(
    transaction: &Transaction<'_>,
    worked: &[(SiteInput, Option<Worked>)],
    rows: &CellRows,
) -> Result<BTreeSet<i32>, StoreError> {
    let sightings_of = |ids: &[i32]| -> Vec<Sighting> {
        ids.iter().flat_map(|id| rows.sightings.get(id).into_iter().flatten().map(|(_, sighting)| *sighting)).collect()
    };
    let (mut cells, mut sites) = (ConfirmationRows::default(), ConfirmationRows::default());
    for (input, _) in worked {
        for ids in &input.cell_ids {
            if let Some(&cell_id) = ids.first() {
                cells.add(cell_id, confirmation(&sightings_of(ids), &rows.confirming_alone));
            }
        }
        let all: Vec<i32> = input.cell_ids.iter().flatten().copied().collect();
        sites.add(input.site_id, confirmation(&sightings_of(&all), &rows.confirming_alone));
    }
    transaction.execute(CONFIRM_CELLS, &[&cells.confirmed, &cells.bases]).await?;
    transaction.execute("DELETE FROM observations.cell_confirmations WHERE observed_cell_id = ANY($1)", &[&cells.unconfirmed]).await?;
    transaction.execute(CONFIRM_SITES, &[&sites.confirmed, &sites.bases]).await?;
    transaction.execute("DELETE FROM observations.site_confirmations WHERE observed_site_id = ANY($1)", &[&sites.unconfirmed]).await?;
    Ok(sites.confirmed.into_iter().collect())
}

pub(crate) async fn write_copies(transaction: &Transaction<'_>, members: &[Member], copies: &BTreeMap<i32, CopyOf>) -> Result<Vec<i32>, StoreError> {
    let ids: Vec<i32> = members.iter().map(|member| member.id).collect();
    let stored: BTreeMap<i32, CopyOf> = transaction
        .query("SELECT observed_cell_id, primary_cell_id, basis::text FROM observations.cell_copies WHERE observed_cell_id = ANY($1)", &[&ids])
        .await?
        .iter()
        .filter_map(|row| Some((row.get(0), CopyOf { primary_cell_id: row.get(1), basis: CopyBasis::of_label(row.get(2))? })))
        .collect();
    let gone: Vec<i32> = stored.keys().filter(|&id| !copies.contains_key(id)).copied().collect();
    transaction.execute("DELETE FROM observations.cell_copies WHERE observed_cell_id = ANY($1)", &[&gone]).await?;
    let found: Vec<(i32, CopyOf)> = copies.iter().filter(|&(id, copy)| stored.get(id) != Some(copy)).map(|(&id, &copy)| (id, copy)).collect();
    let found_ids: Vec<i32> = found.iter().map(|&(id, _)| id).collect();
    let primary_ids: Vec<i32> = found.iter().map(|(_, copy)| copy.primary_cell_id).collect();
    let bases: Vec<&str> = found.iter().map(|(_, copy)| copy.basis.label()).collect();
    transaction.execute(WRITE_COPIES, &[&found_ids, &primary_ids, &bases]).await?;
    Ok(gone.into_iter().chain(found_ids).collect())
}

pub(crate) async fn forget_copies(
    transaction: &Transaction<'_>,
    copy_sites: &BTreeMap<i32, i32>,
    copies: &BTreeMap<i32, CopyOf>,
) -> Result<(), StoreError> {
    let copy_site_ids: Vec<i32> = copy_sites.keys().copied().collect();
    transaction.execute("DELETE FROM observations.site_estimates WHERE observed_site_id = ANY($1)", &[&copy_site_ids]).await?;
    transaction.execute("DELETE FROM observations.site_confirmations WHERE observed_site_id = ANY($1)", &[&copy_site_ids]).await?;
    transaction.execute("DELETE FROM observations.group_estimates WHERE lead_site_id = ANY($1)", &[&copy_site_ids]).await?;
    let copy_cell_ids: Vec<i32> = copies.keys().copied().collect();
    transaction.execute("DELETE FROM observations.cell_confirmations WHERE observed_cell_id = ANY($1)", &[&copy_cell_ids]).await?;
    transaction.execute("DELETE FROM observations.cell_shapes WHERE observed_cell_id = ANY($1)", &[&copy_cell_ids]).await?;
    Ok(())
}
