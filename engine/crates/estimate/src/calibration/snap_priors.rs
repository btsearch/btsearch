const PRIOR_ROUNDS: usize = 200;
const PRIOR_PULL: f64 = 1.0;
const MOST_LOG_PRIOR: f64 = 5.0;
const MOST_PRIOR_STEP: f64 = 1.0;

#[derive(Debug, Clone, PartialEq)]
pub struct SnapCase {
    pub tested: Vec<(usize, f64)>,
    pub right: Option<usize>,
}

pub fn fit_snap_priors(cases: &[SnapCase], kinds: usize) -> Vec<f64> {
    let mut log_priors = vec![0.0; kinds];
    for _ in 0..PRIOR_ROUNDS {
        let mut gradients: Vec<f64> = log_priors.iter().map(|log_prior| -PRIOR_PULL * log_prior).collect();
        let mut curvatures = vec![PRIOR_PULL; kinds];
        for case in cases {
            let weights: Vec<f64> = case
                .tested
                .iter()
                .map(|&(kind, difference)| (-difference + log_priors[kind]).exp())
                .collect();
            let total = 1.0 + weights.iter().sum::<f64>();
            let mut share_of_kind = vec![0.0; kinds];
            for (&(kind, _), weight) in case.tested.iter().zip(&weights) {
                share_of_kind[kind] += weight / total;
            }
            if let Some(right) = case.right.and_then(|index| case.tested.get(index)) {
                gradients[right.0] += 1.0;
            }
            for ((gradient, curvature), &share) in gradients.iter_mut().zip(&mut curvatures).zip(&share_of_kind) {
                *gradient -= share;
                *curvature += share * (1.0 - share);
            }
        }
        for ((log_prior, &gradient), &curvature) in log_priors.iter_mut().zip(&gradients).zip(&curvatures) {
            let step = (gradient / curvature).clamp(-MOST_PRIOR_STEP, MOST_PRIOR_STEP);
            *log_prior = (*log_prior + step).clamp(-MOST_LOG_PRIOR, MOST_LOG_PRIOR);
        }
    }
    log_priors.into_iter().map(f64::exp).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_kind_that_is_always_right_earns_a_larger_prior() {
        let cases: Vec<SnapCase> = (0..200)
            .map(|_| SnapCase {
                tested: vec![(0, 0.5), (1, 0.5)],
                right: Some(0),
            })
            .collect();
        let priors = fit_snap_priors(&cases, 2);
        assert!(priors[0] > 3.0 && priors[1] < 1.0, "{priors:?}");
    }
}
