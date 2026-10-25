use std::collections::BTreeSet;

use uuid::Uuid;

const TRIPS_THAT_CONFIRM: i32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Confirmation {
    TwoPeople,
    Vouched,
    TwoTrips,
}

impl Confirmation {
    pub fn label(self) -> &'static str {
        match self {
            Self::TwoPeople => "twoPeople",
            Self::Vouched => "vouched",
            Self::TwoTrips => "twoTrips",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Sighting {
    pub user_id: Option<Uuid>,
    pub first_seen_on: i32,
    pub last_seen_on: i32,
    pub trip_count: i32,
    pub is_strong: bool,
    pub is_revoked_or_blocked: bool,
}

impl Sighting {
    fn counting_person(&self) -> Option<Uuid> {
        self.user_id.filter(|_| !self.is_revoked_or_blocked)
    }

    fn is_strong_on_two_trips(&self) -> bool {
        self.is_strong && self.trip_count >= TRIPS_THAT_CONFIRM
    }
}

pub fn confirmation<'a>(sightings: impl IntoIterator<Item = &'a Sighting>, confirming_alone: &BTreeSet<Uuid>) -> Option<Confirmation> {
    let mut people = BTreeSet::new();
    let mut days = BTreeSet::new();
    let mut is_seen_on_two_trips = false;
    for sighting in sightings {
        let Some(user_id) = sighting.counting_person() else {
            continue;
        };
        people.insert(user_id);
        days.extend([sighting.first_seen_on, sighting.last_seen_on]);
        is_seen_on_two_trips |= sighting.is_strong_on_two_trips();
    }
    if people.len() >= 2 && days.len() >= 2 {
        return Some(Confirmation::TwoPeople);
    }
    if people.iter().any(|person| confirming_alone.contains(person)) {
        return Some(Confirmation::Vouched);
    }
    is_seen_on_two_trips.then_some(Confirmation::TwoTrips)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn person(id: u128) -> Uuid {
        Uuid::from_u128(id)
    }

    fn seen(user: u128, first: i32, last: i32) -> Sighting {
        Sighting {
            user_id: Some(person(user)),
            first_seen_on: first,
            last_seen_on: last,
            trip_count: 1,
            is_strong: false,
            is_revoked_or_blocked: false,
        }
    }

    fn strong_phone(user: u128, trip_count: i32) -> Sighting {
        Sighting { trip_count, is_strong: true, ..seen(user, 100, 130) }
    }

    fn shut_out(sighting: Sighting) -> Sighting {
        Sighting { is_revoked_or_blocked: true, ..sighting }
    }

    #[test]
    fn two_people_on_two_days_confirm() {
        assert_eq!(confirmation(&[seen(1, 100, 100), seen(2, 101, 101)], &BTreeSet::new()), Some(Confirmation::TwoPeople));
        assert_eq!(confirmation(&[seen(1, 100, 104), seen(2, 100, 100)], &BTreeSet::new()), Some(Confirmation::TwoPeople));
    }

    #[test]
    fn two_accounts_in_one_car_on_one_day_do_not() {
        assert_eq!(confirmation(&[seen(1, 100, 100), seen(2, 100, 100)], &BTreeSet::new()), None);
    }

    #[test]
    fn one_person_on_many_days_does_not() {
        assert_eq!(confirmation(&[seen(1, 100, 100), seen(1, 101, 130)], &BTreeSet::new()), None);
    }

    #[test]
    fn a_vouched_person_confirms_alone_only_with_the_switch_on() {
        let alone = [seen(7, 100, 100)];
        assert_eq!(confirmation(&alone, &BTreeSet::from([person(7)])), Some(Confirmation::Vouched));
        assert_eq!(confirmation(&alone, &BTreeSet::new()), None);
    }

    #[test]
    fn a_device_without_a_person_counts_for_nobody() {
        let detached = Sighting { user_id: None, ..seen(0, 99, 99) };
        assert_eq!(confirmation(&[seen(1, 100, 100), detached], &BTreeSet::new()), None);
        assert_eq!(confirmation(&[Sighting { user_id: None, ..strong_phone(0, 2) }], &BTreeSet::new()), None);
    }

    #[test]
    fn a_strong_phone_that_saw_the_cell_on_two_trips_confirms() {
        assert_eq!(confirmation(&[strong_phone(1, 2)], &BTreeSet::new()), Some(Confirmation::TwoTrips));
    }

    #[test]
    fn a_strong_phone_on_one_trip_does_not() {
        assert_eq!(confirmation(&[strong_phone(1, 1)], &BTreeSet::new()), None);
    }

    #[test]
    fn a_hardware_tier_phone_on_two_trips_does_not() {
        let rooted = Sighting { is_strong: false, ..strong_phone(1, 2) };
        assert_eq!(confirmation(&[rooted], &BTreeSet::new()), None);
    }

    #[test]
    fn two_phones_of_one_person_on_one_trip_each_do_not() {
        assert_eq!(confirmation(&[strong_phone(1, 1), strong_phone(1, 1)], &BTreeSet::new()), None);
        let rooted = Sighting { is_strong: false, ..strong_phone(1, 1) };
        assert_eq!(confirmation(&[strong_phone(1, 1), rooted], &BTreeSet::new()), None);
    }

    #[test]
    fn a_revoked_phone_or_a_blocked_person_never_counts() {
        assert_eq!(confirmation(&[shut_out(strong_phone(1, 2))], &BTreeSet::new()), None);
        assert_eq!(confirmation(&[seen(1, 100, 100), shut_out(seen(2, 101, 101))], &BTreeSet::new()), None, "a blocked second person");
        assert_eq!(confirmation(&[shut_out(seen(7, 100, 100))], &BTreeSet::from([person(7)])), None, "a vouched person's revoked phone");
    }

    #[test]
    fn a_shut_out_phone_does_not_hide_another_phone_of_the_person() {
        let sightings = [shut_out(seen(2, 101, 101)), seen(2, 102, 102), seen(1, 100, 100)];
        assert_eq!(confirmation(&sightings, &BTreeSet::new()), Some(Confirmation::TwoPeople));
    }
}
