use std::collections::BTreeMap;

use crate::confidence::{CHI_SQUARED_95_TWO_DIMENSIONS, CONFIDENCE};
use crate::input::EvidenceClass;
use crate::statistics::weighted_quantile;

const LEAST_SCALE_SITES: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EllipseMiss {
    pub class: EvidenceClass,
    pub is_surrounded: bool,
    pub mahalanobis_squared: f64,
}

fn ellipse_scale(mahalanobis_squared: Vec<f64>) -> Option<f64> {
    let quantile = weighted_quantile(mahalanobis_squared.into_iter().map(|squared| (squared, 1.0)).collect(), CONFIDENCE)?;
    (quantile > 0.0).then(|| (quantile / CHI_SQUARED_95_TWO_DIMENSIONS).sqrt())
}

pub fn fit_ellipse_scales(misses: &[EllipseMiss]) -> BTreeMap<(EvidenceClass, bool), (f64, usize)> {
    if misses.len() < LEAST_SCALE_SITES {
        return BTreeMap::new();
    }
    let Some(overall) = ellipse_scale(misses.iter().map(|miss| miss.mahalanobis_squared).collect()) else {
        return BTreeMap::new();
    };
    let mut groups: BTreeMap<(EvidenceClass, bool), Vec<f64>> =
        EvidenceClass::ALL.into_iter().flat_map(|class| [false, true].map(|is_surrounded| ((class, is_surrounded), Vec::new()))).collect();
    for miss in misses {
        groups.entry((miss.class, miss.is_surrounded)).or_default().push(miss.mahalanobis_squared);
    }
    groups
        .into_iter()
        .map(|(group, squared)| {
            let site_count = squared.len();
            let own = if site_count >= LEAST_SCALE_SITES { ellipse_scale(squared) } else { None };
            (group, (own.unwrap_or(overall), site_count))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::confidence::mahalanobis_squared;

    struct Nominal {
        major_m: f64,
        minor_m: f64,
        azimuth_deg: f64,
    }

    fn errors_of(scale: f64, count: usize, nominal: &Nominal) -> Vec<(f64, f64)> {
        let golden_angle = std::f64::consts::PI * (3.0 - 5f64.sqrt());
        let (sin, cos) = nominal.azimuth_deg.to_radians().sin_cos();
        (0..count)
            .map(|index| {
                let radius = (-2.0 * (1.0 - (index as f64 + 0.5) / count as f64).ln()).sqrt();
                let angle = index as f64 * golden_angle;
                let along_m = scale * radius * angle.cos() * nominal.major_m / CHI_SQUARED_95_TWO_DIMENSIONS.sqrt();
                let across_m = scale * radius * angle.sin() * nominal.minor_m / CHI_SQUARED_95_TWO_DIMENSIONS.sqrt();
                (along_m * sin + across_m * cos, along_m * cos - across_m * sin)
            })
            .collect()
    }

    fn misses_of(class: EvidenceClass, is_surrounded: bool, errors: &[(f64, f64)], nominal: &Nominal) -> Vec<EllipseMiss> {
        errors
            .iter()
            .map(|&error| EllipseMiss {
                class,
                is_surrounded,
                mahalanobis_squared: mahalanobis_squared(error, nominal.major_m, nominal.minor_m, nominal.azimuth_deg),
            })
            .collect()
    }

    #[test]
    fn errors_half_as_large_again_as_the_ellipse_give_a_scale_of_one_and_a_half_and_a_small_group_takes_the_overall_scale() {
        let thin = Nominal { major_m: 300.0, minor_m: 60.0, azimuth_deg: 30.0 };
        let round = Nominal { major_m: 500.0, minor_m: 450.0, azimuth_deg: 100.0 };
        let small = Nominal { major_m: 200.0, minor_m: 100.0, azimuth_deg: 75.0 };
        let mut misses = misses_of(EvidenceClass::MuchTaPeople, true, &errors_of(1.5, 400, &thin), &thin);
        misses.extend(misses_of(EvidenceClass::LittleTaOnePerson, false, &errors_of(1.2, 300, &round), &round));
        misses.extend(misses_of(EvidenceClass::CoarseTaPeople, true, &errors_of(3.0, 50, &small), &small));

        let scales = fit_ellipse_scales(&misses);
        let (much, much_sites) = scales[&(EvidenceClass::MuchTaPeople, true)];
        assert!((much - 1.5).abs() < 0.03 && much_sites == 400, "{scales:?}");
        assert!((scales[&(EvidenceClass::LittleTaOnePerson, false)].0 - 1.2).abs() < 0.03, "{scales:?}");

        let pooled: Vec<EllipseMiss> =
            misses.iter().map(|miss| EllipseMiss { class: EvidenceClass::MuchTaPeople, is_surrounded: true, ..*miss }).collect();
        let overall = fit_ellipse_scales(&pooled)[&(EvidenceClass::MuchTaPeople, true)].0;
        assert_eq!(scales[&(EvidenceClass::CoarseTaPeople, true)], (overall, 50), "50 sites are too few for a scale of their own");
        assert_eq!(scales[&(EvidenceClass::LittleTaPeople, true)], (overall, 0), "a group no confirmed site fell in takes the overall scale too");
        assert!(fit_ellipse_scales(&misses[..LEAST_SCALE_SITES - 1]).is_empty(), "too few sites in all leave every group uncalibrated");
    }
}
