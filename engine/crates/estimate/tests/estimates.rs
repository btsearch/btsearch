mod common;

use common::{Sector, context, metres_from_site, plane, ring_of_readings, site_from_readings, site_of, three_sectors, timing_advance_only};
use engine_estimate::antenna::{angle_between_deg, bearing_deg};
use engine_estimate::estimate;
use engine_estimate::firmness::leave_out_shift_m;
use engine_estimate::group::combined;
use engine_estimate::input::{Site, Technology};
use engine_estimate::timing_advance::GSM_STEP_M;
use engine_geo::plane::distance_meters;

const GSM_LAC_AND_CID: i64 = (50_114 << 16) | 12_345;

fn gsm_sectors() -> Vec<Sector> {
    three_sectors()
        .into_iter()
        .enumerate()
        .map(|(index, sector)| Sector {
            key: GSM_LAC_AND_CID + index as i64,
            ..sector
        })
        .collect()
}

fn around_the_site() -> Vec<(f64, f64)> {
    ring_of_readings(300.0, 3_000.0, 300.0, 6.0)
}

#[test]
fn three_sectors_with_timing_advance_put_the_site_where_it_stands() {
    let sectors = three_sectors();
    let site = site_from_readings(&sectors, &around_the_site(), (0.0, 0.0), true);
    let estimate = estimate(&site, &context()).expect("an estimate");

    assert!(metres_from_site(estimate.point) < 40.0, "{} m off", metres_from_site(estimate.point));
    assert!(estimate.is_consistent);
    assert_eq!(estimate.alternative_point, None);
    assert!(estimate.uncertainty_m > 0 && estimate.uncertainty_m < 300, "{} m", estimate.uncertainty_m);
    for (fit, sector) in estimate.cells.iter().zip(&sectors) {
        assert_eq!(fit.key, sector.key);
        assert!(
            angle_between_deg(fit.azimuth_deg, sector.azimuth_deg) < 10.0,
            "{} for {}",
            fit.azimuth_deg,
            sector.azimuth_deg
        );
    }
}

#[test]
fn sectors_alone_place_a_site_without_timing_advance() {
    let site = site_from_readings(&three_sectors(), &around_the_site(), (0.0, 0.0), false);
    let estimate = estimate(&site, &context()).expect("an estimate");
    assert!(metres_from_site(estimate.point) < 300.0, "{} m off", metres_from_site(estimate.point));
}

#[test]
fn rings_from_one_straight_road_leave_two_places() {
    let road: Vec<(f64, f64)> = (-60..=60).map(|step| (f64::from(step) * 50.0, 1_000.0)).collect();
    let site = Site {
        cells: vec![timing_advance_only(1, &road, (0.0, 0.0))],
        handovers: Vec::new(),
        contributor_count: 1,
        person_count: 1,
    };
    let estimate = estimate(&site, &context()).expect("an estimate");

    let alternative = estimate.alternative_point.expect("the mirror image across the road");
    let (_, alternative_north) = plane().to_plane(alternative);
    let (_, north) = plane().to_plane(estimate.point);
    assert!(
        (north - alternative_north).abs() > 1_500.0,
        "the two places lie on either side of the road"
    );
    assert!(f64::from(estimate.uncertainty_m) >= (north - alternative_north).abs());
}

#[test]
fn cells_of_one_node_in_two_places_are_not_consistent() {
    let around_west: Vec<(f64, f64)> = ring_of_readings(300.0, 900.0, 300.0, 15.0)
        .into_iter()
        .map(|(east, north)| (east - 2_000.0, north))
        .collect();
    let around_east: Vec<(f64, f64)> = ring_of_readings(300.0, 900.0, 300.0, 15.0)
        .into_iter()
        .map(|(east, north)| (east + 2_000.0, north))
        .collect();
    let site = Site {
        cells: vec![
            timing_advance_only(1, &around_west, (-2_000.0, 0.0)),
            timing_advance_only(2, &around_east, (2_000.0, 0.0)),
        ],
        handovers: Vec::new(),
        contributor_count: 2,
        person_count: 2,
    };
    assert!(!estimate(&site, &context()).expect("an estimate").is_consistent);
}

#[test]
fn the_evidence_counts_what_the_estimate_rests_on() {
    let readings = around_the_site();
    let site = site_from_readings(&three_sectors(), &readings, (0.0, 0.0), true);
    let evidence = estimate(&site, &context()).expect("an estimate").evidence;

    assert_eq!(evidence.sample_count, 3 * readings.len() as i64);
    assert_eq!(evidence.ta_sample_count, readings.len() as i64);
    assert_eq!((evidence.contributor_count, evidence.person_count), (3, 2));
    assert!(evidence.angular_coverage_deg > 340, "{}", evidence.angular_coverage_deg);
    assert_eq!(evidence.distinct_days, 2);
    assert!((2_900..=3_100).contains(&evidence.max_distance_m), "{}", evidence.max_distance_m);
}

#[test]
fn the_same_rows_give_the_same_estimate() {
    let site = site_from_readings(&three_sectors(), &ring_of_readings(300.0, 2_100.0, 300.0, 9.0), (150.0, -80.0), true);
    let first = estimate(&site, &context());
    assert_eq!(first, estimate(&site, &context()));
    let point = first.expect("an estimate").point;
    assert!(distance_meters(point, plane().to_point(150.0, -80.0)) < 40.0);
}

#[test]
fn gsm_sectors_with_timing_advance_place_the_site_as_coarsely_as_their_steps_allow() {
    let lte = estimate(&site_from_readings(&three_sectors(), &around_the_site(), (0.0, 0.0), true), &context()).expect("an estimate");
    let gsm = estimate(
        &site_of(Technology::Gsm, &gsm_sectors(), &around_the_site(), (0.0, 0.0), true),
        &context(),
    )
    .expect("an estimate");

    let off = metres_from_site(gsm.point);
    assert!(
        off < 150.0 && off <= f64::from(gsm.uncertainty_m),
        "{off} m off, {} m uncertain",
        gsm.uncertainty_m
    );
    assert!(
        gsm.uncertainty_m > lte.uncertainty_m,
        "{} m from 553 m steps, {} m from 78 m steps",
        gsm.uncertainty_m,
        lte.uncertainty_m
    );
    assert_eq!(gsm.evidence.gsm_ta_sample_count, around_the_site().len() as i64);
}

#[test]
fn gsm_cells_beside_lte_cells_on_one_mast_neither_drag_the_estimate_nor_widen_it() {
    let lte_cells = site_from_readings(&three_sectors(), &around_the_site(), (0.0, 0.0), true);
    let gsm_cells = site_of(Technology::Gsm, &gsm_sectors(), &around_the_site(), (0.0, 0.0), true);
    let lte = estimate(&lte_cells, &context()).expect("an estimate");
    let mixed = estimate(&combined(&[&lte_cells, &gsm_cells]), &context()).expect("an estimate");

    let moved = distance_meters(mixed.point, lte.point);
    assert!(moved < 10.0, "{moved} m from where the LTE timing advance puts it");
    assert!(
        mixed.uncertainty_m <= lte.uncertainty_m,
        "{} m with GSM, {} m without",
        mixed.uncertainty_m,
        lte.uncertainty_m
    );
    assert!(mixed.is_consistent);
}

#[test]
fn gsm_cells_whose_phones_answer_one_symbol_early_are_still_consistent_with_the_mast() {
    let lte_cells = site_from_readings(&three_sectors(), &around_the_site(), (0.0, 0.0), true);
    let mut gsm_cells = site_of(Technology::Gsm, &gsm_sectors(), &around_the_site(), (0.0, 0.0), true);
    for row in gsm_cells.cells.iter_mut().flat_map(|cell| cell.timing_advance.iter_mut()) {
        row.distance_m -= GSM_STEP_M;
    }
    let mixed = estimate(&combined(&[&lte_cells, &gsm_cells]), &context()).expect("an estimate");

    assert!(metres_from_site(mixed.point) < 40.0, "{} m off", metres_from_site(mixed.point));
    assert!(
        mixed.is_consistent,
        "rounding and one symbol of phone tolerance put the mast up to a symbol and a half closer"
    );
}

#[test]
fn umts_levels_alone_place_a_site_with_a_wider_radius_than_timing_advance_gives() {
    let lte = estimate(&site_from_readings(&three_sectors(), &around_the_site(), (0.0, 0.0), true), &context()).expect("an estimate");
    let umts_cells = site_of(Technology::Umts, &three_sectors(), &around_the_site(), (0.0, 0.0), false);
    let umts = estimate(&umts_cells, &context()).expect("levels alone give an estimate");

    assert!(metres_from_site(umts.point) < 300.0, "{} m off", metres_from_site(umts.point));
    assert_eq!(umts.evidence.ta_sample_count, 0);
    assert!(
        umts.uncertainty_m > lte.uncertainty_m,
        "{} m from levels, {} m with timing advance",
        umts.uncertainty_m,
        lte.uncertainty_m
    );
}

fn within(bearing: f64, sectors: &[(f64, f64)]) -> bool {
    sectors.iter().any(|&(from, to)| (from..to).contains(&bearing))
}

#[test]
fn a_site_whose_cells_agree_barely_moves_when_a_sector_of_its_readings_is_left_out() {
    let site = site_from_readings(&three_sectors(), &around_the_site(), (0.0, 0.0), true);
    let estimate = estimate(&site, &context()).expect("an estimate");
    let shift = leave_out_shift_m(&site, &estimate, &context()).expect("readings all around");
    assert!(shift < 40, "{shift} m");
}

#[test]
fn a_site_resting_on_readings_from_another_place_moves_far_when_their_sector_is_left_out() {
    let other_place = (153.0, 370.0);
    let ours: Vec<(f64, f64)> = ring_of_readings(300.0, 3_000.0, 300.0, 4.0)
        .into_iter()
        .filter(|&(east, north)| {
            within(
                bearing_deg(east - other_place.0, north - other_place.1),
                &[(95.0, 130.0), (185.0, 220.0), (275.0, 310.0)],
            )
        })
        .collect();
    let theirs: Vec<(f64, f64)> = ring_of_readings(300.0, 3_000.0, 300.0, 1.5)
        .into_iter()
        .filter(|&(east, north)| within(bearing_deg(east, north), &[(5.0, 40.0)]))
        .map(|(east, north)| (east + other_place.0, north + other_place.1))
        .collect();
    let site = Site {
        cells: vec![timing_advance_only(1, &ours, (0.0, 0.0)), timing_advance_only(2, &theirs, other_place)],
        handovers: Vec::new(),
        contributor_count: 2,
        person_count: 2,
    };
    let estimate = estimate(&site, &context()).expect("an estimate");
    let shift = leave_out_shift_m(&site, &estimate, &context()).expect("three sectors of our readings beside theirs");
    assert!(shift > 200, "{shift} m: the estimate rests on the readings from the other place");
}

#[test]
fn readings_from_two_directions_alone_give_no_leave_out_shift() {
    let two_ways: Vec<(f64, f64)> = ring_of_readings(300.0, 3_000.0, 300.0, 2.5)
        .into_iter()
        .filter(|&(east, north)| within(bearing_deg(east, north), &[(10.0, 35.0), (190.0, 215.0)]))
        .collect();
    let site = Site {
        cells: vec![timing_advance_only(1, &two_ways, (0.0, 0.0))],
        handovers: Vec::new(),
        contributor_count: 2,
        person_count: 2,
    };
    let estimate = estimate(&site, &context()).expect("an estimate");
    assert_eq!(leave_out_shift_m(&site, &estimate, &context()), None);
}
