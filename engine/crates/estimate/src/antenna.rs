const BEAM_WIDTH_DEG: f64 = 65.0;
const HALF_POWER_DB: f64 = 3.0;
const FRONT_TO_BACK_DB: f64 = 25.0;

pub fn angle_between_deg(a: f64, b: f64) -> f64 {
    let difference = (a - b).rem_euclid(360.0);
    if difference > 180.0 { 360.0 - difference } else { difference }
}

pub fn bearing_deg(east: f64, north: f64) -> f64 {
    east.atan2(north).to_degrees().rem_euclid(360.0)
}

pub fn gain_db(off_axis_deg: f64) -> f64 {
    let half_beam = BEAM_WIDTH_DEG / 2.0;
    -(HALF_POWER_DB * (off_axis_deg / half_beam).powi(2)).min(FRONT_TO_BACK_DB)
}

pub(crate) fn circular_mean_deg(bearings: impl IntoIterator<Item = (f64, f64)>) -> Option<f64> {
    let (east, north) = bearings.into_iter().fold((0.0, 0.0), |(east, north), (bearing, weight)| {
        (east + weight * bearing.to_radians().sin(), north + weight * bearing.to_radians().cos())
    });
    (east != 0.0 || north != 0.0).then(|| bearing_deg(east, north))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pattern_is_3_db_down_at_half_the_beam_and_at_most_25() {
        assert_eq!(gain_db(0.0), 0.0);
        assert!((gain_db(32.5) + 3.0).abs() < 1e-12);
        assert_eq!(gain_db(180.0), -25.0);
    }

    #[test]
    fn angles_wrap_around_north() {
        assert_eq!(angle_between_deg(350.0, 10.0), 20.0);
        assert_eq!(angle_between_deg(10.0, 350.0), 20.0);
        assert_eq!(angle_between_deg(90.0, 270.0), 180.0);
        assert!((bearing_deg(1.0, 0.0) - 90.0).abs() < 1e-12);
        let mean = circular_mean_deg([(350.0, 1.0), (10.0, 1.0)]).expect("a mean");
        assert!(angle_between_deg(mean, 0.0) < 1e-9);
    }
}
