const FULL_WEIGHT_ACCURACY_METERS: f64 = 10.0;
const LOWEST_ACCURACY_FACTOR: f64 = 0.2;
const FULL_WEIGHT_SPEED: f64 = 15.0;
const FAST_SPEED: f64 = 40.0;
const FAST_FACTOR: f64 = 0.5;
const FASTER_FACTOR: f64 = 0.3;

pub fn reading_weight_milli(device_weight_milli: i64, accuracy_meters: f64, speed_meters_per_second: f64) -> i64 {
    let weight = device_weight_milli as f64 * accuracy_factor(accuracy_meters) * speed_factor(speed_meters_per_second);
    (weight.round() as i64).max(1)
}

fn accuracy_factor(accuracy_meters: f64) -> f64 {
    if accuracy_meters <= FULL_WEIGHT_ACCURACY_METERS {
        1.0
    } else {
        (FULL_WEIGHT_ACCURACY_METERS / accuracy_meters).max(LOWEST_ACCURACY_FACTOR)
    }
}

fn speed_factor(speed_meters_per_second: f64) -> f64 {
    if speed_meters_per_second <= FULL_WEIGHT_SPEED {
        1.0
    } else if speed_meters_per_second <= FAST_SPEED {
        1.0 - (1.0 - FAST_FACTOR) * (speed_meters_per_second - FULL_WEIGHT_SPEED) / (FAST_SPEED - FULL_WEIGHT_SPEED)
    } else {
        FASTER_FACTOR
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weights_fall_with_accuracy_and_speed() {
        assert_eq!(reading_weight_milli(1_000, 4.0, 13.4), 1_000);
        assert_eq!(reading_weight_milli(1_000, 20.0, 0.0), 500);
        assert_eq!(reading_weight_milli(1_000, 100.0, 0.0), 200);
        assert_eq!(reading_weight_milli(1_000, 5.0, 27.5), 750);
        assert_eq!(reading_weight_milli(1_000, 5.0, 40.0), 500);
        assert_eq!(reading_weight_milli(1_000, 5.0, 41.0), 300);
        assert_eq!(reading_weight_milli(1, 100.0, 50.0), 1, "never less than a thousandth");
    }
}
