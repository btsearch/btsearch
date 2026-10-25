pub(crate) const CONFIDENCE: f64 = 0.95;
pub(crate) const CHI_SQUARED_95_TWO_DIMENSIONS: f64 = 5.991;
const SURROUNDED_FROM_DEG: i16 = 180;
const AXIS_RATIO_STEP: f64 = 0.05;
const CIRCLE_RADIUS_95_IN_MAJOR_SIGMAS: [f64; 21] = [
    1.9600, 1.9606, 1.9625, 1.9658, 1.9704, 1.9765, 1.9842, 1.9937, 2.0051, 2.0190, 2.0359, 2.0564, 2.0813, 2.1111, 2.1460, 2.1858, 2.2303, 2.2791,
    2.3318, 2.3881, 2.4477,
];

pub fn is_surrounded(angular_coverage_deg: i16) -> bool {
    angular_coverage_deg >= SURROUNDED_FROM_DEG
}

fn circle_radius_95_in_major_sigmas(axis_ratio: f64) -> f64 {
    let position = axis_ratio.clamp(0.0, 1.0) / AXIS_RATIO_STEP;
    let index = (position as usize).min(CIRCLE_RADIUS_95_IN_MAJOR_SIGMAS.len() - 2);
    let fraction = position - index as f64;
    CIRCLE_RADIUS_95_IN_MAJOR_SIGMAS[index] * (1.0 - fraction) + CIRCLE_RADIUS_95_IN_MAJOR_SIGMAS[index + 1] * fraction
}

pub(crate) fn circle_radius_95_m(major_m: f64, minor_m: f64) -> f64 {
    if major_m <= 0.0 {
        return 0.0;
    }
    let major_sigma_m = major_m / CHI_SQUARED_95_TWO_DIMENSIONS.sqrt();
    major_sigma_m * circle_radius_95_in_major_sigmas(minor_m / major_m)
}

pub fn mahalanobis_squared(error_m: (f64, f64), major_m: f64, minor_m: f64, azimuth_deg: f64) -> f64 {
    let (sin, cos) = azimuth_deg.to_radians().sin_cos();
    let along_m = error_m.0 * sin + error_m.1 * cos;
    let across_m = error_m.0 * cos - error_m.1 * sin;
    CHI_SQUARED_95_TWO_DIMENSIONS * ((along_m / major_m).powi(2) + (across_m / minor_m).powi(2))
}

pub fn tempered(cost_difference: f64, ellipse_scale: f64) -> f64 {
    cost_difference / (ellipse_scale * ellipse_scale)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_chi_squared_quantile_is_the_one_of_the_stated_confidence() {
        assert!((CHI_SQUARED_95_TWO_DIMENSIONS + 2.0 * (1.0 - CONFIDENCE).ln()).abs() < 1e-3);
    }

    #[test]
    fn the_circle_holding_95_percent_runs_from_the_normal_quantile_of_a_line_to_the_chi_squared_one_of_a_circle() {
        assert!((circle_radius_95_in_major_sigmas(0.0) - 1.960).abs() < 1e-3);
        assert!((circle_radius_95_in_major_sigmas(1.0) - CHI_SQUARED_95_TWO_DIMENSIONS.sqrt()).abs() < 1e-3);
        let radii: Vec<f64> = (0..=200).map(|step| circle_radius_95_in_major_sigmas(f64::from(step) / 200.0)).collect();
        assert!(radii.windows(2).all(|pair| pair[1] > pair[0]), "a rounder ellipse needs a wider circle");
        assert!((circle_radius_95_m(300.0, 300.0) - 300.0).abs() < 0.1, "a circle is its own radius");
    }

    #[test]
    fn an_error_as_long_as_a_half_axis_lies_on_the_ellipse_whichever_way_it_points() {
        let towards_east = 90.0;
        assert!((mahalanobis_squared((300.0, 0.0), 300.0, 100.0, towards_east) - CHI_SQUARED_95_TWO_DIMENSIONS).abs() < 1e-9);
        assert!((mahalanobis_squared((0.0, -100.0), 300.0, 100.0, towards_east) - CHI_SQUARED_95_TWO_DIMENSIONS).abs() < 1e-9);
        assert!(mahalanobis_squared((0.0, 300.0), 300.0, 100.0, towards_east) > 8.0 * CHI_SQUARED_95_TWO_DIMENSIONS);
    }
}
