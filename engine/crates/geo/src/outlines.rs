use std::collections::HashMap;

use serde::Deserialize;

use crate::Point;
use crate::plane::{LocalPlane, METERS_PER_DEGREE};

const GRID_DEGREES: f64 = 0.5;

#[derive(Debug, Clone)]
struct CountryPolygon {
    exterior: Vec<Point>,
    holes: Vec<Vec<Point>>,
}

impl CountryPolygon {
    fn contains(&self, point: Point) -> bool {
        ring_contains(&self.exterior, point) && !self.holes.iter().any(|hole| ring_contains(hole, point))
    }

    fn rings(&self) -> impl Iterator<Item = &Vec<Point>> {
        std::iter::once(&self.exterior).chain(&self.holes)
    }
}

#[derive(Debug, Clone)]
pub struct CountryOutline {
    country_code: String,
    polygons: Vec<CountryPolygon>,
}

#[derive(Deserialize)]
struct GeoJsonMultiPolygon {
    coordinates: Vec<Vec<Vec<[f64; 2]>>>,
}

impl CountryOutline {
    pub fn from_geojson(country_code: &str, geojson: &str) -> Result<Self, serde_json::Error> {
        let multi_polygon: GeoJsonMultiPolygon = serde_json::from_str(geojson)?;
        let to_ring = |ring: Vec<[f64; 2]>| ring.into_iter().map(|[longitude, latitude]| Point::new(latitude, longitude)).collect::<Vec<_>>();
        let polygons = multi_polygon
            .coordinates
            .into_iter()
            .filter_map(|rings| {
                let mut rings = rings.into_iter().map(to_ring);
                let exterior = rings.next()?;
                Some(CountryPolygon { exterior, holes: rings.collect() })
            })
            .collect();
        Ok(Self { country_code: country_code.to_owned(), polygons })
    }
}

type GridCell = (i32, i32);

struct Edge {
    outline: usize,
    from: Point,
    to: Point,
}

pub struct CountryOutlines {
    outlines: Vec<CountryOutline>,
    polygons_by_cell: HashMap<GridCell, Vec<(usize, usize)>>,
    edges_by_cell: HashMap<GridCell, Vec<Edge>>,
}

impl CountryOutlines {
    pub fn new(mut outlines: Vec<CountryOutline>) -> Self {
        outlines.sort_by(|first, second| first.country_code.cmp(&second.country_code));
        let mut polygons_by_cell: HashMap<GridCell, Vec<(usize, usize)>> = HashMap::new();
        let mut edges_by_cell: HashMap<GridCell, Vec<Edge>> = HashMap::new();
        for (outline_index, outline) in outlines.iter().enumerate() {
            for (polygon_index, polygon) in outline.polygons.iter().enumerate() {
                for cell in cells_covering(&polygon.exterior) {
                    polygons_by_cell.entry(cell).or_default().push((outline_index, polygon_index));
                }
                for ring in polygon.rings() {
                    for pair in ring.windows(2) {
                        let (from, to) = (pair[0], pair[1]);
                        for cell in cells_covering(&[from, to]) {
                            edges_by_cell.entry(cell).or_default().push(Edge { outline: outline_index, from, to });
                        }
                    }
                }
            }
        }
        Self { outlines, polygons_by_cell, edges_by_cell }
    }

    pub fn has(&self, country_code: &str) -> bool {
        self.outline_index(country_code).is_some()
    }

    pub fn country_at(&self, point: Point) -> Option<&str> {
        let candidates = self.polygons_by_cell.get(&grid_cell(point))?;
        candidates
            .iter()
            .find(|(outline, polygon)| self.outlines[*outline].polygons[*polygon].contains(point))
            .map(|(outline, _)| self.outlines[*outline].country_code.as_str())
    }

    pub fn is_within(&self, country_code: &str, point: Point, meters: f64) -> bool {
        let Some(outline) = self.outline_index(country_code) else {
            return false;
        };
        let inside = self.polygons_by_cell.get(&grid_cell(point)).is_some_and(|candidates| {
            candidates.iter().any(|(candidate, polygon)| *candidate == outline && self.outlines[outline].polygons[*polygon].contains(point))
        });
        if inside {
            return true;
        }

        let plane = LocalPlane::around(point);
        let latitude_reach = meters / METERS_PER_DEGREE;
        let longitude_reach = latitude_reach / point.latitude.to_radians().cos().max(0.01);
        let corners = [
            Point::new(point.latitude - latitude_reach, point.longitude - longitude_reach),
            Point::new(point.latitude + latitude_reach, point.longitude + longitude_reach),
        ];
        cells_covering(&corners).any(|cell| {
            self.edges_by_cell.get(&cell).is_some_and(|edges| {
                edges.iter().any(|edge| edge.outline == outline && distance_to_segment(&plane, edge.from, edge.to) <= meters)
            })
        })
    }

    fn outline_index(&self, country_code: &str) -> Option<usize> {
        self.outlines.binary_search_by(|outline| outline.country_code.as_str().cmp(country_code)).ok()
    }
}

fn grid_cell(point: Point) -> GridCell {
    ((point.longitude / GRID_DEGREES).floor() as i32, (point.latitude / GRID_DEGREES).floor() as i32)
}

fn cells_covering(points: &[Point]) -> impl Iterator<Item = GridCell> {
    let (mut west, mut south, mut east, mut north) = (i32::MAX, i32::MAX, i32::MIN, i32::MIN);
    for &point in points {
        let (x, y) = grid_cell(point);
        (west, south, east, north) = (west.min(x), south.min(y), east.max(x), north.max(y));
    }
    (west..=east).flat_map(move |x| (south..=north).map(move |y| (x, y)))
}

fn ring_contains(ring: &[Point], point: Point) -> bool {
    let Some(&last) = ring.last() else {
        return false;
    };
    let mut inside = false;
    let mut previous = last;
    for &current in ring {
        let crosses = (current.latitude > point.latitude) != (previous.latitude > point.latitude);
        if crosses {
            let crossing_longitude = (previous.longitude - current.longitude) * (point.latitude - current.latitude) / (previous.latitude - current.latitude) + current.longitude;
            if point.longitude < crossing_longitude {
                inside = !inside;
            }
        }
        previous = current;
    }
    inside
}

fn distance_to_segment(plane: &LocalPlane, from: Point, to: Point) -> f64 {
    let (from_east, from_north) = plane.to_plane(from);
    let (to_east, to_north) = plane.to_plane(to);
    let (east, north) = (to_east - from_east, to_north - from_north);
    let squared_length = east * east + north * north;
    let along = if squared_length == 0.0 { 0.0 } else { (-(from_east * east + from_north * north) / squared_length).clamp(0.0, 1.0) };
    (from_east + along * east).hypot(from_north + along * north)
}
