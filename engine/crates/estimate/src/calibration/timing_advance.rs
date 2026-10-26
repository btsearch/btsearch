use crate::statistics::weighted_quantile;
use crate::timing_advance::Calibration;

const SCALE_DIFFERS_BY: f64 = 0.2;
const OFFSET_DIFFERS_BY_M: f64 = 150.0;
const HUBER_LIMIT: f64 = 1.345;
const MAD_TO_SIGMA: f64 = 1.4826;
const LEAST_RESIDUAL_SIGMA_M: f64 = 1.0;
const ROBUST_ROUNDS: usize = 30;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TaSample {
    pub measured_m: f64,
    pub true_m: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TaFit {
    pub scale: f64,
    pub offset_m: f64,
}

impl TaFit {
    pub const UNCALIBRATED: Self = Self { scale: 1.0, offset_m: 0.0 };

    pub fn calibration(self, step_m: f64) -> Calibration {
        Calibration { meters_per_step: step_m / self.scale, offset_m: -self.offset_m / self.scale }
    }

    pub fn differs_from(self, other: Self) -> bool {
        (self.scale - other.scale).abs() > SCALE_DIFFERS_BY || (self.offset_m - other.offset_m).abs() > OFFSET_DIFFERS_BY_M
    }
}

fn weighted_line(samples: &[TaSample], weights: &[f64]) -> Option<TaFit> {
    let total: f64 = weights.iter().sum();
    if total <= 0.0 {
        return None;
    }
    let mean_true_m = samples.iter().zip(weights).map(|(sample, weight)| sample.true_m * weight).sum::<f64>() / total;
    let mean_measured_m = samples.iter().zip(weights).map(|(sample, weight)| sample.measured_m * weight).sum::<f64>() / total;
    let true_spread: f64 = samples.iter().zip(weights).map(|(sample, weight)| weight * (sample.true_m - mean_true_m).powi(2)).sum();
    if true_spread <= 0.0 {
        return None;
    }
    let joint_spread: f64 =
        samples.iter().zip(weights).map(|(sample, weight)| weight * (sample.true_m - mean_true_m) * (sample.measured_m - mean_measured_m)).sum();
    let scale = joint_spread / true_spread;
    (scale > 0.0).then_some(TaFit { scale, offset_m: mean_measured_m - scale * mean_true_m })
}

pub fn fit_timing_advance(samples: &[TaSample]) -> Option<TaFit> {
    let mut weights: Vec<f64> = samples.iter().map(|sample| sample.weight).collect();
    let mut fit = weighted_line(samples, &weights)?;
    for _ in 0..ROBUST_ROUNDS {
        let residuals: Vec<f64> = samples.iter().map(|sample| sample.measured_m - (fit.scale * sample.true_m + fit.offset_m)).collect();
        let sample_weights = samples.iter().map(|sample| sample.weight);
        let centre = weighted_quantile(residuals.iter().copied().zip(sample_weights.clone()).collect(), 0.5)?;
        let deviation = weighted_quantile(residuals.iter().map(|residual| (residual - centre).abs()).zip(sample_weights).collect(), 0.5)?;
        let sigma = (deviation * MAD_TO_SIGMA).max(LEAST_RESIDUAL_SIGMA_M);
        weights = samples
            .iter()
            .zip(&residuals)
            .map(|(sample, residual)| {
                let standardised = (residual / sigma).abs();
                sample.weight * if standardised <= HUBER_LIMIT { 1.0 } else { HUBER_LIMIT / standardised }
            })
            .collect();
        fit = weighted_line(samples, &weights)?;
    }
    Some(fit)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn samples_of(scale: f64, offset_m: f64) -> Vec<TaSample> {
        (1..=400).map(|step| f64::from(step) * 10.0).map(|true_m| TaSample { measured_m: scale * true_m + offset_m, true_m, weight: 10.0 }).collect()
    }

    #[test]
    fn the_fit_finds_the_scale_and_offset_and_ignores_the_odd_reflection() {
        let mut samples = samples_of(2.0, 40.0);
        samples.extend((1..=20).map(|step| TaSample { measured_m: 9_000.0, true_m: f64::from(step) * 100.0, weight: 10.0 }));
        let fit = fit_timing_advance(&samples).expect("a fit");
        assert!((fit.scale - 2.0).abs() < 0.02 && (fit.offset_m - 40.0).abs() < 15.0, "{fit:?}");
        assert!(fit.differs_from(TaFit::UNCALIBRATED));
        let calibration = fit.calibration(78.07);
        assert!((calibration.distance_m(10) - (780.7 - 40.0) / 2.0).abs() < 10.0);
    }

    #[test]
    fn a_fit_needs_more_than_one_distance() {
        let samples = vec![TaSample { measured_m: 500.0, true_m: 400.0, weight: 1.0 }; 10];
        assert_eq!(fit_timing_advance(&samples), None);
    }
}
