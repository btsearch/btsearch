use crate::Point;

const EARTH_RADIUS_METERS: f64 = 6_371_008.8;
pub const METERS_PER_DEGREE: f64 = EARTH_RADIUS_METERS * std::f64::consts::PI / 180.0;

pub fn distance_meters(from: Point, to: Point) -> f64 {
    let (from_latitude, to_latitude) = (from.latitude.to_radians(), to.latitude.to_radians());
    let half_latitude = (to_latitude - from_latitude) / 2.0;
    let half_longitude = (to.longitude - from.longitude).to_radians() / 2.0;
    let chord = half_latitude.sin().powi(2) + from_latitude.cos() * to_latitude.cos() * half_longitude.sin().powi(2);
    2.0 * EARTH_RADIUS_METERS * chord.sqrt().min(1.0).asin()
}

pub fn bearing_degrees(from: Point, to: Point) -> f64 {
    let (from_latitude, to_latitude) = (from.latitude.to_radians(), to.latitude.to_radians());
    let longitude = (to.longitude - from.longitude).to_radians();
    let east = longitude.sin() * to_latitude.cos();
    let north = from_latitude.cos() * to_latitude.sin() - from_latitude.sin() * to_latitude.cos() * longitude.cos();
    east.atan2(north).to_degrees().rem_euclid(360.0)
}

#[derive(Debug, Clone, Copy)]
pub struct LocalPlane {
    origin: Point,
    meters_per_longitude_degree: f64,
}

impl LocalPlane {
    pub fn around(origin: Point) -> Self {
        Self { origin, meters_per_longitude_degree: METERS_PER_DEGREE * origin.latitude.to_radians().cos() }
    }

    pub fn to_plane(&self, point: Point) -> (f64, f64) {
        let east = (point.longitude - self.origin.longitude) * self.meters_per_longitude_degree;
        let north = (point.latitude - self.origin.latitude) * METERS_PER_DEGREE;
        (east, north)
    }

    pub fn to_point(&self, east: f64, north: f64) -> Point {
        Point::new(self.origin.latitude + north / METERS_PER_DEGREE, self.origin.longitude + east / self.meters_per_longitude_degree)
    }
}
