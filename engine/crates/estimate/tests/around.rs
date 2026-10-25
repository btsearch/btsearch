mod common;

use common::{SITE, Sector, context, plane, ring_of_readings, site_from_readings, three_sectors};
use engine_estimate::antenna::angle_between_deg;
use engine_estimate::confidence::tempered;
use engine_estimate::grid::evidence_grid;
use engine_estimate::group::{GROUPING_THRESHOLD, combined, form_groups, joint_cost};
use engine_estimate::input::{Cell, Site};
use engine_estimate::shape::{Beyond, EDGE_ZOOM, EdgeKind, Surroundings, edges_of, shape_of};
use engine_estimate::snap::{SNAP_THRESHOLD, Tested, decide, difference_at};
use engine_estimate::{Estimate, Evidence, estimate};
use engine_geo::Point;
use engine_geo::plane::distance_meters;
use engine_geo::square::Tile;

const OTHER_CHANNEL: i32 = 6_200;

fn sectors_from(first_key: i64, azimuths: [f64; 3]) -> Vec<Sector> {
    azimuths
        .into_iter()
        .enumerate()
        .map(|(index, azimuth_deg)| Sector {
            key: first_key + index as i64,
            azimuth_deg,
            power_db: 40.0,
        })
        .collect()
}

fn measured_site(sectors: &[Sector], at: (f64, f64)) -> Site {
    let readings: Vec<(f64, f64)> = ring_of_readings(300.0, 3_000.0, 300.0, 6.0)
        .into_iter()
        .map(|(east, north)| (east + at.0, north + at.1))
        .collect();
    site_from_readings(sectors, &readings, at, true)
}

fn on_channel(mut site: Site, channel: i32) -> Site {
    for cell in &mut site.cells {
        cell.channel = Some(channel);
    }
    site
}

#[test]
fn two_sites_on_one_mast_are_a_group_and_a_mast_beside_them_is_not() {
    let enb = measured_site(&three_sectors(), (0.0, 0.0));
    let gnb = on_channel(measured_site(&sectors_from(41_000_001, [60.0, 180.0, 300.0]), (0.0, 0.0)), OTHER_CHANNEL);
    let beside = measured_site(&sectors_from(51_000_001, [0.0, 120.0, 240.0]), (700.0, 0.0));
    let estimates: Vec<Estimate> = [&enb, &gnb, &beside]
        .iter()
        .map(|site| estimate(site, &context()).expect("an estimate"))
        .collect();

    let sites = [(&enb, &estimates[0]), (&gnb, &estimates[1]), (&beside, &estimates[2])];
    let groups = form_groups(&sites, &context());
    let members: Vec<Vec<usize>> = groups.iter().map(|group| group.members.clone()).collect();
    assert_eq!(members, vec![vec![0, 1], vec![2]]);
    assert!(distance_meters(groups[0].estimate.point, SITE) < 40.0);
    assert!(groups[0].estimate.uncertainty_m <= estimates[0].uncertainty_m.max(estimates[1].uncertainty_m));

    let apart = estimate(&combined(&[&enb, &beside]), &context()).expect("a joint fit");
    let cost = joint_cost(&[&enb, &beside], &apart, &context()).expect("a joint cost");
    assert!(
        tempered(cost - (estimates[0].cost + estimates[2].cost), apart.ellipse_scale) > GROUPING_THRESHOLD,
        "two masts 700 m apart cannot share a point"
    );

    let reversed = form_groups(&[sites[2], sites[1], sites[0]], &context());
    let reversed_members: Vec<Vec<usize>> = reversed.iter().map(|group| group.members.clone()).collect();
    assert_eq!(
        reversed_members,
        vec![vec![0], vec![1, 2]],
        "the same sites in another order group the same way"
    );
}

#[test]
fn people_who_measured_both_sites_of_a_group_count_once() {
    let enb = measured_site(&three_sectors(), (0.0, 0.0));
    let gnb = on_channel(measured_site(&sectors_from(41_000_001, [60.0, 180.0, 300.0]), (0.0, 0.0)), OTHER_CHANNEL);
    let joined = combined(&[&enb, &gnb]);
    assert_eq!((joined.contributor_count, joined.person_count), (enb.contributor_count, enb.person_count));
}

#[test]
fn an_estimate_snaps_to_the_mast_it_stands_on_and_not_between_two() {
    let site = measured_site(&three_sectors(), (0.0, 0.0));
    let fit = estimate(&site, &context()).expect("an estimate");
    let (east, north) = plane().to_plane(fit.point);
    let near = difference_at(&site, &fit, &context(), plane().to_point(east + 5.0, north)).expect("a difference");
    let far = difference_at(&site, &fit, &context(), plane().to_point(2_000.0, 0.0)).expect("a difference");
    assert!(near <= SNAP_THRESHOLD && far > 100.0, "{near} near, {far} far");
    assert_eq!(
        decide(
            &[
                Tested { difference: far, prior: 1.0 },
                Tested {
                    difference: near,
                    prior: 1.0
                }
            ],
            1.0
        )
        .snapped,
        Some(1)
    );

    let either_side: Vec<Tested> = [-15.0, 15.0]
        .into_iter()
        .map(|offset| Tested {
            difference: difference_at(&site, &fit, &context(), plane().to_point(east + offset, north)).expect("a difference"),
            prior: 1.0,
        })
        .collect();
    assert_eq!(decide(&either_side, 1.0).snapped, None, "{either_side:?}");
}

#[test]
fn the_evidence_grid_is_cheapest_where_the_site_stands() {
    let site = measured_site(&three_sectors(), (0.0, 0.0));
    let fit = estimate(&site, &context()).expect("an estimate");
    let grid = evidence_grid(&site, &fit, &context()).expect("a grid");
    assert_eq!(grid.cost.len(), grid.columns as usize * grid.rows as usize);

    let (origin_east, origin_north) = plane().to_plane(grid.origin);
    let (east, north) = plane().to_plane(fit.point);
    let column = ((east - origin_east) / f64::from(grid.cell_m)).floor() as usize;
    let row = ((north - origin_north) / f64::from(grid.cell_m)).floor() as usize;
    assert_eq!(grid.cost[row * grid.columns as usize + column], 0);
}

struct NetworkWithin {
    site: Point,
    metres: f64,
}

impl Surroundings for NetworkWithin {
    fn beyond(&self, square: u64, _: &Cell) -> Beyond {
        let centre = Tile::from_quadkey(square, EDGE_ZOOM).centre();
        if distance_meters(centre, self.site) <= self.metres {
            Beyond::SameLayer
        } else {
            Beyond::Nobody
        }
    }
}

fn known_estimate() -> Estimate {
    let evidence = Evidence {
        sample_count: 0,
        contributor_count: 2,
        person_count: 2,
        bin_count: 0,
        ta_sample_count: 0,
        gsm_ta_sample_count: 0,
        angular_coverage_deg: 360,
        distinct_days: 2,
        max_distance_m: 1_000,
    };
    Estimate {
        point: SITE,
        cost: 0.0,
        uncertainty_m: 40,
        ellipse_major_m: 30,
        ellipse_minor_m: 30,
        ellipse_azimuth_deg: 0,
        ellipse_scale: 1.0,
        alternative_point: None,
        is_consistent: true,
        cells: Vec::new(),
        evidence,
    }
}

fn densely_measured_site(sectors: &[Sector]) -> Site {
    let mut readings = Vec::new();
    for east in (-50..=50).map(|step| f64::from(step) * 20.0) {
        for north in (-50..=50).map(|step| f64::from(step) * 20.0) {
            let distance = (east * east + north * north).sqrt();
            if (60.0..=1_000.0).contains(&distance) {
                readings.extend([(east, north), (east, north)]);
            }
        }
    }
    site_from_readings(sectors, &readings, (0.0, 0.0), false)
}

#[test]
fn three_sectors_give_three_shapes_whose_edges_meet() {
    let sectors = three_sectors();
    let site = densely_measured_site(&sectors);
    let fit = known_estimate();
    let network = NetworkWithin { site: SITE, metres: 1_000.0 };

    let shapes: Vec<_> = site.cells.iter().map(|cell| shape_of(cell, &fit).expect("a shape")).collect();
    let mut borders = Vec::new();
    for ((shape, cell), sector) in shapes.iter().zip(&site.cells).zip(&sectors) {
        assert!(
            angle_between_deg(shape.bearing_deg, sector.azimuth_deg) < 15.0,
            "{} for {}",
            shape.bearing_deg,
            sector.azimuth_deg
        );
        assert!(
            shape.spread_deg < 180.0 && shape.reach_m > 800 && shape.reach_m <= 1_000,
            "{} deg, {} m",
            shape.spread_deg,
            shape.reach_m
        );
        assert!(shape.footprint.len() >= 3 && shape.footprint.len() <= 64);
        assert!(!shape.profile.is_empty());
        let edges = edges_of(cell, shape, fit.point, &network);
        assert!(
            edges.iter().any(|edge| edge.kind == EdgeKind::Unmeasured),
            "the outer arc is where people stopped"
        );
        let handed_over = edges
            .iter()
            .find(|edge| edge.kind == EdgeKind::HandedOver)
            .expect("a border with the other sectors");
        borders.push(handed_over.pieces.iter().flatten().copied().collect::<Vec<Point>>());
    }
    for (index, border) in borders.iter().enumerate() {
        let next = &borders[(index + 1) % borders.len()];
        let closest = border
            .iter()
            .flat_map(|a| next.iter().map(move |b| distance_meters(*a, *b)))
            .fold(f64::INFINITY, f64::min);
        assert!(closest < 75.0, "sectors {index} and the next meet; {closest} m apart");
    }
}

#[test]
fn a_cell_measured_mostly_standing_still_gets_no_shape() {
    let mut site = densely_measured_site(&three_sectors());
    let cell = &mut site.cells[0];
    assert!(shape_of(cell, &known_estimate()).is_some());
    for bin in &mut cell.bins {
        bin.stationary_count = (bin.sample_count + 1) / 2;
    }
    assert!(
        shape_of(cell, &known_estimate()).is_none(),
        "a square where at least half the samples stood still is never shown"
    );
}
