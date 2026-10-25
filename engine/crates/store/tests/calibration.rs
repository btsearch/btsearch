mod common;

use common::Harness;
use engine_estimate::calibration::AreaClass;
use engine_estimate::error_model::{ErrorModel, ErrorTable};
use engine_estimate::input::Technology;
use engine_estimate::timing_advance::LTE_STEP_M;
use engine_store::calibrated::Calibrated;

async fn add_group(harness: &Harness, modem_family: &str) -> i16 {
    let client = harness.store.database.pool.get().await.expect("a connection");
    client
        .query_one("INSERT INTO observations.ta_groups (source, modem_family) VALUES ('api', $1::text::modem_family) RETURNING id", &[&modem_family])
        .await
        .expect("a timing-advance group")
        .get(0)
}

async fn add_run(harness: &Harness, nights_ago: i32, half: &str) -> i32 {
    let client = harness.store.database.pool.get().await.expect("a connection");
    client
        .query_one(
            "INSERT INTO observations.calibration_runs (run_at, station_half)
             VALUES (now() - make_interval(days => $1), $2::text::station_half) RETURNING id",
            &[&nights_ago, &half],
        )
        .await
        .expect("a calibration run")
        .get(0)
}

async fn add_fit(harness: &Harness, run_id: i32, ta_group_id: i16, scale: f32) {
    let client = harness.store.database.pool.get().await.expect("a connection");
    client
        .execute(
            "INSERT INTO observations.ta_calibrations (calibration_run_id, ta_group_id, rat, scale, offset_m, row_count, station_count)
             VALUES ($1, $2, 'LTE', $3, 0, 2000, 20)",
            &[&run_id, &ta_group_id, &scale],
        )
        .await
        .expect("a timing-advance fit");
}

async fn add_error_model(harness: &Harness, run_id: i32, ta_group_id: i16, sigma_m: f32) {
    let client = harness.store.database.pool.get().await.expect("a connection");
    client
        .execute(
            "INSERT INTO observations.error_models (calibration_run_id, ta_group_id, rat, area_class, sigma_m, tail_mean_m, outlier_share, row_count)
             VALUES ($1, $2, 'LTE', 'town', $3, 20, 0.25, 600)",
            &[&run_id, &ta_group_id, &sigma_m],
        )
        .await
        .expect("an error model");
}

async fn latest(harness: &Harness, of_its_half: bool) -> Calibrated {
    let client = harness.store.database.pool.get().await.expect("a connection");
    let calibrated = if of_its_half { Calibrated::latest_of_its_half(&**client).await } else { Calibrated::latest(&**client).await };
    calibrated.expect("the calibration reads")
}

fn metres_per_step(calibrated: &Calibrated, ta_group_id: i16) -> f64 {
    calibrated.calibration_of(ta_group_id, Technology::Lte, "api").expect("LTE has a step").meters_per_step
}

fn cost_of_100_m(calibrated: &Calibrated, ta_group_id: i16) -> f64 {
    let table = calibrated.error_model_of(ta_group_id, Technology::Lte, AreaClass::Town).expect("LTE has an error model");
    calibrated.context.error_tables[table].cost(100.0)
}

fn cost_of_100_m_with_sigma(sigma_m: f64) -> f64 {
    ErrorTable::new(ErrorModel { sigma_m, tail_mean_m: 20.0, outlier_share: 0.25 }).cost(100.0)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_group_fitted_three_nights_ago_is_used_and_one_fitted_eight_nights_ago_is_not() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let (recent, old) = (add_group(&harness, "qualcomm").await, add_group(&harness, "samsung").await);
    add_fit(&harness, add_run(&harness, 8, "even").await, old, 2.0).await;
    add_fit(&harness, add_run(&harness, 3, "odd").await, recent, 2.0).await;
    let tonight = add_run(&harness, 0, "even").await;

    let calibrated = latest(&harness, false).await;
    assert_eq!(calibrated.run_id, Some(tonight), "an estimate records the newest run");
    assert_eq!(metres_per_step(&calibrated, recent), LTE_STEP_M / 2.0);
    assert_eq!(metres_per_step(&calibrated, old), LTE_STEP_M, "eight nights ago is outside the window");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn of_two_rows_in_the_window_the_newer_wins() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let group = add_group(&harness, "qualcomm").await;
    add_fit(&harness, add_run(&harness, 4, "even").await, group, 2.0).await;
    add_fit(&harness, add_run(&harness, 2, "even").await, group, 3.0).await;
    add_run(&harness, 0, "even").await;

    assert_eq!(metres_per_step(&latest(&harness, false).await, group), LTE_STEP_M / 3.0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_evaluation_takes_no_row_learned_from_the_half_it_scores() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let (scored, unscored) = (add_group(&harness, "qualcomm").await, add_group(&harness, "samsung").await);
    add_fit(&harness, add_run(&harness, 2, "even").await, unscored, 2.0).await;
    add_fit(&harness, add_run(&harness, 1, "odd").await, scored, 2.0).await;
    add_run(&harness, 0, "even").await;

    let estimating = latest(&harness, false).await;
    assert_eq!(metres_per_step(&estimating, scored), LTE_STEP_M / 2.0, "estimates take the fits of both halves");
    let evaluating = latest(&harness, true).await;
    assert_eq!(metres_per_step(&evaluating, unscored), LTE_STEP_M / 2.0);
    assert_eq!(metres_per_step(&evaluating, scored), LTE_STEP_M, "tonight's evaluation scores the odd half");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_error_model_is_used_only_with_the_fit_it_was_fitted_under() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    let group = add_group(&harness, "qualcomm").await;
    let even = add_run(&harness, 2, "even").await;
    add_fit(&harness, even, group, 3.0).await;
    add_error_model(&harness, even, group, 40.0).await;
    let odd = add_run(&harness, 1, "odd").await;
    add_fit(&harness, odd, group, 2.0).await;
    add_error_model(&harness, odd, group, 30.0).await;
    let tonight = add_run(&harness, 0, "even").await;
    add_error_model(&harness, tonight, group, 20.0).await;

    let estimating = latest(&harness, false).await;
    assert_eq!(metres_per_step(&estimating, group), LTE_STEP_M / 2.0);
    assert_eq!(cost_of_100_m(&estimating, group), cost_of_100_m_with_sigma(20.0), "tonight's model was fitted under last night's fit");
    let evaluating = latest(&harness, true).await;
    assert_eq!(metres_per_step(&evaluating, group), LTE_STEP_M / 3.0);
    assert_eq!(cost_of_100_m(&evaluating, group), cost_of_100_m_with_sigma(40.0), "the even half's fit comes with the model fitted under it");
}
