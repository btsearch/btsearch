mod common;

use common::{Sector, context, plane, ring_of_readings, site_from_readings, site_of, three_sectors};
use engine_estimate::estimate;
use engine_estimate::group::combined;
use engine_estimate::input::{Site, Technology};
use engine_estimate::split::{Cut, best_split, candidate_cuts, find_split};
use engine_geo::plane::distance_meters;

const SECOND_PLACE_FIRST_KEY: i64 = 31_604_736 + 11;
const NO_CODES: [Option<i32>; 6] = [None; 6];
const SHARED_PCI_ACROSS_PLACES: [Option<i32>; 6] = [Some(10), Some(11), Some(12), Some(10), Some(21), Some(22)];

fn second_place_sectors() -> Vec<Sector> {
    three_sectors().into_iter().enumerate().map(|(index, sector)| Sector { key: SECOND_PLACE_FIRST_KEY + index as i64, ..sector }).collect()
}

fn readings_around(at: (f64, f64)) -> Vec<(f64, f64)> {
    ring_of_readings(300.0, 3_000.0, 300.0, 9.0).into_iter().map(|(east, north)| (east + at.0, north + at.1)).collect()
}

fn measured_at(sectors: &[Sector], at: (f64, f64), with_timing_advance: bool) -> Site {
    site_from_readings(sectors, &readings_around(at), at, with_timing_advance)
}

fn one_node_in_two_places(apart_m: f64, with_timing_advance: bool) -> Site {
    let first = measured_at(&three_sectors(), (0.0, 0.0), with_timing_advance);
    let second = measured_at(&second_place_sectors(), (apart_m, 0.0), with_timing_advance);
    combined(&[&first, &second])
}

#[test]
fn an_enb_in_two_places_with_timing_advance_is_split_along_its_places() {
    let site = one_node_in_two_places(8_000.0, true);
    let whole = estimate(&site, &context()).expect("an estimate");
    assert!(!whole.is_consistent());

    let split = find_split(&site, &whole, &NO_CODES, &NO_CODES, &context()).expect("a split");
    assert_eq!(split.parts, vec![vec![0, 1, 2], vec![3, 4, 5]]);
    let first_off = distance_meters(split.estimates[0].point, plane().to_point(0.0, 0.0));
    let second_off = distance_meters(split.estimates[1].point, plane().to_point(8_000.0, 0.0));
    assert!(first_off < 100.0 && second_off < 100.0, "{first_off} m and {second_off} m off");
}

#[test]
fn an_enb_in_two_places_without_timing_advance_is_tested_when_two_of_its_cells_share_channel_and_pci() {
    let site = one_node_in_two_places(8_000.0, false);
    let whole = estimate(&site, &context()).expect("an estimate");
    assert!(whole.is_consistent(), "without timing advance only levels beyond reach make a fit inconsistent");

    let distinct_pcis = [Some(10), Some(11), Some(12), Some(20), Some(21), Some(22)];
    assert_eq!(find_split(&site, &whole, &distinct_pcis, &NO_CODES, &context()), None, "nothing says the cells stand apart");

    let split = find_split(&site, &whole, &SHARED_PCI_ACROSS_PLACES, &NO_CODES, &context()).expect("a split");
    assert_eq!(split.parts, vec![vec![0, 1, 2], vec![3, 4, 5]]);
}

#[test]
fn a_cut_that_keeps_two_cells_of_one_channel_and_pci_in_one_part_is_dropped() {
    let site = one_node_in_two_places(8_000.0, false);
    let whole = estimate(&site, &context()).expect("an estimate");
    let by_place = vec![vec![0, 1, 2], vec![3, 4, 5]];

    assert_eq!(candidate_cuts(&site, &whole, &SHARED_PCI_ACROSS_PLACES, &NO_CODES), vec![by_place]);
    let shared_pci_at_the_first_place = [Some(10), Some(10), Some(12), Some(20), Some(21), Some(22)];
    assert_eq!(
        candidate_cuts(&site, &whole, &shared_pci_at_the_first_place, &NO_CODES),
        Vec::<Cut>::new(),
        "cells 0 and 1 cannot stand on one site, so no part may hold both"
    );
}

#[test]
fn a_node_whose_cells_at_one_place_were_only_heard_as_neighbours_is_split_by_its_area_codes() {
    let first = measured_at(&three_sectors(), (0.0, 0.0), false);
    let mut second = measured_at(&second_place_sectors(), (8_000.0, 0.0), false);
    for bin in second.cells.iter_mut().flat_map(|cell| cell.bins.iter_mut()) {
        bin.serving_weight_milli = 0;
    }
    let site = combined(&[&first, &second]);
    let whole = estimate(&site, &context()).expect("an estimate");

    assert_eq!(
        find_split(&site, &whole, &SHARED_PCI_ACROSS_PLACES, &NO_CODES, &context()),
        None,
        "the cells at the second place have no place of their own"
    );
    let area_codes = [Some(100), Some(100), Some(100), Some(200), Some(200), Some(200)];
    let split = find_split(&site, &whole, &SHARED_PCI_ACROSS_PLACES, &area_codes, &context()).expect("a split");
    assert_eq!(split.parts, vec![vec![0, 1, 2], vec![3, 4, 5]]);
}

#[test]
fn the_area_codes_of_a_stations_gsm_cells_do_not_cut_its_node() {
    let lte = measured_at(&three_sectors(), (0.0, 0.0), false);
    let gsm = site_of(Technology::Gsm, &three_sectors(), &readings_around((0.0, 0.0)), (0.0, 0.0), false);
    let site = combined(&[&lte, &gsm]);
    let whole = estimate(&site, &context()).expect("an estimate");
    let tac_and_lacs = [Some(100), Some(100), Some(100), Some(7), Some(7), Some(7)];

    assert_eq!(candidate_cuts(&site, &whole, &NO_CODES, &tac_and_lacs), Vec::<Cut>::new(), "a LAC and a TAC share no numbering");
}

#[test]
fn the_cell_away_from_four_others_is_the_one_that_disagrees() {
    let mut four_sectors = three_sectors();
    four_sectors.push(Sector { key: 31_604_736 + 4, azimuth_deg: 60.0, power_db: 40.0 });
    let first = measured_at(&four_sectors, (0.0, 0.0), true);
    let second_at = (8_000.0, 0.0);
    let fewer_readings: Vec<(f64, f64)> = readings_around(second_at).into_iter().step_by(8).collect();
    let second = site_from_readings(&second_place_sectors()[..1], &fewer_readings, second_at, true);

    let whole = estimate(&combined(&[&first, &second]), &context()).expect("an estimate");
    assert_eq!(whole.disagreeing_cells, vec![4], "the four cells hold the fit, and the timing advance of the fifth says its mast is closer");
}

#[test]
fn a_wide_rural_site_is_not_split_by_the_distance_between_its_sectors() {
    let site = site_from_readings(&three_sectors(), &ring_of_readings(300.0, 5_700.0, 600.0, 6.0), (0.0, 0.0), false);
    let whole = estimate(&site, &context()).expect("an estimate");
    let no_codes = [None; 3];

    let cuts = candidate_cuts(&site, &whole, &no_codes, &no_codes);
    assert_eq!(cuts, vec![vec![vec![0], vec![1], vec![2]]], "the centres of serving weight of the sectors lie more than 3 km apart");
    assert_eq!(best_split(&site, &whole, &cuts, &context()), None);
}

#[test]
fn two_places_a_kilometre_apart_are_not_split() {
    let site = one_node_in_two_places(1_000.0, true);
    let whole = estimate(&site, &context()).expect("an estimate");

    let by_place = vec![vec![0, 1, 2], vec![3, 4, 5]];
    assert_eq!(best_split(&site, &whole, &[by_place], &context()), None, "parts less than 3 km apart stay one site");
    assert_eq!(find_split(&site, &whole, &NO_CODES, &NO_CODES, &context()), None);
}
