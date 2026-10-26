use std::collections::{BTreeMap, BTreeSet};

use engine_estimate::ALGORITHM_VERSION;
use engine_estimate::calibration::{
    AreaClass, EllipseMiss, LEAST_GROUP_SAMPLES, LEAST_GROUP_STATIONS, LEAST_MODEL_SAMPLES, LEAST_MODEL_STATIONS, SnapCase, TaFit, TaSample,
    fit_ellipse_scales, fit_error_model, fit_snap_priors, fit_timing_advance,
};
use engine_estimate::confidence::{is_surrounded, mahalanobis_squared};
use engine_estimate::error_model::ErrorModel;
use engine_estimate::input::{EvidenceClass, Technology};
use engine_estimate::objective::slant_m;
use engine_fold::report::DISTANCE_BUCKET_M;
use engine_geo::Point;
use engine_geo::plane::{LocalPlane, distance_meters};
use engine_geo::square::square_centre;
use tokio_postgres::types::ToSql;
use tokio_postgres::{Client, GenericClient, Transaction};

use crate::calibrated::{SnapKind, area_classes, rat_of, technology_of, uncalibrated_step_of, window_fits};
use crate::ground_truth::GROUND_TRUTH;
use crate::nightly::level_models::{fit_level_models, write_level_models};
use crate::nightly::{Half, stream_rows};
use crate::reported_codes::REPORTED_CODES;
use crate::{Database, StoreError};

pub(crate) const RIGHT_WITHIN_M: f64 = 50.0;

#[derive(Debug, Clone)]
pub(crate) struct GroundTruth {
    pub point: Point,
    pub location_id: i32,
    pub area_class: AreaClass,
    pub country_code: String,
}

#[derive(Debug, Clone, Copy)]
struct TaRow {
    ta_group_id: i16,
    technology: Technology,
    station_id: i32,
    area_class: AreaClass,
    distance_m: f64,
    steps: i16,
    samples: f64,
}

#[derive(Default)]
struct GroupRows {
    weights: BTreeMap<(i16, i32, AreaClass), f64>,
    stations: BTreeSet<i32>,
}

#[derive(Default)]
struct TimingAdvanceRows {
    groups: BTreeMap<(i16, Technology), GroupRows>,
}

impl TimingAdvanceRows {
    fn add(&mut self, row: TaRow) {
        let bucket = (row.distance_m / DISTANCE_BUCKET_M).round() as i32;
        let rows = self.groups.entry((row.ta_group_id, row.technology)).or_default();
        *rows.weights.entry((row.steps, bucket, row.area_class)).or_insert(0.0) += row.samples;
        rows.stations.insert(row.station_id);
    }

    fn fits(&self) -> BTreeMap<(i16, Technology), TaFit> {
        self.groups
            .iter()
            .filter(|(_, rows)| rows.total() >= LEAST_GROUP_SAMPLES && rows.stations.len() >= LEAST_GROUP_STATIONS)
            .filter_map(|(&(group, technology), rows)| {
                Some(((group, technology), fit_timing_advance(&rows.samples(technology.timing_advance_step_m()?))?))
            })
            .collect()
    }

    fn error_models(
        &self,
        fits: &BTreeMap<(i16, Technology), TaFit>,
        sources: &BTreeMap<i16, String>,
    ) -> Vec<(i16, Technology, AreaClass, ErrorModel, f64)> {
        let mut models = Vec::new();
        for (&(group, technology), rows) in &self.groups {
            let fit = fits.get(&(group, technology)).copied();
            let source = sources.get(&group).map(String::as_str);
            let Some(step_m) = technology.timing_advance_step_m().filter(|_| step_is_known(fit, technology, source)) else {
                continue;
            };
            let calibration = fit.unwrap_or(TaFit::UNCALIBRATED).calibration(step_m);
            for area_class in AreaClass::ALL {
                let residuals: Vec<(f64, f64)> = rows
                    .weights
                    .iter()
                    .filter(|((_, _, class), _)| *class == area_class)
                    .map(|(&(steps, bucket, _), &weight)| (calibration.distance_m(steps) - true_distance(bucket), weight))
                    .collect();
                if let Some(model) = fit_error_model(&residuals, step_m) {
                    models.push((group, technology, area_class, model, residuals.iter().map(|(_, weight)| weight).sum::<f64>()));
                }
            }
        }
        models
    }

    fn counts_of(&self, group: i16, technology: Technology) -> (i32, i32) {
        self.groups.get(&(group, technology)).map_or((0, 0), |rows| (rows.total().round() as i32, rows.stations.len() as i32))
    }
}

impl GroupRows {
    fn samples(&self, step_m: f64) -> Vec<TaSample> {
        self.weights
            .iter()
            .map(|(&(steps, bucket, _), &weight)| TaSample { measured_m: f64::from(steps) * step_m, true_m: true_distance(bucket), weight })
            .collect()
    }

    fn total(&self) -> f64 {
        self.weights.values().sum()
    }
}

fn true_distance(bucket: i32) -> f64 {
    slant_m(f64::from(bucket) * DISTANCE_BUCKET_M, 0.0)
}

fn step_is_known(fit: Option<TaFit>, technology: Technology, source: Option<&str>) -> bool {
    fit.is_some() || source.is_some_and(|source| uncalibrated_step_of(technology, source).is_some())
}

fn fits_in_use(tonight: &BTreeMap<(i16, Technology), TaFit>, mut window: BTreeMap<(i16, Technology), TaFit>) -> BTreeMap<(i16, Technology), TaFit> {
    window.extend(tonight);
    window
}

const SLOTS: usize = 2 * (SnapKind::ALL.len() - 1);

fn kind_slot(kind: SnapKind, carries_operator: bool) -> Option<usize> {
    if kind == SnapKind::None {
        return None;
    }
    let position = SnapKind::ALL.iter().position(|&candidate| candidate == kind)?;
    Some(position * 2 + usize::from(carries_operator))
}

pub(crate) async fn latest_half(client: &impl GenericClient) -> Result<Option<Half>, StoreError> {
    let row = client.query_opt("SELECT station_half::text FROM observations.calibration_runs ORDER BY run_at DESC, id DESC LIMIT 1", &[]).await?;
    Ok(row.map(|row| Half::of_label(row.get(0))))
}

pub(crate) async fn ground_truth(client: &impl GenericClient, half: Half) -> Result<BTreeMap<i32, GroundTruth>, StoreError> {
    let rows = client
        .query(
            &format!(
                "SELECT st.id, l.latitude, l.longitude, st.location_id, r.country_code::text FROM public.stations st
                 JOIN public.locations l ON l.id = st.location_id
                 JOIN public.regions r ON r.id = l.region_id
                 WHERE st.id % 2 = $1 AND {GROUND_TRUTH}"
            ),
            &[&half.parity()],
        )
        .await?;
    let places: Vec<(i32, Point)> = rows.iter().map(|row| (row.get(0), Point::new(row.get(1), row.get(2)))).collect();
    let classes = area_classes(client, &places).await?;
    Ok(rows
        .iter()
        .zip(places)
        .map(|(row, (id, point))| {
            let area_class = classes.get(&id).copied().unwrap_or(AreaClass::Country);
            let truth = GroundTruth { point, location_id: row.get(3), area_class, country_code: row.get(4) };
            (id, truth)
        })
        .collect())
}

async fn timing_advance_rows(client: &Client, half: Half, stations: &BTreeMap<i32, GroundTruth>) -> Result<TimingAdvanceRows, StoreError> {
    let mut rows = TimingAdvanceRows::default();
    let parity = half.parity();
    let statement = format!(
        "SELECT t.ta_group_id, oc.rat::text, st.id, t.bin, t.timing_advance, t.sample_count
         FROM observations.cell_ta_bins t
         JOIN observations.cell_matches m ON m.observed_cell_id = t.observed_cell_id
         JOIN observations.observed_cells oc ON oc.id = t.observed_cell_id
         JOIN public.cells c ON c.id = m.cell_id
         JOIN public.stations st ON st.id = c.station_id
         WHERE oc.rat IN ('GSM', 'LTE', 'NR') AND st.id % 2 = $1 AND {GROUND_TRUTH}"
    );
    stream_rows(client, &statement, &[&parity as &(dyn ToSql + Sync)], |row| {
        let (Some(technology), Some(station)) = (technology_of(row.get(1)), stations.get(&row.get::<_, i32>(2))) else {
            return Ok(());
        };
        rows.add(TaRow {
            ta_group_id: row.get(0),
            technology,
            station_id: row.get(2),
            area_class: station.area_class,
            distance_m: distance_meters(square_centre(row.get::<_, i64>(3) as u64), station.point),
            steps: row.get(4),
            samples: f64::from(row.get::<_, i32>(5)),
        });
        Ok(())
    })
    .await?;
    Ok(rows)
}

struct ModelSplit {
    source: String,
    device_model_id: i32,
}

type ModelSamples = BTreeMap<(i16, String, Technology, i32), (Vec<TaSample>, BTreeSet<i32>)>;

async fn model_samples(client: &impl GenericClient, half: Half) -> Result<ModelSamples, StoreError> {
    let rows = client
        .query(
            "SELECT g.id, g.source::text, r.rat::text, d.model_id, r.station_id, r.timing_advance, r.distance_bucket, sum(r.samples)::float8
             FROM observations.upload_ta_residuals r
             JOIN observations.uploads u ON u.id = r.upload_id
             JOIN observations.upload_folds f ON f.upload_id = r.upload_id
             JOIN observations.upload_ta_groups ug ON ug.upload_id = r.upload_id AND ug.source = r.source
             JOIN observations.ta_groups g ON g.id = ug.ta_group_id AND g.device_model_id IS NULL
             JOIN observations.devices d ON d.id = u.device_id
             WHERE u.status = 'processed' AND f.unfolded_at IS NULL AND r.station_id % 2 = $1 AND r.rat IN ('GSM', 'LTE', 'NR')
             GROUP BY 1, 2, 3, 4, 5, 6, 7",
            &[&half.parity()],
        )
        .await?;
    let mut models: ModelSamples = BTreeMap::new();
    for row in &rows {
        let Some(technology) = technology_of(row.get(2)) else {
            continue;
        };
        let Some(step_m) = technology.timing_advance_step_m() else {
            continue;
        };
        let (samples, stations) = models.entry((row.get(0), row.get(1), technology, row.get(3))).or_default();
        let steps: i16 = row.get(5);
        samples.push(TaSample { measured_m: f64::from(steps) * step_m, true_m: true_distance(i32::from(row.get::<_, i16>(6))), weight: row.get(7) });
        stations.insert(row.get(4));
    }
    Ok(models)
}

fn splits_of(models: ModelSamples, fits: &BTreeMap<(i16, Technology), TaFit>) -> Vec<ModelSplit> {
    let mut splits: BTreeSet<(String, i32)> = BTreeSet::new();
    for ((group, source, technology, model), (samples, stations)) in models {
        let total: f64 = samples.iter().map(|sample| sample.weight).sum();
        let group_fit = fits.get(&(group, technology)).copied();
        if !step_is_known(group_fit, technology, Some(source.as_str())) || total < LEAST_MODEL_SAMPLES || stations.len() < LEAST_MODEL_STATIONS {
            continue;
        }
        if fit_timing_advance(&samples).is_some_and(|fit| fit.differs_from(group_fit.unwrap_or(TaFit::UNCALIBRATED))) {
            splits.insert((source, model));
        }
    }
    splits.into_iter().map(|(source, device_model_id)| ModelSplit { source, device_model_id }).collect()
}

async fn ellipse_misses(client: &impl GenericClient, half: Half) -> Result<Vec<EllipseMiss>, StoreError> {
    let rows = client
        .query(
            &format!(
                "SELECT e.evidence_class::text, e.angular_coverage_deg, e.ellipse_major_m, e.ellipse_minor_m, e.ellipse_azimuth_deg, e.ellipse_scale,
                   ST_Y(e.point), ST_X(e.point), l.latitude, l.longitude
                 FROM observations.site_estimates e
                 JOIN observations.site_links k ON k.observed_site_id = e.observed_site_id AND k.kind = 'matched'
                 JOIN public.stations st ON st.id = k.station_id
                 JOIN public.locations l ON l.id = st.location_id
                 WHERE e.algorithm_version = $2 AND e.alternative_point IS NULL AND e.ellipse_minor_m > 0 AND st.id % 2 = $1 AND {GROUND_TRUTH}"
            ),
            &[&half.parity(), &ALGORITHM_VERSION],
        )
        .await?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            let class = EvidenceClass::of_label(row.get(0))?;
            let scale = f64::from(row.get::<_, f32>(5));
            let nominal_m = |published_m: i32| f64::from(published_m) / scale;
            let estimated_at = Point::new(row.get(6), row.get(7));
            let error_m = LocalPlane::around(estimated_at).to_plane(Point::new(row.get(8), row.get(9)));
            Some(EllipseMiss {
                class,
                is_surrounded: is_surrounded(row.get(1)),
                mahalanobis_squared: mahalanobis_squared(error_m, nominal_m(row.get(2)), nominal_m(row.get(3)), f64::from(row.get::<_, i16>(4))),
            })
        })
        .collect())
}

async fn snap_cases(client: &impl GenericClient, half: Half) -> Result<Vec<SnapCase>, StoreError> {
    let rows = client
        .query(
            &format!(
                "SELECT t.observed_site_id, t.difference,
                   CASE WHEN t.location_id IS NOT NULL THEN 'location'
                        WHEN t.official_site_id IS NOT NULL AND EXISTS (
                          SELECT 1 FROM observations.site_official_links n WHERE n.observed_site_id = t.observed_site_id AND n.official_site_id = t.official_site_id
                        ) THEN 'officialSiteByIdentity'
                        WHEN t.official_site_id IS NOT NULL THEN 'officialSite'
                        WHEN t.other_site_id IS NOT NULL THEN 'observedSite'
                        ELSE 'candidate' END,
                   CASE WHEN t.location_id IS NOT NULL THEN EXISTS (SELECT 1 FROM public.stations s2 WHERE s2.location_id = t.location_id AND s2.operator_id = p.operator_id)
                        WHEN t.official_site_id IS NOT NULL THEN EXISTS (SELECT 1 FROM official.sites os WHERE os.id = t.official_site_id AND os.operator_id = p.operator_id)
                        ELSE false END,
                   CASE WHEN t.location_id IS NOT NULL THEN t.location_id = st.location_id
                        WHEN t.official_site_id IS NOT NULL THEN EXISTS (
                          SELECT 1 FROM public.stations_permits sp JOIN official.permits op ON op.id = sp.permit_id
                          WHERE sp.station_id = st.id AND op.official_site_id = t.official_site_id
                        ) OR EXISTS (
                          SELECT 1 FROM official.sites os JOIN official.locations ol ON ol.id = os.location_id
                          WHERE os.id = t.official_site_id AND ST_DistanceSphere(ol.point, l.point) <= $3
                        )
                        WHEN t.other_site_id IS NOT NULL THEN EXISTS (
                          SELECT 1 FROM observations.site_links k2 JOIN public.stations s3 ON s3.id = k2.station_id
                          WHERE k2.observed_site_id = t.other_site_id AND k2.kind = 'matched' AND s3.location_id = st.location_id
                        )
                        ELSE EXISTS (SELECT 1 FROM observations.candidates c WHERE c.id = t.candidate_id AND ST_DistanceSphere(c.point, l.point) <= $3) END,
                   t.location_id IS NOT NULL AND t.location_id = st.location_id
                     AND NOT EXISTS (SELECT 1 FROM public.stations s4 WHERE s4.location_id = st.location_id AND s4.operator_id IS DISTINCT FROM st.operator_id)
                 FROM observations.snap_tests t
                 JOIN observations.site_links k ON k.observed_site_id = t.observed_site_id AND k.kind = 'matched'
                 JOIN observations.observed_sites tested ON tested.id = t.observed_site_id
                 LEFT JOIN {REPORTED_CODES} p ON p.reported_code = tested.plmn
                 JOIN public.stations st ON st.id = k.station_id
                 JOIN public.locations l ON l.id = st.location_id
                 WHERE t.algorithm_version = $2 AND st.id % 2 = $1 AND {GROUND_TRUTH}
                 ORDER BY 1, 2"
            ),
            &[&half.parity(), &ALGORITHM_VERSION, &RIGHT_WITHIN_M],
        )
        .await?;
    let mut cases: BTreeMap<i32, SnapCase> = BTreeMap::new();
    for row in &rows {
        let is_left_out: bool = row.get(5);
        if is_left_out {
            continue;
        }
        let Some(slot) = SnapKind::of_label(row.get(2)).and_then(|kind| kind_slot(kind, row.get(3))) else {
            continue;
        };
        let case = cases.entry(row.get(0)).or_insert_with(|| SnapCase { tested: Vec::new(), right: None });
        if row.get::<_, bool>(4) && case.right.is_none() {
            case.right = Some(case.tested.len());
        }
        case.tested.push((slot, f64::from(row.get::<_, f32>(1))));
    }
    Ok(cases.into_values().collect())
}

pub async fn recalibrate(database: &Database) -> Result<i32, StoreError> {
    let mut client = database.pool.get().await?;
    let half = latest_half(&**client).await?.map_or(Half::Even, Half::other);
    let stations = ground_truth(&**client, half).await?;
    let rows = timing_advance_rows(&client, half, &stations).await?;
    let fits = rows.fits();
    let sources: BTreeMap<i16, String> =
        client.query("SELECT id, source::text FROM observations.ta_groups", &[]).await?.iter().map(|row| (row.get(0), row.get(1))).collect();
    let level_models = fit_level_models(&client, half, &stations).await?;
    let models = model_samples(&**client, half).await?;
    let ellipse_scales = fit_ellipse_scales(&ellipse_misses(&**client, half).await?);
    let cases = snap_cases(&**client, half).await?;

    let transaction = client.transaction().await?;
    let run_id: i32 = transaction
        .query_one("INSERT INTO observations.calibration_runs (station_half) VALUES ($1::text::station_half) RETURNING id", &[&half.label()])
        .await?
        .get(0);
    let in_use = fits_in_use(&fits, window_fits(&*transaction).await?);
    let error_models = rows.error_models(&in_use, &sources);
    let splits = splits_of(models, &in_use);
    for (&(group, technology), fit) in &fits {
        let (row_count, station_count) = rows.counts_of(group, technology);
        transaction
            .execute(
                "INSERT INTO observations.ta_calibrations (calibration_run_id, ta_group_id, rat, scale, offset_m, row_count, station_count)
                 VALUES ($1, $2, $3::text::rat, $4, $5, $6, $7)",
                &[&run_id, &group, &rat_of(technology), &(fit.scale as f32), &(fit.offset_m as f32), &row_count, &station_count],
            )
            .await?;
    }
    for (group, technology, area_class, model, weight) in &error_models {
        transaction
            .execute(
                "INSERT INTO observations.error_models (calibration_run_id, ta_group_id, rat, area_class, sigma_m, tail_mean_m, outlier_share, row_count)
                 VALUES ($1, $2, $3::text::rat, $4::text::area_class, $5, $6, $7, $8)",
                &[
                    &run_id,
                    group,
                    &rat_of(*technology),
                    &area_class.label(),
                    &(model.sigma_m as f32),
                    &(model.tail_mean_m as f32),
                    &(model.outlier_share as f32),
                    &(weight.round() as i32),
                ],
            )
            .await?;
    }
    write_level_models(&transaction, run_id, &level_models).await?;
    for ((class, surrounded), (scale, sites)) in &ellipse_scales {
        transaction
            .execute(
                "INSERT INTO observations.ellipse_scales (calibration_run_id, evidence_class, is_surrounded, scale, site_count)
                 VALUES ($1, $2::text::evidence_class, $3, $4, $5)",
                &[&run_id, &class.label(), surrounded, &(*scale as f32), &(*sites as i32)],
            )
            .await?;
    }
    if !cases.is_empty() {
        write_snap_priors(&transaction, run_id, &fit_snap_priors(&cases, SLOTS)).await?;
    }
    give_models_their_groups(&transaction, &splits).await?;
    transaction.commit().await?;
    Ok(run_id)
}

async fn write_snap_priors(transaction: &Transaction<'_>, run_id: i32, priors: &[f64]) -> Result<(), StoreError> {
    for kind in SnapKind::ALL {
        for carries_operator in [false, true] {
            let prior = kind_slot(kind, carries_operator).and_then(|slot| priors.get(slot).copied()).unwrap_or(1.0);
            transaction
                .execute(
                    "INSERT INTO observations.snap_priors (calibration_run_id, kind, same_operator, prior) VALUES ($1, $2::text::snap_candidate_kind, $3, $4)",
                    &[&run_id, &kind.label(), &carries_operator, &(prior as f32)],
                )
                .await?;
        }
    }
    Ok(())
}

async fn give_models_their_groups(transaction: &Transaction<'_>, splits: &[ModelSplit]) -> Result<(), StoreError> {
    for split in splits {
        let created = transaction
            .execute(
                "INSERT INTO observations.ta_groups (source, device_model_id) VALUES ($1::text::reader_source, $2)
                 ON CONFLICT (source, device_model_id) DO NOTHING",
                &[&split.source, &split.device_model_id],
            )
            .await?;
        if created > 0 {
            transaction
                .execute(
                    "INSERT INTO observations.engine_runs (kind, params) VALUES ('refold', jsonb_build_object('deviceModelId', $1::int))",
                    &[&split.device_model_id],
                )
                .await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_estimate::timing_advance::{GSM_STEP_M, LTE_STEP_M};

    fn round_trip_rows(stations: i32, group: i16) -> TimingAdvanceRows {
        let mut rows = TimingAdvanceRows::default();
        for station_id in 0..stations {
            for distance in (1..=30).map(|step| f64::from(step) * 100.0) {
                let steps = (2.0 * slant_m(distance, 0.0) / LTE_STEP_M).round() as i16;
                rows.add(TaRow {
                    ta_group_id: group,
                    technology: Technology::Lte,
                    station_id,
                    area_class: AreaClass::Town,
                    distance_m: distance,
                    steps,
                    samples: 10.0,
                });
            }
        }
        rows
    }

    #[test]
    fn our_stations_give_a_round_trip_group_its_scale_of_two() {
        let rows = round_trip_rows(25, 4);
        let fit = rows.fits()[&(4, Technology::Lte)];
        assert!((fit.scale - 2.0).abs() < 0.05 && fit.offset_m.abs() < 40.0, "{fit:?}");
        let calibration = fit.calibration(LTE_STEP_M);
        assert!((calibration.distance_m(26) - slant_m(1_000.0, 0.0)).abs() < 50.0);
        assert_eq!(rows.counts_of(4, Technology::Lte), (25 * 30 * 10, 25));
    }

    #[test]
    fn a_group_seen_at_too_few_stations_keeps_the_3gpp_step() {
        assert!(round_trip_rows(10, 4).fits().is_empty(), "3,000 rows but 10 stations");
    }

    #[test]
    fn a_group_short_of_its_threshold_tonight_gets_its_error_model_under_its_fit_from_the_window() {
        let rows = round_trip_rows(10, 4);
        let sources = BTreeMap::from([(4, "api".to_owned())]);
        let error_model = |window: BTreeMap<(i16, Technology), TaFit>| {
            let models = rows.error_models(&fits_in_use(&rows.fits(), window), &sources);
            let [(4, Technology::Lte, AreaClass::Town, model, _)] = models[..] else { panic!("one LTE model: {models:?}") };
            model
        };
        let under_the_older_fit = error_model(BTreeMap::from([((4, Technology::Lte), TaFit { scale: 2.0, offset_m: 0.0 })]));
        let at_scale_one = error_model(BTreeMap::new());
        assert!(under_the_older_fit.sigma_m < 50.0, "the round trip halved: {under_the_older_fit:?}");
        assert!(at_scale_one.sigma_m > 500.0, "the round trip read as distance: {at_scale_one:?}");
    }

    #[test]
    fn tonights_fit_of_a_group_comes_before_its_fit_from_the_window() {
        let rows = round_trip_rows(25, 4);
        let window = BTreeMap::from([((4, Technology::Lte), TaFit::UNCALIBRATED), ((5, Technology::Lte), TaFit { scale: 3.0, offset_m: 0.0 })]);
        let in_use = fits_in_use(&rows.fits(), window);
        assert!((in_use[&(4, Technology::Lte)].scale - 2.0).abs() < 0.05, "{in_use:?}");
        assert_eq!(in_use[&(5, Technology::Lte)].scale, 3.0, "a group not fitted tonight keeps its fit from the window");
    }

    #[test]
    fn a_model_that_matches_its_groups_fit_from_the_window_is_not_split_on_a_night_its_group_has_no_fit() {
        let samples: Vec<TaSample> =
            (1..=30).map(|step| f64::from(step) * 100.0).map(|true_m| TaSample { measured_m: 2.0 * true_m, true_m, weight: 20.0 }).collect();
        let models = || -> ModelSamples { BTreeMap::from([((4, "api".to_owned(), Technology::Lte, 77), (samples.clone(), (0..12).collect()))]) };
        let window = BTreeMap::from([((4, Technology::Lte), TaFit { scale: 2.0, offset_m: 0.0 })]);

        assert!(splits_of(models(), &fits_in_use(&BTreeMap::new(), window)).is_empty(), "the model reads as its group does");
        let at_scale_one = splits_of(models(), &fits_in_use(&BTreeMap::new(), BTreeMap::new()));
        let split_models: Vec<i32> = at_scale_one.iter().map(|split| split.device_model_id).collect();
        assert_eq!(split_models, [77], "without any fit of its group the model's round trip stands apart");
    }

    #[test]
    fn nr_timing_advance_from_android_gets_no_error_model_without_a_fit() {
        let mut rows = TimingAdvanceRows::default();
        for distance in (1..=600).map(f64::from) {
            rows.add(TaRow {
                ta_group_id: 9,
                technology: Technology::Nr,
                station_id: 1,
                area_class: AreaClass::Town,
                distance_m: distance * 5.0,
                steps: 1,
                samples: 5.0,
            });
        }
        let sources = BTreeMap::from([(9, "api".to_owned())]);
        assert!(rows.fits().is_empty());
        assert!(rows.error_models(&BTreeMap::new(), &sources).is_empty());
    }

    #[test]
    fn gsm_timing_advance_from_android_gets_an_error_model_of_its_3gpp_steps_without_a_fit() {
        let mut rows = TimingAdvanceRows::default();
        for distance_m in (1..=600).map(|step| f64::from(step) * 5.0) {
            let steps = (slant_m(distance_m, 0.0) / GSM_STEP_M).round() as i16;
            rows.add(TaRow {
                ta_group_id: 9,
                technology: Technology::Gsm,
                station_id: 1,
                area_class: AreaClass::Town,
                distance_m,
                steps,
                samples: 5.0,
            });
        }
        let sources = BTreeMap::from([(9, "api".to_owned())]);
        assert!(rows.fits().is_empty(), "one station is too few for a fit");
        let models = rows.error_models(&BTreeMap::new(), &sources);
        let [(_, Technology::Gsm, AreaClass::Town, model, _)] = models[..] else { panic!("one GSM model: {models:?}") };
        let rounding_m = GSM_STEP_M / 12_f64.sqrt();
        assert!((model.sigma_m - rounding_m).abs() < 0.25 * rounding_m, "{model:?}");
    }
}
