use serde::Serialize;

const MILLIS_PER_DAY: i64 = 86_400_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub struct Day(pub i32);

impl Day {
    pub fn of_epoch_millis(millis: i64) -> Self {
        Self(i32::try_from(millis.div_euclid(MILLIS_PER_DAY)).unwrap_or(i32::MAX))
    }

    pub fn first_of_month(self) -> Self {
        let (year, month, _) = civil_from_days(self.0);
        Self(days_from_civil(year, month, 1))
    }

    pub fn civil(self) -> (i32, u32, u32) {
        civil_from_days(self.0)
    }
}

fn civil_from_days(days: i32) -> (i32, u32, u32) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era = (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * shifted_month + 2) / 5 + 1) as u32;
    let month = (if shifted_month < 10 { shifted_month + 3 } else { shifted_month - 9 }) as u32;
    let year = year_of_era + era * 400 + i32::from(month <= 2);
    (year, month, day)
}

fn days_from_civil(year: i32, month: u32, day: u32) -> i32 {
    let year = year - i32::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year.rem_euclid(400);
    let shifted_month = (month as i32 + 9) % 12;
    let day_of_year = (153 * shifted_month + 2) / 5 + day as i32 - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn days_follow_the_civil_calendar() {
        assert_eq!(Day(0).civil(), (1970, 1, 1));
        assert_eq!(Day::of_epoch_millis(1_791_547_200_000).civil(), (2026, 10, 9));
        assert_eq!(Day::of_epoch_millis(-1).civil(), (1969, 12, 31));
        assert_eq!(Day(days_from_civil(2028, 2, 29)).civil(), (2028, 2, 29));
        assert_eq!(Day::of_epoch_millis(1_791_547_200_000).first_of_month().civil(), (2026, 10, 1));
    }
}
