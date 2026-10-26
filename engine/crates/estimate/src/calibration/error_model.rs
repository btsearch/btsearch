use crate::error_model::ErrorModel;
use crate::timing_advance::shortest_plausible_residual_m;

const LEAST_ERROR_MODEL_SAMPLES: f64 = 500.0;
const GROSS_BEYOND_PLAUSIBLE_M: f64 = 200.0;
const GROSS_LONG_M: f64 = 3_000.0;
const LEAST_SIGMA_M: f64 = 5.0;
const LEAST_TAIL_M: f64 = 5.0;
const MOST_TAIL_M: f64 = 1_000.0;
const LEAST_OUTLIER_SHARE: f64 = 0.001;
const MOST_OUTLIER_SHARE: f64 = 0.5;

pub fn fit_error_model(residuals: &[(f64, f64)], step_m: f64) -> Option<ErrorModel> {
    let gross_short_m = shortest_plausible_residual_m(step_m) - GROSS_BEYOND_PLAUSIBLE_M;
    let total: f64 = residuals.iter().map(|(_, weight)| weight).sum();
    let core: Vec<(f64, f64)> = residuals.iter().copied().filter(|&(residual, _)| (gross_short_m..=GROSS_LONG_M).contains(&residual)).collect();
    let core_weight: f64 = core.iter().map(|(_, weight)| weight).sum();
    if total < LEAST_ERROR_MODEL_SAMPLES || core_weight <= 0.0 {
        return None;
    }
    let mean = core.iter().map(|(residual, weight)| residual * weight).sum::<f64>() / core_weight;
    let moment = |power: i32| core.iter().map(|(residual, weight)| weight * (residual - mean).powi(power)).sum::<f64>() / core_weight;
    let tail_mean_m = (moment(3).max(0.0) / 2.0).cbrt().clamp(LEAST_TAIL_M, MOST_TAIL_M);
    let sigma_m = (moment(2) - tail_mean_m.powi(2)).max(LEAST_SIGMA_M.powi(2)).sqrt();
    let outlier_share = (1.0 - core_weight / total).clamp(LEAST_OUTLIER_SHARE, MOST_OUTLIER_SHARE);
    Some(ErrorModel { sigma_m, tail_mean_m, outlier_share })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timing_advance::{GSM_STEP_M, LTE_STEP_M, NR_MODEM_STEP_M};

    #[test]
    fn the_error_model_follows_the_spread_and_the_tail() {
        let residuals: Vec<(f64, f64)> =
            (0..2_000).map(|index| (f64::from(index % 200) - 60.0, 1.0)).chain((0..40).map(|_| (-4_000.0, 1.0))).collect();
        let model = fit_error_model(&residuals, LTE_STEP_M).expect("a model");
        assert!((model.outlier_share - 40.0 / 2_040.0).abs() < 1e-9);
        assert!(model.sigma_m > 20.0 && model.sigma_m < 70.0, "{model:?}");
        assert_eq!(fit_error_model(&residuals[..100], LTE_STEP_M), None, "too few rows");
    }

    #[test]
    fn a_gsm_reading_rounded_down_and_one_symbol_early_is_gross_only_by_the_lte_and_nr_limit() {
        let rounded_down_and_one_symbol_early = -1.4 * GSM_STEP_M;
        let residuals: Vec<(f64, f64)> =
            (0..2_000).map(|index| (f64::from(index % 200) - 60.0, 1.0)).chain((0..40).map(|_| (rounded_down_and_one_symbol_early, 1.0))).collect();
        for step_m in [LTE_STEP_M, NR_MODEM_STEP_M] {
            let model = fit_error_model(&residuals, step_m).expect("a model");
            assert!((model.outlier_share - 40.0 / 2_040.0).abs() < 1e-9, "{model:?}");
        }
        let gsm = fit_error_model(&residuals, GSM_STEP_M).expect("a model");
        assert_eq!(gsm.outlier_share, LEAST_OUTLIER_SHARE, "{gsm:?}");
    }
}
