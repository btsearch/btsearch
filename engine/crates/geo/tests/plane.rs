use engine_geo::Point;
use engine_geo::plane::{LocalPlane, bearing_degrees, distance_meters};

const WARSAW: Point = Point { latitude: 52.2297, longitude: 21.0122 };
const KRAKOW: Point = Point { latitude: 50.0647, longitude: 19.9450 };

#[test]
fn distances_are_great_circle_distances() {
    assert!((distance_meters(WARSAW, KRAKOW) - 251_976.93).abs() < 0.5);
    assert!((distance_meters(Point::new(0.0, 0.0), Point::new(1.0, 0.0)) - 111_195.08).abs() < 0.05);
    assert_eq!(distance_meters(WARSAW, WARSAW), 0.0);
}

#[test]
fn bearings_turn_clockwise_from_north() {
    let origin = Point::new(0.0, 0.0);
    for (to, bearing) in [(Point::new(1.0, 0.0), 0.0), (Point::new(0.0, 1.0), 90.0), (Point::new(-1.0, 0.0), 180.0), (Point::new(0.0, -1.0), 270.0)] {
        assert!((bearing_degrees(origin, to) - bearing).abs() < 1e-9, "{to:?}");
    }
    assert!((bearing_degrees(WARSAW, KRAKOW) - 197.0).abs() < 1.0);
}

#[test]
fn a_local_plane_keeps_short_distances() {
    let plane = LocalPlane::around(WARSAW);
    let nearby = Point::new(52.2350, 21.0200);
    let (east, north) = plane.to_plane(nearby);
    assert!((east.hypot(north) - distance_meters(WARSAW, nearby)).abs() < 0.5);
    let back = plane.to_point(east, north);
    assert!((back.latitude - nearby.latitude).abs() < 1e-12 && (back.longitude - nearby.longitude).abs() < 1e-12);
}
