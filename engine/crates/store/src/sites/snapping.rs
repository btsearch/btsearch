use std::collections::{BTreeMap, BTreeSet};

use engine_estimate::input::Site;
use engine_estimate::snap::{CANDIDATE_REACH, Tested, decide, difference_at};
use engine_estimate::{ALGORITHM_VERSION, Estimate};
use engine_geo::Point;
use engine_geo::plane::{METERS_PER_DEGREE, distance_meters};
use tokio_postgres::{GenericClient, Transaction};

use crate::StoreError;
use crate::calibrated::{Calibrated, SnapKind};
use crate::reported_codes::REPORTED_CODES;
use crate::sites::placing::Rules;

const SAME_PLACE_M: f64 = 50.0;
const STANDS_FOR_REACH: f64 = 2.0;

const AROUND: &str = "unnest($1::int[], $2::float8[], $3::float8[], $4::float8[]) AS q(lead, longitude, latitude, reach)";
const NEAR: &str = "ST_SetSRID(ST_MakePoint(q.longitude, q.latitude), 4326), q.reach / ($5 * cos(radians(q.latitude)))";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Target {
    Location(i32),
    OfficialSite(i32),
    OtherSite(i32),
    Candidate(i32),
}

#[derive(Debug, Clone)]
pub struct Shown {
    pub lead: i32,
    pub members: Vec<i32>,
    pub point: Point,
    pub uncertainty_m: i32,
    pub plmn: String,
    pub operator_id: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct NearbyLocation {
    pub id: i32,
    pub point: Point,
    pub carries_operator: bool,
    pub carries_other_operators: bool,
}

#[derive(Debug, Clone)]
pub struct OfficialSite {
    pub id: i32,
    pub point: Point,
    pub is_named: bool,
    pub carries_operator: bool,
}

#[derive(Debug, Clone)]
pub struct OtherSite {
    pub id: i32,
    pub point: Point,
    pub uncertainty_m: i32,
    pub plmn: String,
    pub operator_id: Option<i32>,
}

#[derive(Debug, Clone, Default)]
pub struct Nearby {
    pub locations: Vec<NearbyLocation>,
    pub official_sites: Vec<OfficialSite>,
    pub other_sites: Vec<OtherSite>,
    pub candidates: Vec<(i32, Point)>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Candidate {
    pub target: Target,
    pub point: Point,
    pub kind: SnapKind,
    pub carries_operator: bool,
}

pub(crate) struct SnapRow {
    pub lead: i32,
    pub candidate: Candidate,
    pub difference: f64,
    pub probability: f64,
    pub is_snap: bool,
}

fn is_same_operator(shown: &Shown, plmn: &str, operator_id: Option<i32>) -> bool {
    shown.plmn == plmn || (shown.operator_id.is_some() && shown.operator_id == operator_id)
}

pub fn candidates_for(shown: &Shown, nearby: &Nearby) -> Vec<Candidate> {
    let radius = f64::from(shown.uncertainty_m);
    let within = |point: Point, reach: f64| distance_meters(shown.point, point) <= reach;
    let reach = CANDIDATE_REACH * radius;

    let mut kept: Vec<Candidate> = nearby
        .locations
        .iter()
        .filter(|location| within(location.point, reach))
        .map(|location| Candidate {
            target: Target::Location(location.id),
            point: location.point,
            kind: SnapKind::Location,
            carries_operator: location.carries_operator,
        })
        .collect();
    let mut keep = |candidate: Candidate| {
        if kept.iter().all(|other| distance_meters(other.point, candidate.point) > SAME_PLACE_M) {
            kept.push(candidate);
        }
    };

    let mut official: Vec<&OfficialSite> = nearby.official_sites.iter().filter(|site| within(site.point, reach)).collect();
    official.sort_by_key(|site| (!site.is_named, !site.carries_operator, site.id));
    for site in official {
        let kind = if site.is_named { SnapKind::OfficialSiteByIdentity } else { SnapKind::OfficialSite };
        keep(Candidate { target: Target::OfficialSite(site.id), point: site.point, kind, carries_operator: site.carries_operator });
    }

    let fixed: Vec<Point> =
        nearby.locations.iter().map(|location| location.point).chain(nearby.official_sites.iter().map(|site| site.point)).collect();
    let stands_for_itself = |other: &OtherSite| fixed.iter().all(|&point| distance_meters(other.point, point) > f64::from(other.uncertainty_m));
    for other in &nearby.other_sites {
        if within(other.point, reach)
            && 2.0 * f64::from(other.uncertainty_m) <= radius
            && !shown.members.contains(&other.id)
            && !is_same_operator(shown, &other.plmn, other.operator_id)
            && stands_for_itself(other)
        {
            keep(Candidate { target: Target::OtherSite(other.id), point: other.point, kind: SnapKind::ObservedSite, carries_operator: false });
        }
    }

    for &(id, point) in nearby.candidates.iter().filter(|(_, point)| within(*point, reach)) {
        keep(Candidate { target: Target::Candidate(id), point, kind: SnapKind::Candidate, carries_operator: false });
    }
    kept
}

pub(crate) fn snap_rows(lead: i32, site: &Site, estimate: &Estimate, candidates: &[Candidate], calibrated: &Calibrated) -> Vec<SnapRow> {
    let tested: Vec<(Candidate, f64)> =
        candidates.iter().filter_map(|&candidate| Some((candidate, difference_at(site, estimate, &calibrated.context, candidate.point)?))).collect();
    let tests: Vec<Tested> = tested
        .iter()
        .map(|&(candidate, difference)| Tested { difference, prior: calibrated.snap_prior(candidate.kind, candidate.carries_operator) })
        .collect();
    let snap = decide(&tests, calibrated.snap_prior(SnapKind::None, false));
    tested
        .iter()
        .zip(&snap.probabilities)
        .enumerate()
        .map(|(index, (&(candidate, difference), &probability))| SnapRow {
            lead,
            candidate,
            difference,
            probability,
            is_snap: snap.snapped == Some(index),
        })
        .collect()
}

pub(crate) async fn load_nearby(client: &impl GenericClient, shown: &[&Shown], rules: Rules) -> Result<BTreeMap<i32, Nearby>, StoreError> {
    let leads: Vec<i32> = shown.iter().map(|shown| shown.lead).collect();
    let longitudes: Vec<f64> = shown.iter().map(|shown| shown.point.longitude).collect();
    let latitudes: Vec<f64> = shown.iter().map(|shown| shown.point.latitude).collect();
    let fixed_reach: Vec<f64> = shown.iter().map(|shown| STANDS_FOR_REACH * f64::from(shown.uncertainty_m)).collect();
    let candidate_reach: Vec<f64> = shown.iter().map(|shown| CANDIDATE_REACH * f64::from(shown.uncertainty_m)).collect();
    let lead_operators: Vec<Option<i32>> = shown.iter().map(|shown| shown.operator_id).collect();
    let members: Vec<i32> = shown.iter().flat_map(|shown| shown.members.iter().copied()).collect();
    let by_lead: BTreeMap<i32, &Shown> = shown.iter().map(|&shown| (shown.lead, shown)).collect();
    let (location_rows, named_rows, official_rows, other_site_rows, candidate_rows) = tokio::try_join!(
        async {
            let statement = format!(
                "SELECT q.lead, l.id, l.latitude, l.longitude,
                   EXISTS (SELECT 1 FROM public.stations s WHERE s.location_id = l.id AND s.operator_id = q.operator_id),
                   EXISTS (SELECT 1 FROM public.stations s WHERE s.location_id = l.id AND s.operator_id IS DISTINCT FROM q.operator_id)
                 FROM unnest($1::int[], $2::float8[], $3::float8[], $4::float8[], $6::int[]) AS q(lead, longitude, latitude, reach, operator_id)
                 JOIN public.locations l ON ST_DWithin(l.point, {NEAR})
                 ORDER BY 1, 2"
            );
            client.query(&statement, &[&leads, &longitudes, &latitudes, &fixed_reach, &METERS_PER_DEGREE, &lead_operators]).await
        },
        async {
            client
                .query(
                    "SELECT observed_site_id, official_site_id FROM observations.site_official_links WHERE observed_site_id = ANY($1)",
                    &[&members],
                )
                .await
        },
        async {
            let statement = format!(
                "SELECT q.lead, s.id, ol.latitude, ol.longitude, s.operator_id FROM {AROUND}
                 JOIN official.locations ol ON ST_DWithin(ol.point, {NEAR})
                 JOIN official.sites s ON s.location_id = ol.id AND s.source_id = ol.source_id
                 JOIN official.sources src ON src.id = s.source_id AND src.is_visible
                 ORDER BY 1, 2"
            );
            client.query(&statement, &[&leads, &longitudes, &latitudes, &fixed_reach, &METERS_PER_DEGREE]).await
        },
        async {
            let statement = format!(
                "SELECT q.lead, o.id, ST_Y(oe.point), ST_X(oe.point), oe.uncertainty_m, o.plmn, p.operator_id FROM {AROUND}
                 JOIN observations.site_estimates oe ON oe.algorithm_version = $6 AND ST_DWithin(oe.point, {NEAR})
                 JOIN observations.observed_sites o ON o.id = oe.observed_site_id AND o.retired_at IS NULL
                 LEFT JOIN {REPORTED_CODES} p ON p.reported_code = o.plmn
                 WHERE oe.alternative_point IS NULL AND oe.is_consistent
                   AND EXISTS (SELECT 1 FROM observations.site_confirmations c WHERE c.observed_site_id = o.id)
                   AND ($7 OR NOT EXISTS (SELECT 1 FROM observations.site_links l WHERE l.observed_site_id = o.id AND l.kind = 'matched'))
                 ORDER BY 1, 2"
            );
            client
                .query(&statement, &[&leads, &longitudes, &latitudes, &candidate_reach, &METERS_PER_DEGREE, &ALGORITHM_VERSION, &rules.matched_sites])
                .await
        },
        async {
            let statement = format!(
                "SELECT q.lead, c.id, ST_Y(c.point), ST_X(c.point) FROM {AROUND}
                 JOIN observations.candidates c ON ST_DWithin(c.point, {NEAR})
                 JOIN observations.candidate_sources cs ON cs.source = c.source AND cs.may_copy_coordinates
                 ORDER BY 1, 2"
            );
            client.query(&statement, &[&leads, &longitudes, &latitudes, &candidate_reach, &METERS_PER_DEGREE]).await
        },
    )?;
    let mut nearby: BTreeMap<i32, Nearby> = BTreeMap::new();

    for row in &location_rows {
        nearby.entry(row.get(0)).or_default().locations.push(NearbyLocation {
            id: row.get(1),
            point: Point::new(row.get(2), row.get(3)),
            carries_operator: row.get(4),
            carries_other_operators: row.get(5),
        });
    }

    let named: BTreeSet<(i32, i32)> = named_rows.iter().map(|row| (row.get(0), row.get(1))).collect();
    for row in &official_rows {
        let (lead, id): (i32, i32) = (row.get(0), row.get(1));
        let tested = by_lead[&lead];
        nearby.entry(lead).or_default().official_sites.push(OfficialSite {
            id,
            point: Point::new(row.get(2), row.get(3)),
            is_named: tested.members.iter().any(|&member| named.contains(&(member, id))),
            carries_operator: tested.operator_id.is_some_and(|operator| operator == row.get::<_, i32>(4)),
        });
    }

    for row in &other_site_rows {
        nearby.entry(row.get(0)).or_default().other_sites.push(OtherSite {
            id: row.get(1),
            point: Point::new(row.get(2), row.get(3)),
            uncertainty_m: row.get(4),
            plmn: row.get(5),
            operator_id: row.get(6),
        });
    }

    for row in &candidate_rows {
        nearby.entry(row.get(0)).or_default().candidates.push((row.get(1), Point::new(row.get(2), row.get(3))));
    }
    Ok(nearby)
}

pub(crate) async fn write_snap_tests(transaction: &Transaction<'_>, affected: &[i32], snaps: &[SnapRow]) -> Result<(), StoreError> {
    transaction
        .execute("DELETE FROM observations.snap_tests WHERE observed_site_id = ANY($1) AND algorithm_version = $2", &[&affected, &ALGORITHM_VERSION])
        .await?;
    let column = |pick: fn(Target) -> Option<i32>| -> Vec<Option<i32>> { snaps.iter().map(|snap| pick(snap.candidate.target)).collect() };
    let leads: Vec<i32> = snaps.iter().map(|snap| snap.lead).collect();
    let differences: Vec<f32> = snaps.iter().map(|snap| snap.difference as f32).collect();
    let probabilities: Vec<f32> = snaps.iter().map(|snap| snap.probability.clamp(0.0, 1.0) as f32).collect();
    let is_snap: Vec<bool> = snaps.iter().map(|snap| snap.is_snap).collect();
    transaction
        .execute(
            "INSERT INTO observations.snap_tests
               (observed_site_id, algorithm_version, location_id, official_site_id, other_site_id, candidate_id, difference, probability, is_snap)
             SELECT lead, $8::int2, location_id, official_site_id, other_site_id, candidate_id, difference, probability, is_snap
             FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::int[], $6::real[], $7::real[], $9::bool[])
               AS t(lead, location_id, official_site_id, other_site_id, candidate_id, difference, probability, is_snap)",
            &[
                &leads,
                &column(|target| if let Target::Location(id) = target { Some(id) } else { None }),
                &column(|target| if let Target::OfficialSite(id) = target { Some(id) } else { None }),
                &column(|target| if let Target::OtherSite(id) = target { Some(id) } else { None }),
                &column(|target| if let Target::Candidate(id) = target { Some(id) } else { None }),
                &differences,
                &probabilities,
                &ALGORITHM_VERSION,
                &is_snap,
            ],
        )
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const HERE: Point = Point { latitude: 52.2297, longitude: 21.0122 };

    fn east_of(metres: f64) -> Point {
        engine_geo::plane::LocalPlane::around(HERE).to_point(metres, 0.0)
    }

    fn shown(uncertainty_m: i32) -> Shown {
        Shown { lead: 1, members: vec![1], point: HERE, uncertainty_m, plmn: "26003".into(), operator_id: Some(3) }
    }

    fn location(id: i32, metres: f64) -> NearbyLocation {
        NearbyLocation { id, point: east_of(metres), carries_operator: false, carries_other_operators: true }
    }

    fn other(id: i32, metres: f64, uncertainty_m: i32, plmn: &str, operator_id: i32) -> OtherSite {
        OtherSite { id, point: east_of(metres), uncertainty_m, plmn: plmn.into(), operator_id: Some(operator_id) }
    }

    fn targets(candidates: Vec<Candidate>) -> Vec<Target> {
        candidates.into_iter().map(|candidate| candidate.target).collect()
    }

    #[test]
    fn candidates_lie_within_one_and_a_half_radii() {
        let nearby = Nearby { locations: vec![location(10, 140.0), location(11, 160.0)], ..Nearby::default() };
        assert_eq!(targets(candidates_for(&shown(100), &nearby)), vec![Target::Location(10)]);
    }

    #[test]
    fn another_operators_site_beside_one_of_our_locations_is_no_second_candidate() {
        let nearby = Nearby { locations: vec![location(10, 100.0)], other_sites: vec![other(20, 130.0, 60, "26002", 2)], ..Nearby::default() };
        assert_eq!(targets(candidates_for(&shown(200), &nearby)), vec![Target::Location(10)]);
    }

    #[test]
    fn a_better_known_site_of_another_operator_is_a_candidate_and_of_the_same_operator_is_not() {
        let nearby = Nearby {
            other_sites: vec![other(20, 150.0, 60, "26002", 2), other(21, -150.0, 60, "26013", 3), other(22, 0.0, 150, "26001", 1)],
            ..Nearby::default()
        };
        let candidates = candidates_for(&shown(200), &nearby);
        assert_eq!(targets(candidates.clone()), vec![Target::OtherSite(20)], "21 belongs to the same operator, 22 is not known twice as well");
        assert_eq!(candidates[0].kind, SnapKind::ObservedSite);
    }

    #[test]
    fn a_register_site_where_one_of_our_locations_stands_is_not_tested_again() {
        let register = |id: i32, metres: f64, is_named: bool| OfficialSite { id, point: east_of(metres), is_named, carries_operator: false };
        let nearby = Nearby {
            locations: vec![location(10, 0.0)],
            official_sites: vec![register(30, 20.0, false), register(31, 200.0, false), register(32, 210.0, true)],
            ..Nearby::default()
        };
        let candidates = candidates_for(&shown(200), &nearby);
        assert_eq!(
            targets(candidates.clone()),
            vec![Target::Location(10), Target::OfficialSite(32)],
            "the register site named by the identity stands for the place"
        );
        assert_eq!(candidates[1].kind, SnapKind::OfficialSiteByIdentity);
    }
}
