const TABLE_FROM_M: f64 = -3_000.0;
const TABLE_TO_M: f64 = 15_000.0;
const TABLE_STEP_M: f64 = 1.0;
const OUTLIER_RANGE_M: f64 = 15_000.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ErrorModel {
    pub sigma_m: f64,
    pub tail_mean_m: f64,
    pub outlier_share: f64,
}

impl ErrorModel {
    pub(crate) const LTE_AND_NR_DEFAULT: Self = Self { sigma_m: 40.0, tail_mean_m: 80.0, outlier_share: 0.02 };
    pub(crate) const GSM_DEFAULT: Self = Self { sigma_m: 300.0, tail_mean_m: 600.0, outlier_share: 0.02 };

    fn negative_log_likelihood(&self, residual_m: f64) -> f64 {
        let delayed = (1.0 - self.outlier_share).ln() + log_delayed_gaussian(residual_m, self.sigma_m, self.tail_mean_m);
        -log_sum_exp(delayed, self.log_outlier_density())
    }

    fn log_outlier_density(&self) -> f64 {
        (self.outlier_share / OUTLIER_RANGE_M).ln()
    }
}

pub struct ErrorTable {
    costs: Vec<f64>,
    outlier_cost: f64,
}

impl ErrorTable {
    pub fn new(model: ErrorModel) -> Self {
        let count = ((TABLE_TO_M - TABLE_FROM_M) / TABLE_STEP_M) as usize + 1;
        let costs = (0..count).map(|index| model.negative_log_likelihood(TABLE_FROM_M + index as f64 * TABLE_STEP_M)).collect();
        Self { costs, outlier_cost: -model.log_outlier_density() }
    }

    pub fn cost(&self, residual_m: f64) -> f64 {
        let position = (residual_m - TABLE_FROM_M) / TABLE_STEP_M;
        if !(0.0..(self.costs.len() - 1) as f64).contains(&position) {
            return self.outlier_cost;
        }
        let index = position as usize;
        let fraction = position - index as f64;
        self.costs[index] * (1.0 - fraction) + self.costs[index + 1] * fraction
    }
}

fn log_sum_exp(a: f64, b: f64) -> f64 {
    let high = a.max(b);
    high + ((a - high).exp() + (b - high).exp()).ln()
}

fn log_delayed_gaussian(residual_m: f64, sigma_m: f64, tail_mean_m: f64) -> f64 {
    let z = residual_m / sigma_m - sigma_m / tail_mean_m;
    -tail_mean_m.ln() + sigma_m * sigma_m / (2.0 * tail_mean_m * tail_mean_m) - residual_m / tail_mean_m + log_normal_cdf(z)
}

fn log_normal_cdf(z: f64) -> f64 {
    let x = -z / std::f64::consts::SQRT_2;
    if x >= 0.0 { (0.5f64).ln() + log_erfc(x) } else { (1.0 - 0.5 * log_erfc(-x).exp()).ln() }
}

fn log_erfc(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.5 * x);
    let polynomial = -1.265_512_23
        + t * (1.000_023_68
            + t * (0.374_091_96
                + t * (0.096_784_18
                    + t * (-0.186_288_06 + t * (0.278_868_07 + t * (-1.135_203_98 + t * (1.488_515_87 + t * (-0.822_152_23 + t * 0.170_872_77))))))));
    t.ln() - x * x + polynomial
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_error_function_matches_known_values() {
        for (x, erfc) in [(0.0, 1.0), (0.5, 0.479_500_122), (1.0, 0.157_299_207), (2.0, 0.004_677_735), (3.0, 0.000_022_090_5)] {
            assert!((log_erfc(x).exp() - erfc).abs() < 1e-6 * erfc.max(1.0), "erfc({x})");
        }
    }

    #[test]
    fn a_reading_closer_than_possible_costs_more_than_one_as_far_beyond() {
        let model = ErrorModel::LTE_AND_NR_DEFAULT;
        let best = (-200..=400).map(|r| model.negative_log_likelihood(f64::from(r))).fold(f64::INFINITY, f64::min);
        assert!(model.negative_log_likelihood(-150.0) > model.negative_log_likelihood(150.0) + 2.0);
        assert!(model.negative_log_likelihood(0.0) < best + 1.0);
        assert!(model.negative_log_likelihood(-5_000.0) <= -model.log_outlier_density() + 1e-9, "outliers cap the cost");
    }

    #[test]
    fn the_table_follows_the_model() {
        let table = ErrorTable::new(ErrorModel::LTE_AND_NR_DEFAULT);
        for residual in [-2_500.5, -120.25, 0.0, 33.3, 900.0, 14_000.0] {
            assert!((table.cost(residual) - ErrorModel::LTE_AND_NR_DEFAULT.negative_log_likelihood(residual)).abs() < 1e-3, "{residual}");
        }
        assert_eq!(table.cost(-50_000.0), table.cost(80_000.0));
    }
}
