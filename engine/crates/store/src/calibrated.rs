use std::collections::BTreeMap;

use engine_estimate::calibration::{AreaClass, LevelModel, TaFit};
use engine_estimate::error_model::{ErrorModel, ErrorTable};
use engine_estimate::input::{Context, EvidenceClass, Technology};
use engine_estimate::timing_advance::Calibration;
use engine_fold::identity::Rat;
use engine_fold::inputs::uncalibrated_step_m;
use engine_geo::Point;
use engine_geo::plane::METERS_PER_DEGREE;
use tokio_postgres::types::ToSql;
use tokio_postgres::{GenericClient, Row};

use crate::StoreError;
use crate::fold_inputs::source_of_label;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum SnapKind {
    Location,
    OfficialSite,
    OfficialSiteByIdentity,
    ObservedSite,
    Candidate,
    None,
}

impl SnapKind {
    pub const ALL: [Self; 6] = [Self::Location, Self::OfficialSite, Self::OfficialSiteByIdentity, Self::ObservedSite, Self::Candidate, Self::None];

    pub fn label(self) -> &'static str {
        match self {
            Self::Location => "location",
            Self::OfficialSite => "officialSite",
            Self::OfficialSiteByIdentity => "officialSiteByIdentity",
            Self::ObservedSite => "observedSite",
            Self::Candidate => "candidate",
            Self::None => "none",
        }
    }

    pub fn of_label(label: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.label() == label)
    }
}

pub struct Calibrated {
    pub run_id: Option<i32>,
    pub context: Context,
    timing_advance: BTreeMap<(i16, Technology), TaFit>,
    error_tables: BTreeMap<(i16, Technology, AreaClass), usize>,
    snap_priors: BTreeMap<(SnapKind, bool), f64>,
}

const AREA_REACH_M: f64 = 2_000.0;
const WINDOW_NIGHTS: i32 = 7;

const IN_WINDOW_OF_RUN: &str = "(earlier.run_at, earlier.id) <= (run.run_at, run.id)
      AND (run.run_at AT TIME ZONE 'UTC')::date - (earlier.run_at AT TIME ZONE 'UTC')::date < $2";
const NEWEST_FITS: &str = "
    newest_fits AS (
      SELECT DISTINCT ON (ta_group_id, rat) * FROM observations.ta_calibrations
      WHERE calibration_run_id = ANY($1::int[]) ORDER BY ta_group_id, rat, array_position($1::int[], calibration_run_id)
    )";
const LEVEL_MODELS: &str = "
    SELECT DISTINCT ON (rat, area_class) rat::text, area_class::text, slope_db_per_decade, scatter_db FROM observations.level_models
    WHERE calibration_run_id = ANY($1::int[]) ORDER BY rat, area_class, array_position($1::int[], calibration_run_id)";
const ELLIPSE_SCALES: &str = "
    SELECT DISTINCT ON (evidence_class, is_surrounded) evidence_class::text, is_surrounded, scale FROM observations.ellipse_scales
    WHERE calibration_run_id = ANY($1::int[]) ORDER BY evidence_class, is_surrounded, array_position($1::int[], calibration_run_id)";
const SNAP_PRIORS: &str = "
    SELECT DISTINCT ON (kind, same_operator) kind::text, same_operator, prior FROM observations.snap_priors
    WHERE calibration_run_id = ANY($1::int[]) ORDER BY kind, same_operator, array_position($1::int[], calibration_run_id)";

pub(crate) fn technology_of(rat: &str) -> Option<Technology> {
    match rat {
        "GSM" => Some(Technology::Gsm),
        "UMTS" => Some(Technology::Umts),
        "LTE" => Some(Technology::Lte),
        "NR" => Some(Technology::Nr),
        _ => None,
    }
}

fn rat_of_technology(technology: Technology) -> Rat {
    match technology {
        Technology::Gsm => Rat::Gsm,
        Technology::Umts => Rat::Umts,
        Technology::Lte => Rat::Lte,
        Technology::Nr => Rat::Nr,
    }
}

pub(crate) fn rat_of(technology: Technology) -> &'static str {
    rat_of_technology(technology).as_database_value()
}

pub(crate) fn uncalibrated_step_of(technology: Technology, source: &str) -> Option<f64> {
    uncalibrated_step_m(rat_of_technology(technology), source_of_label(source).ok()?)
}

fn area_class_of(label: &str) -> Option<AreaClass> {
    AreaClass::ALL.into_iter().find(|class| class.label() == label)
}

async fn window_runs(client: &impl GenericClient, of_its_half_only: bool) -> Result<Option<(i32, Vec<i32>)>, StoreError> {
    let window = client
        .query_opt(
            &format!(
                "SELECT run.id, array_agg(earlier.id ORDER BY earlier.run_at DESC, earlier.id DESC)
                 FROM (SELECT id, run_at, station_half FROM observations.calibration_runs ORDER BY run_at DESC, id DESC LIMIT 1) run
                 JOIN observations.calibration_runs earlier ON {IN_WINDOW_OF_RUN} AND (NOT $1::bool OR earlier.station_half = run.station_half)
                 GROUP BY run.id"
            ),
            &[&of_its_half_only, &WINDOW_NIGHTS],
        )
        .await?;
    Ok(window.map(|row| (row.get(0), row.get(1))))
}

fn ta_calibrations_statement() -> String {
    format!("WITH {NEWEST_FITS} SELECT ta_group_id, rat::text, scale, offset_m FROM newest_fits")
}

fn error_models_statement() -> String {
    format!(
        "WITH {NEWEST_FITS},
         fitted_under AS (
           SELECT DISTINCT ON (run.id, t.ta_group_id, t.rat) run.id AS run_id, t.ta_group_id, t.rat, t.calibration_run_id AS fit_run_id
           FROM observations.calibration_runs run
           JOIN observations.calibration_runs earlier ON {IN_WINDOW_OF_RUN}
           JOIN observations.ta_calibrations t ON t.calibration_run_id = earlier.id
           WHERE run.id = ANY($1::int[])
           ORDER BY run.id, t.ta_group_id, t.rat, earlier.run_at DESC, earlier.id DESC
         )
         SELECT DISTINCT ON (e.ta_group_id, e.rat, e.area_class)
           e.ta_group_id, e.rat::text, e.area_class::text, e.sigma_m, e.tail_mean_m, e.outlier_share
         FROM observations.error_models e
         LEFT JOIN newest_fits f ON f.ta_group_id = e.ta_group_id AND f.rat = e.rat
         LEFT JOIN fitted_under u ON u.run_id = e.calibration_run_id AND u.ta_group_id = e.ta_group_id AND u.rat = e.rat
         WHERE e.calibration_run_id = ANY($1::int[]) AND f.calibration_run_id IS NOT DISTINCT FROM u.fit_run_id
         ORDER BY e.ta_group_id, e.rat, e.area_class, array_position($1::int[], e.calibration_run_id)"
    )
}

fn fits_of(rows: &[Row]) -> BTreeMap<(i16, Technology), TaFit> {
    rows.iter()
        .filter_map(|row| {
            let technology = technology_of(row.get(1))?;
            Some(((row.get::<_, i16>(0), technology), TaFit { scale: f64::from(row.get::<_, f32>(2)), offset_m: f64::from(row.get::<_, f32>(3)) }))
        })
        .collect()
}

pub(crate) async fn window_fits(client: &impl GenericClient) -> Result<BTreeMap<(i16, Technology), TaFit>, StoreError> {
    let Some((_, run_ids)) = window_runs(client, false).await? else {
        return Ok(BTreeMap::new());
    };
    Ok(fits_of(&client.query(&ta_calibrations_statement(), &[&run_ids]).await?))
}

pub(crate) async fn area_classes(client: &impl GenericClient, places: &[(i32, Point)]) -> Result<BTreeMap<i32, AreaClass>, StoreError> {
    let ids: Vec<i32> = places.iter().map(|(id, _)| *id).collect();
    let longitudes: Vec<f64> = places.iter().map(|(_, place)| place.longitude).collect();
    let latitudes: Vec<f64> = places.iter().map(|(_, place)| place.latitude).collect();
    let rows = client
        .query(
            "SELECT q.id, (
               SELECT count(*) FROM public.locations l
               WHERE ST_DWithin(l.point, ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326), $4 / ($5 * cos(radians(q.latitude))))
                 AND ST_DistanceSphere(l.point, ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326)) <= $4
             )
             FROM unnest($1::int[], $2::float8[], $3::float8[]) AS q(id, longitude, latitude)",
            &[&ids, &longitudes, &latitudes, &AREA_REACH_M, &METERS_PER_DEGREE],
        )
        .await?;
    Ok(rows.iter().map(|row| (row.get(0), AreaClass::of(row.get(1)))).collect())
}

impl Calibrated {
    pub(crate) fn uncalibrated() -> Self {
        Self {
            run_id: None,
            context: Context::uncalibrated(),
            timing_advance: BTreeMap::new(),
            error_tables: BTreeMap::new(),
            snap_priors: BTreeMap::new(),
        }
    }

    pub async fn latest(client: &impl GenericClient) -> Result<Self, StoreError> {
        Self::of_window(client, false).await
    }

    pub async fn latest_of_its_half(client: &impl GenericClient) -> Result<Self, StoreError> {
        Self::of_window(client, true).await
    }

    async fn of_window(client: &impl GenericClient, of_its_half_only: bool) -> Result<Self, StoreError> {
        let Some((run_id, run_ids)) = window_runs(client, of_its_half_only).await? else {
            return Ok(Self::uncalibrated());
        };
        let (ta_calibrations, error_models) = (ta_calibrations_statement(), error_models_statement());
        let of_window: [&(dyn ToSql + Sync); 1] = [&run_ids];
        let of_window_and_its_nights: [&(dyn ToSql + Sync); 2] = [&run_ids, &WINDOW_NIGHTS];
        let (ta_rows, error_rows, level_rows, ellipse_rows, prior_rows) = tokio::try_join!(
            client.query(&ta_calibrations, &of_window),
            client.query(&error_models, &of_window_and_its_nights),
            client.query(LEVEL_MODELS, &of_window),
            client.query(ELLIPSE_SCALES, &of_window),
            client.query(SNAP_PRIORS, &of_window),
        )?;
        let mut calibrated = Self { run_id: Some(run_id), timing_advance: fits_of(&ta_rows), ..Self::uncalibrated() };

        for row in &error_rows {
            let (Some(technology), Some(area_class)) = (technology_of(row.get(1)), area_class_of(row.get(2))) else {
                continue;
            };
            let model = ErrorModel {
                sigma_m: f64::from(row.get::<_, f32>(3)),
                tail_mean_m: f64::from(row.get::<_, f32>(4)),
                outlier_share: f64::from(row.get::<_, f32>(5)),
            };
            calibrated.error_tables.insert((row.get(0), technology, area_class), calibrated.context.error_tables.len());
            calibrated.context.error_tables.push(ErrorTable::new(model));
        }

        for row in &level_rows {
            if let (Some(technology), Some(area_class)) = (technology_of(row.get(0)), area_class_of(row.get(1))) {
                let model = LevelModel { slope_db_per_decade: f64::from(row.get::<_, f32>(2)), scatter_db: f64::from(row.get::<_, f32>(3)) };
                calibrated.context.level_models.insert((technology, area_class), model);
            }
        }

        for row in &ellipse_rows {
            if let Some(class) = EvidenceClass::of_label(row.get(0)) {
                calibrated.context.ellipse_scales[class as usize][usize::from(row.get::<_, bool>(1))] = f64::from(row.get::<_, f32>(2));
            }
        }

        for row in &prior_rows {
            if let Some(kind) = SnapKind::of_label(row.get(0)) {
                calibrated.snap_priors.insert((kind, row.get(1)), f64::from(row.get::<_, f32>(2)));
            }
        }
        Ok(calibrated)
    }

    pub fn calibration_of(&self, ta_group_id: i16, technology: Technology, source: &str) -> Option<Calibration> {
        if let Some(fit) = self.timing_advance.get(&(ta_group_id, technology)) {
            return Some(fit.calibration(technology.timing_advance_step_m()?));
        }
        Some(TaFit::UNCALIBRATED.calibration(uncalibrated_step_of(technology, source)?))
    }

    pub fn error_model_of(&self, ta_group_id: i16, technology: Technology, area_class: AreaClass) -> Option<usize> {
        self.error_tables.get(&(ta_group_id, technology, area_class)).copied().or_else(|| Context::uncalibrated_error_table(technology))
    }

    pub(crate) fn snap_prior(&self, kind: SnapKind, carries_operator: bool) -> f64 {
        self.snap_priors.get(&(kind, carries_operator)).copied().unwrap_or(1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_estimate::timing_advance::{GSM_STEP_M, LTE_STEP_M, NR_MODEM_STEP_M};

    #[test]
    fn without_a_calibration_lte_takes_the_3gpp_step_and_nr_from_android_is_left_out() {
        let calibrated = Calibrated::uncalibrated();
        assert_eq!(calibrated.calibration_of(1, Technology::Lte, "api"), Some(Calibration { meters_per_step: LTE_STEP_M, offset_m: 0.0 }));
        assert_eq!(calibrated.calibration_of(2, Technology::Nr, "modemLog"), Some(Calibration { meters_per_step: NR_MODEM_STEP_M, offset_m: 0.0 }));
        assert_eq!(calibrated.calibration_of(3, Technology::Nr, "api"), None);
    }

    #[test]
    fn without_a_calibration_gsm_takes_the_3gpp_step_from_every_reader_and_umts_has_none() {
        let calibrated = Calibrated::uncalibrated();
        let gsm = Calibration { meters_per_step: GSM_STEP_M, offset_m: 0.0 };
        for source in ["api", "modemLog", "modemPoll"] {
            assert_eq!(calibrated.calibration_of(1, Technology::Gsm, source), Some(gsm), "{source}");
            assert_eq!(calibrated.calibration_of(1, Technology::Umts, source), None, "{source}");
        }
        assert_ne!(calibrated.error_model_of(1, Technology::Gsm, AreaClass::Town), calibrated.error_model_of(1, Technology::Lte, AreaClass::Town));
    }

    #[test]
    fn a_fit_of_the_group_replaces_the_step() {
        let mut calibrated = Calibrated::uncalibrated();
        calibrated.timing_advance.insert((3, Technology::Nr), TaFit { scale: 2.0, offset_m: 0.0 });
        let calibration = calibrated.calibration_of(3, Technology::Nr, "api").expect("a fitted group is used");
        assert!((calibration.meters_per_step - NR_MODEM_STEP_M / 2.0).abs() < 1e-12);
    }
}
