mod confirmations;
mod copies;
pub(crate) mod grouping;
pub(crate) mod inputs;
mod neighbours;
pub(crate) mod placing;
mod shapes;
pub(crate) mod snapping;
mod writes;

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use engine_estimate::firmness;
use engine_estimate::grid::{EvidenceGrid, evidence_grid};
use engine_estimate::input::{Context, Site};
use engine_estimate::shape::shape_of;
use engine_estimate::snap::CANDIDATE_REACH;
use engine_estimate::{ALGORITHM_VERSION, Estimate, estimate};
use engine_geo::Point;
use engine_geo::plane::distance_meters;
use tokio_postgres::GenericClient;

use crate::StoreError;
use crate::calibrated::Calibrated;
use crate::parallel::on_every_core;
use crate::pipeline::Store;
use crate::sites::grouping::load_group_mates;
use crate::sites::inputs::{load_inputs, prepare};
use crate::sites::neighbours::resolve_neighbours;
use crate::sites::placing::place_sites;
use crate::sites::shapes::{CellShape, label_edges, write_shapes};
use crate::sites::writes::{forget_copies, write_confirmations, write_copies, write_estimates, write_grids};
use crate::sql_types::Timestamp;

const SITES_PER_BATCH: i64 = 64;
const WAITING_UPLOADS_THAT_YIELD: i64 = 10;
const ATTEMPTS: i16 = 5;
const MOVED_M: f64 = 1.0;
const CLEAR_RADIUS_M: i32 = 300;
const DIFFERS_BY_RADII: f64 = 3.0;
const DIFFERS_BY_M: f64 = 300.0;

const CLAIM_DIRTY_SITES: &str = "
    DELETE FROM observations.dirty_sites
    WHERE observed_site_id IN (
      SELECT d.observed_site_id FROM observations.dirty_sites d
      WHERE d.dirty_since <= now() - interval '2 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM observations.site_estimates e
          WHERE e.observed_site_id = d.observed_site_id AND e.estimated_at > now() - interval '10 minutes'
        )
      ORDER BY d.dirty_since, d.observed_site_id
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING observed_site_id, dirty_since, attempts";

const RETURN_CLAIMS: &str = "
    INSERT INTO observations.dirty_sites (observed_site_id, dirty_since, attempts)
    SELECT s.id, c.dirty_since, c.attempts
    FROM unnest($1::int[], $2::timestamptz[], $3::int2[]) AS c(site_id, dirty_since, attempts)
    JOIN observations.observed_sites s ON s.id = c.site_id
    ORDER BY s.id
    ON CONFLICT (observed_site_id) DO UPDATE SET attempts = excluded.attempts";

const MARK_AFFECTED_SITES_DIRTY: &str = "
    INSERT INTO observations.dirty_sites (observed_site_id)
    SELECT s.id FROM observations.observed_sites s
    WHERE s.id <> ALL($3) AND (
      s.id = ANY($1) OR s.id IN (
        SELECT t.observed_site_id FROM observations.snap_tests t
        WHERE t.other_site_id = ANY($2) OR (
          t.other_site_id = ANY($3)
          AND EXISTS (SELECT 1 FROM observations.site_links l WHERE l.observed_site_id = t.other_site_id AND l.kind = 'matched')
        )
      ) OR s.id IN (
        SELECT e.observed_site_id FROM observations.site_estimates e
        JOIN observations.site_estimates y ON y.observed_site_id = ANY($2) AND y.algorithm_version = e.algorithm_version
        WHERE e.algorithm_version = $4 AND e.observed_site_id <> y.observed_site_id
          AND 2 * y.uncertainty_m <= e.uncertainty_m AND ST_DistanceSphere(e.point, y.point) <= $5::float8 * e.uncertainty_m
      )
    )
    ORDER BY s.id
    ON CONFLICT (observed_site_id) DO NOTHING";

#[derive(Debug, Clone, Copy)]
struct Claimed {
    site_id: i32,
    dirty_since: Timestamp,
    attempts: i16,
}

pub struct SiteInput {
    pub site_id: i32,
    pub plmn: String,
    pub site: Site,
    pub cell_ids: Vec<Vec<i32>>,
    pub cell_pcis: Vec<Option<i32>>,
    station_at: Option<Point>,
}

pub(crate) struct Worked {
    pub estimate: Estimate,
    leave_out_shift_m: Option<i32>,
    grid: Option<EvidenceGrid>,
    pub shapes: Vec<Option<CellShape>>,
}

pub(crate) struct Previous {
    pub point: Point,
    pub reach_m: i32,
    uncertainty_m: i32,
    is_ambiguous: bool,
    is_consistent: bool,
    is_confirmed: bool,
}

impl Store {
    async fn uploads_are_waiting(&self) -> Result<bool, StoreError> {
        let client = self.database.pool.get().await?;
        let waiting: i64 = client
            .query_one(
                "SELECT count(*) FROM (SELECT 1 FROM observations.uploads WHERE status = 'received' LIMIT $1) waiting",
                &[&WAITING_UPLOADS_THAT_YIELD],
            )
            .await?
            .get(0);
        Ok(waiting >= WAITING_UPLOADS_THAT_YIELD)
    }

    pub async fn estimate_dirty_sites(&self) -> Result<usize, StoreError> {
        if self.uploads_are_waiting().await? {
            return Ok(0);
        }
        let claimed = {
            let client = self.database.pool.get().await?;
            let rows = client.query(CLAIM_DIRTY_SITES, &[&SITES_PER_BATCH]).await?;
            rows.iter().map(|row| Claimed { site_id: row.get(0), dirty_since: row.get(1), attempts: row.get(2) }).collect::<Vec<_>>()
        };
        if claimed.is_empty() {
            return Ok(0);
        }
        let site_ids: Vec<i32> = claimed.iter().map(|site| site.site_id).collect();
        match self.estimate_sites(&site_ids).await {
            Ok(estimated) => Ok(estimated),
            Err(error) => {
                self.return_claims(&claimed).await?;
                Err(error)
            }
        }
    }

    async fn return_claims(&self, claimed: &[Claimed]) -> Result<(), StoreError> {
        let retried: Vec<&Claimed> = claimed.iter().filter(|site| site.attempts + 1 < ATTEMPTS).collect();
        let site_ids: Vec<i32> = retried.iter().map(|site| site.site_id).collect();
        let dirty_since: Vec<Timestamp> = retried.iter().map(|site| site.dirty_since).collect();
        let attempts: Vec<i16> = retried.iter().map(|site| site.attempts + 1).collect();
        let client = self.database.pool.get().await?;
        client.execute(RETURN_CLAIMS, &[&site_ids, &dirty_since, &attempts]).await?;
        Ok(())
    }

    pub async fn estimate_sites(&self, site_ids: &[i32]) -> Result<usize, StoreError> {
        let mut client = self.database.pool.get().await?;
        let (calibrated, previous, mates) =
            tokio::try_join!(Calibrated::latest(&**client), load_previous(&**client, site_ids), load_group_mates(&**client, site_ids))?;
        let calibrated = Arc::new(calibrated);
        let prepared = prepare(&**client, site_ids, &calibrated).await?;
        let mut worked = in_parallel(prepared.inputs, calibrated.clone(), work_on).await?;
        label_edges(&**client, &mut worked).await?;

        let transaction = client.transaction().await?;
        let changed_cells = write_copies(&transaction, &prepared.members, &prepared.copies).await?;
        write_estimates(&transaction, &worked, calibrated.run_id).await?;
        write_grids(&transaction, &worked).await?;
        let confirmed_sites = write_confirmations(&transaction, &worked, &prepared.rows).await?;
        write_shapes(&transaction, &worked).await?;
        let mut changed_sites: Vec<i32> = prepared.copy_sites.keys().filter(|&id| previous.contains_key(id)).copied().collect();
        for (input, work) in &worked {
            let estimate = work.as_ref().map(|work| &work.estimate);
            if has_changed(previous.get(&input.site_id), estimate, confirmed_sites.contains(&input.site_id)) {
                changed_sites.push(input.site_id);
            }
        }
        forget_copies(&transaction, &prepared.copy_sites, &prepared.copies).await?;

        let mut estimated_sites: Vec<i32> = worked.iter().filter(|(_, work)| work.is_some()).map(|(input, _)| input.site_id).collect();
        estimated_sites.sort_unstable();
        transaction
            .execute(
                "INSERT INTO observations.match_queue (observed_cell_id)
                 SELECT id FROM observations.observed_cells WHERE observed_site_id = ANY($1) ORDER BY id
                 ON CONFLICT (observed_cell_id) DO UPDATE SET queued_at = now()",
                &[&estimated_sites],
            )
            .await?;
        let batch: BTreeSet<i32> = site_ids.iter().copied().collect();
        let sites_of_changed_cells = changed_cells.iter().filter_map(|id| prepared.site_of.get(id).copied().flatten());
        let touched: Vec<i32> = prepared
            .copy_sites
            .values()
            .copied()
            .chain(sites_of_changed_cells)
            .filter(|site| !batch.contains(site))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        transaction.execute(MARK_AFFECTED_SITES_DIRTY, &[&touched, &changed_sites, &site_ids, &ALGORITHM_VERSION, &CANDIDATE_REACH]).await?;
        transaction.commit().await?;

        let estimated: Vec<(&SiteInput, &Estimate)> = worked.iter().filter_map(|(input, work)| Some((input, &work.as_ref()?.estimate))).collect();
        place_sites(&mut client, &calibrated, &mates, &estimated).await?;
        resolve_neighbours(&mut client, &estimated, &previous).await?;
        Ok(estimated_sites.len())
    }
}

fn work_on(input: &SiteInput, context: &Context) -> Option<Worked> {
    let estimate = estimate(&input.site, context)?;
    let leave_out_shift_m = firmness::leave_out_shift_m(&input.site, &estimate, context);
    let grid = editors_look_at(&estimate, input.station_at).then(|| evidence_grid(&input.site, &estimate, context)).flatten();
    let shapes = input.site.cells.iter().map(|cell| shape_of(cell, &estimate).map(|shape| CellShape { shape, edges: Vec::new() })).collect();
    Some(Worked { estimate, leave_out_shift_m, grid, shapes })
}

pub(crate) fn own_estimate(input: &SiteInput, context: &Context) -> Option<Estimate> {
    estimate(&input.site, context)
}

fn editors_look_at(estimate: &Estimate, station_at: Option<Point>) -> bool {
    let Some(station_at) = station_at else {
        return true;
    };
    let radius = f64::from(estimate.uncertainty_m);
    estimate.uncertainty_m < CLEAR_RADIUS_M && distance_meters(estimate.point, station_at) > (DIFFERS_BY_RADII * radius).max(DIFFERS_BY_M)
}

fn has_changed(previous: Option<&Previous>, estimate: Option<&Estimate>, is_confirmed: bool) -> bool {
    match (previous, estimate) {
        (None, None) => false,
        (Some(previous), Some(estimate)) => {
            distance_meters(previous.point, estimate.point) > MOVED_M
                || previous.uncertainty_m != estimate.uncertainty_m
                || previous.is_ambiguous != estimate.alternative_point.is_some()
                || previous.is_consistent != estimate.is_consistent
                || previous.is_confirmed != is_confirmed
        }
        _ => true,
    }
}

async fn load_previous(client: &impl GenericClient, site_ids: &[i32]) -> Result<BTreeMap<i32, Previous>, StoreError> {
    let rows = client
        .query(
            "SELECT e.observed_site_id, ST_Y(e.point), ST_X(e.point), e.max_distance_m, e.uncertainty_m, e.alternative_point IS NOT NULL, e.is_consistent,
               EXISTS (SELECT 1 FROM observations.site_confirmations c WHERE c.observed_site_id = e.observed_site_id)
             FROM observations.site_estimates e WHERE e.observed_site_id = ANY($1) AND e.algorithm_version = $2",
            &[&site_ids, &ALGORITHM_VERSION],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|row| {
            let previous = Previous {
                point: Point::new(row.get(1), row.get(2)),
                reach_m: row.get(3),
                uncertainty_m: row.get(4),
                is_ambiguous: row.get(5),
                is_consistent: row.get(6),
                is_confirmed: row.get(7),
            };
            (row.get(0), previous)
        })
        .collect())
}

pub async fn load_site_input(client: &impl GenericClient, site_id: i32, calibrated: &Calibrated) -> Result<Option<SiteInput>, StoreError> {
    Ok(load_inputs(client, &[site_id], calibrated).await?.into_iter().next())
}

pub(crate) async fn in_parallel<T: Send + 'static>(
    inputs: Vec<SiteInput>,
    calibrated: Arc<Calibrated>,
    work: fn(&SiteInput, &Context) -> T,
) -> Result<Vec<(SiteInput, T)>, StoreError> {
    let (inputs, results) = tokio::task::spawn_blocking(move || {
        let results = on_every_core(&inputs, |input| work(input, &calibrated.context));
        (inputs, results)
    })
    .await
    .map_err(|error| StoreError::data(format!("the estimator stopped: {error}")))?;
    let results = results.ok_or_else(|| StoreError::data("an estimator thread stopped before it finished"))?;
    Ok(inputs.into_iter().zip(results).collect())
}
