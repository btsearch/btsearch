use std::f64::consts::PI;

use crate::Point;
use crate::plane::LocalPlane;

pub const SQUARE_ZOOM: u8 = 20;
const MAX_LATITUDE: f64 = 85.051_128_779_806_59;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Tile {
    pub zoom: u8,
    pub x: u32,
    pub y: u32,
}

impl Tile {
    pub fn at(point: Point, zoom: u8) -> Self {
        let size = f64::from(1_u32 << zoom);
        let latitude = point.latitude.clamp(-MAX_LATITUDE, MAX_LATITUDE).to_radians();
        let x = (point.longitude + 180.0) / 360.0 * size;
        let y = (0.5 - ((1.0 + latitude.sin()) / (1.0 - latitude.sin())).ln() / (4.0 * PI)) * size;
        let last = size - 1.0;
        Self { zoom, x: x.clamp(0.0, last) as u32, y: y.clamp(0.0, last) as u32 }
    }

    pub fn quadkey(self) -> u64 {
        (0..self.zoom).rev().fold(0, |key, level| {
            let digit = (u64::from((self.y >> level) & 1) << 1) | u64::from((self.x >> level) & 1);
            (key << 2) | digit
        })
    }

    pub fn from_quadkey(key: u64, zoom: u8) -> Self {
        let (x, y) = (0..zoom).fold((0, 0), |(x, y), level| {
            let digit = key >> (2 * u32::from(level));
            (x | (u32::from(digit & 1 == 1) << level), y | (u32::from(digit & 2 == 2) << level))
        });
        Self { zoom, x, y }
    }

    pub fn centre(self) -> Point {
        position_in_tiles(self.zoom, f64::from(self.x) + 0.5, f64::from(self.y) + 0.5)
    }
}

pub fn tile_corner(zoom: u8, x: u32, y: u32) -> Point {
    position_in_tiles(zoom, f64::from(x), f64::from(y))
}

fn position_in_tiles(zoom: u8, x: f64, y: f64) -> Point {
    let size = f64::from(1_u32 << zoom);
    let longitude = x / size * 360.0 - 180.0;
    let latitude = (PI * (1.0 - 2.0 * y / size)).sinh().atan().to_degrees();
    Point::new(latitude, longitude)
}

pub fn square_at(point: Point) -> u64 {
    Tile::at(point, SQUARE_ZOOM).quadkey()
}

pub fn parent(square: u64, zoom: u8) -> u64 {
    square >> (2 * u32::from(SQUARE_ZOOM - zoom))
}

pub fn square_centre(square: u64) -> Point {
    Tile::from_quadkey(square, SQUARE_ZOOM).centre()
}

pub fn offset_centimetres(square: u64, point: Point) -> (i32, i32) {
    let (east, north) = LocalPlane::around(square_centre(square)).to_plane(point);
    ((east * 100.0).round() as i32, (north * 100.0).round() as i32)
}
