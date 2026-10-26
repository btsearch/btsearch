use engine_geo::Point;

use crate::Estimate;
use crate::confidence::tempered;
use crate::group::cost_at;
use crate::input::{Context, Site};

pub const SNAP_THRESHOLD: f64 = 2.0;
const SNAP_MARGIN: f64 = 2.0;
pub const CANDIDATE_REACH: f64 = 1.5;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tested {
    pub difference: f64,
    pub prior: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Snap {
    pub snapped: Option<usize>,
    pub probabilities: Vec<f64>,
}

pub fn difference_at(site: &Site, estimate: &Estimate, context: &Context, point: Point) -> Option<f64> {
    let difference = cost_at(site, context, point, &estimate.cell_parameters())? - estimate.cost;
    Some(tempered(difference, estimate.ellipse_scale))
}

pub fn decide(tested: &[Tested], none_prior: f64) -> Snap {
    let weights: Vec<f64> = tested.iter().map(|test| (-test.difference).exp() * test.prior).collect();
    let total = weights.iter().sum::<f64>() + none_prior;
    let probabilities = weights.iter().map(|weight| if total > 0.0 { weight / total } else { 0.0 }).collect();

    let mut order: Vec<usize> = (0..tested.len()).collect();
    order.sort_by(|&a, &b| tested[a].difference.total_cmp(&tested[b].difference).then(a.cmp(&b)));
    let snapped = order.first().copied().filter(|&best| {
        tested[best].difference <= SNAP_THRESHOLD && order.get(1).is_none_or(|&next| tested[next].difference >= tested[best].difference + SNAP_MARGIN)
    });
    Snap { snapped, probabilities }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tested(difference: f64) -> Tested {
        Tested { difference, prior: 1.0 }
    }

    #[test]
    fn a_candidate_the_measurements_cannot_tell_apart_from_their_best_guess_is_snapped_to() {
        assert_eq!(decide(&[tested(0.4)], 1.0).snapped, Some(0));
        assert_eq!(decide(&[tested(5.0), tested(0.4)], 1.0).snapped, Some(1));
    }

    #[test]
    fn two_candidates_the_measurements_cannot_tell_apart_leave_the_fit_alone() {
        assert_eq!(decide(&[tested(0.4), tested(1.9)], 1.0).snapped, None);
        assert_eq!(decide(&[tested(2.5)], 1.0).snapped, None, "too far from the free fit");
    }

    #[test]
    fn probabilities_share_out_with_the_case_of_none() {
        let snap = decide(&[tested(0.0), tested(0.0)], 1.0);
        assert!(snap.probabilities.iter().all(|probability| (probability - 1.0 / 3.0).abs() < 1e-12));
        let favoured = decide(&[Tested { difference: 0.0, prior: 3.0 }], 1.0);
        assert!((favoured.probabilities[0] - 0.75).abs() < 1e-12);
    }
}
