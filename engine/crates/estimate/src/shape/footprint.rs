use engine_geo::plane::LocalPlane;
use engine_geo::square::{SQUARE_ZOOM, Tile, tile_corner};

use crate::input::{Bin, Cell};
use crate::search::distance_between;

const FOOTPRINT_SHARE: f64 = 0.98;
const SIMPLIFIED_TO_M: f64 = 25.0;
const MOST_CORNERS: usize = 64;
const LOOSER_BY: f64 = 1.5;

fn square_corners(square: u64, plane: &LocalPlane) -> [(f64, f64); 4] {
    let Tile { x, y, .. } = Tile::from_quadkey(square, SQUARE_ZOOM);
    [(x, y), (x + 1, y), (x + 1, y + 1), (x, y + 1)].map(|(corner_x, corner_y)| plane.to_plane(tile_corner(SQUARE_ZOOM, corner_x, corner_y)))
}

fn turn(origin: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    (a.0 - origin.0) * (b.1 - origin.1) - (a.1 - origin.1) * (b.0 - origin.0)
}

fn half_hull<'a>(points: impl Iterator<Item = &'a (f64, f64)>) -> Vec<(f64, f64)> {
    let mut half: Vec<(f64, f64)> = Vec::new();
    for &point in points {
        while half.len() >= 2 && turn(half[half.len() - 2], half[half.len() - 1], point) <= 0.0 {
            half.pop();
        }
        half.push(point);
    }
    half.pop();
    half
}

fn convex_hull(mut points: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    points.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
    points.dedup();
    if points.len() < 3 {
        return points;
    }
    let mut hull = half_hull(points.iter());
    hull.extend(half_hull(points.iter().rev()));
    hull
}

fn distance_to_segment(point: (f64, f64), from: (f64, f64), to: (f64, f64)) -> f64 {
    let (dx, dy) = (to.0 - from.0, to.1 - from.1);
    let length_squared = dx * dx + dy * dy;
    if length_squared == 0.0 {
        return distance_between(point, from);
    }
    let along = (((point.0 - from.0) * dx + (point.1 - from.1) * dy) / length_squared).clamp(0.0, 1.0);
    distance_between(point, (from.0 + along * dx, from.1 + along * dy))
}

fn simplified_line(points: &[(f64, f64)], tolerance: f64) -> Vec<(f64, f64)> {
    let (Some(&first), Some(&last)) = (points.first(), points.last()) else {
        return Vec::new();
    };
    let farthest =
        (1..points.len().saturating_sub(1)).map(|index| (index, distance_to_segment(points[index], first, last))).max_by(|a, b| a.1.total_cmp(&b.1));
    match farthest {
        Some((index, distance)) if distance > tolerance => {
            let mut kept = simplified_line(&points[..=index], tolerance);
            kept.pop();
            kept.extend(simplified_line(&points[index..], tolerance));
            kept
        }
        _ if points.len() == 1 => vec![first],
        _ => vec![first, last],
    }
}

fn simplified_ring(ring: &[(f64, f64)], tolerance: f64) -> Vec<(f64, f64)> {
    let Some(&first) = ring.first() else {
        return Vec::new();
    };
    let far = (0..ring.len()).max_by(|&a, &b| distance_between(ring[a], first).total_cmp(&distance_between(ring[b], first))).unwrap_or(0);
    let mut kept = simplified_line(&ring[..=far], tolerance);
    kept.pop();
    let back: Vec<(f64, f64)> = ring[far..].iter().copied().chain(std::iter::once(first)).collect();
    kept.extend(simplified_line(&back, tolerance));
    kept.pop();
    kept
}

fn within_most_corners(hull: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    let mut tolerance = SIMPLIFIED_TO_M;
    let mut ring = hull.clone();
    while ring.len() > MOST_CORNERS {
        ring = simplified_ring(&hull, tolerance);
        tolerance *= LOOSER_BY;
    }
    ring
}

pub(super) fn footprint_of(cell: &Cell, plane: &LocalPlane) -> Option<Vec<(f64, f64)>> {
    let mut shown: Vec<&Bin> = cell.bins.iter().filter(|bin| bin.serving_weight_milli > 0 && bin.may_be_shown()).collect();
    shown.sort_by(|a, b| b.serving_weight_milli.cmp(&a.serving_weight_milli).then(a.square.cmp(&b.square)));
    let total: i64 = shown.iter().map(|bin| bin.serving_weight_milli).sum();
    let mut held: i64 = 0;
    let mut points = vec![(0.0, 0.0)];
    for bin in shown {
        if (held as f64) >= total as f64 * FOOTPRINT_SHARE {
            break;
        }
        held += bin.serving_weight_milli;
        points.extend(square_corners(bin.square, plane));
    }
    let ring = within_most_corners(convex_hull(points));
    (ring.len() >= 3).then_some(ring)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doubled_area(ring: &[(f64, f64)]) -> f64 {
        (0..ring.len())
            .map(|index| {
                let (a, b) = (ring[index], ring[(index + 1) % ring.len()]);
                a.0 * b.1 - b.0 * a.1
            })
            .sum()
    }

    #[test]
    fn the_hull_starts_at_the_station_and_runs_counter_clockwise() {
        let points = vec![(0.0, 0.0), (100.0, 10.0), (100.0, -10.0), (120.0, 0.0), (90.0, 0.0), (110.0, 2.0)];
        let hull = convex_hull(points);
        assert!(hull.contains(&(0.0, 0.0)));
        assert!(!hull.contains(&(90.0, 0.0)) && !hull.contains(&(110.0, 2.0)));
        assert_eq!(hull.len(), 4);
        assert!(doubled_area(&hull) > 0.0, "edges probe outwards only on a counter-clockwise ring");
    }

    #[test]
    fn a_hull_with_too_many_corners_is_simplified_and_stays_counter_clockwise() {
        let circle: Vec<(f64, f64)> =
            (0..200).map(|step| f64::from(step) / 200.0 * std::f64::consts::TAU).map(|angle| (500.0 * angle.cos(), 500.0 * angle.sin())).collect();
        let ring = within_most_corners(convex_hull(circle));
        assert!(ring.len() >= 3 && ring.len() <= MOST_CORNERS);
        assert!(doubled_area(&ring) > 0.0);
    }
}
