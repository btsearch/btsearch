const SPEED_OF_LIGHT_M_PER_S: f64 = 299_792_458.0;
const LTE_BASIC_TIME_UNIT_S: f64 = 1.0 / (15_000.0 * 2_048.0);
const NR_BASIC_TIME_UNIT_S: f64 = 1.0 / (480_000.0 * 4_096.0);
const GSM_SYMBOL_PERIOD_S: f64 = 48.0 / 13.0 / 1_000_000.0;
const LEAST_CLOSER_TOLERANCE_M: f64 = 300.0;
const ROUNDING_ERROR_STEPS: f64 = 0.5;
const PHONE_TOLERANCE_STEPS: f64 = 1.0;

pub const LTE_STEP_M: f64 = SPEED_OF_LIGHT_M_PER_S * 16.0 * LTE_BASIC_TIME_UNIT_S / 2.0;
pub const NR_MODEM_STEP_M: f64 = SPEED_OF_LIGHT_M_PER_S * 16.0 * 64.0 * NR_BASIC_TIME_UNIT_S / 8.0 / 2.0;
pub const GSM_STEP_M: f64 = SPEED_OF_LIGHT_M_PER_S * GSM_SYMBOL_PERIOD_S / 2.0;

pub fn shortest_plausible_residual_m(step_m: f64) -> f64 {
    -(LEAST_CLOSER_TOLERANCE_M.max((ROUNDING_ERROR_STEPS + PHONE_TOLERANCE_STEPS) * step_m))
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Calibration {
    pub meters_per_step: f64,
    pub offset_m: f64,
}

impl Calibration {
    pub fn distance_m(&self, timing_advance: i16) -> f64 {
        self.meters_per_step * f64::from(timing_advance) + self.offset_m
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_steps_are_those_of_3gpp() {
        assert!((LTE_STEP_M - 78.07).abs() < 0.01);
        assert!((NR_MODEM_STEP_M - 9.76).abs() < 0.01);
        assert!((GSM_STEP_M - 553.46).abs() < 0.01);
    }

    #[test]
    fn lte_and_nr_readings_keep_the_margin_and_gsm_readings_may_be_rounded_down_and_one_symbol_early() {
        for step_m in [LTE_STEP_M, NR_MODEM_STEP_M] {
            assert_eq!(shortest_plausible_residual_m(step_m), -LEAST_CLOSER_TOLERANCE_M);
        }
        let shortest_m = shortest_plausible_residual_m(GSM_STEP_M);
        for distance_m in (0..=3_000).map(|tens| f64::from(tens) * 10.0) {
            let rounded_and_one_symbol_early = (distance_m / GSM_STEP_M).round() - 1.0;
            assert!(rounded_and_one_symbol_early * GSM_STEP_M - distance_m >= shortest_m - 1e-9, "{distance_m} m");
        }
        assert!(-2.0 * GSM_STEP_M < shortest_m, "two symbols early is no longer plausible");
    }
}
