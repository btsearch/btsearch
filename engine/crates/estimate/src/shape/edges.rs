use std::collections::{BTreeMap, BTreeSet};

use engine_geo::Point;
use engine_geo::plane::LocalPlane;
use engine_geo::square::{Tile, square_centre};

use crate::input::{CENTI_PER_UNIT, Cell, Technology};
use crate::search::distance_between;
use crate::shape::Shape;

pub const EDGE_ZOOM: u8 = 18;
pub const EDGE_DAYS: i32 = 365;
const EDGE_STEP_M: f64 = 25.0;
const FADED_REACH_M: f64 = 100.0;
const GSM_FADED_BELOW_DBM: f64 = -107.0;
const UMTS_FADED_BELOW_DBM: f64 = -115.0;
const LTE_FADED_BELOW_DBM: f64 = -115.0;
const NR_FADED_BELOW_DBM: f64 = -110.0;
const EQUATOR_M: f64 = 40_075_016.686;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum EdgeKind {
    HandedOver,
    Faded,
    OtherLayer,
    Unmeasured,
}

impl EdgeKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::HandedOver => "handedOver",
            Self::Faded => "faded",
            Self::OtherLayer => "otherLayer",
            Self::Unmeasured => "unmeasured",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Beyond {
    SameLayer,
    OtherLayersOnly,
    Nobody,
}

pub trait Surroundings {
    fn beyond(&self, square: u64, cell: &Cell) -> Beyond;
}

#[derive(Debug, Clone, PartialEq)]
pub struct Edge {
    pub kind: EdgeKind,
    pub pieces: Vec<Vec<Point>>,
    pub length_m: i32,
}

struct Probe {
    start: (f64, f64),
    end: (f64, f64),
    middle: (f64, f64),
    beyond: u64,
}

fn edge_square_m(latitude: f64) -> f64 {
    EQUATOR_M * latitude.to_radians().cos() / f64::from(1_u32 << EDGE_ZOOM)
}

fn probes(shape: &Shape, plane: &LocalPlane) -> Vec<Probe> {
    let ring: Vec<(f64, f64)> = shape.footprint.iter().map(|&point| plane.to_plane(point)).collect();
    let mut probes = Vec::new();
    for index in 0..ring.len() {
        let (from, to) = (ring[index], ring[(index + 1) % ring.len()]);
        let length = distance_between(from, to);
        if length == 0.0 {
            continue;
        }
        let steps = (length / EDGE_STEP_M).ceil().max(1.0) as usize;
        let outward = ((to.1 - from.1) / length, -(to.0 - from.0) / length);
        let at = |share: f64| (from.0 + (to.0 - from.0) * share, from.1 + (to.1 - from.1) * share);
        for step in 0..steps {
            let middle = at((step as f64 + 0.5) / steps as f64);
            let reach = edge_square_m(plane.to_point(middle.0, middle.1).latitude);
            let beyond = plane.to_point(middle.0 + outward.0 * reach, middle.1 + outward.1 * reach);
            probes.push(Probe {
                start: at(step as f64 / steps as f64),
                end: at((step + 1) as f64 / steps as f64),
                middle,
                beyond: Tile::at(beyond, EDGE_ZOOM).quadkey(),
            });
        }
    }
    probes
}

pub fn edge_squares(shape: &Shape, site: Point) -> BTreeSet<u64> {
    probes(shape, &LocalPlane::around(site)).into_iter().map(|probe| probe.beyond).collect()
}

fn faded_below_dbm(technology: Technology) -> f64 {
    match technology {
        Technology::Gsm => GSM_FADED_BELOW_DBM,
        Technology::Umts => UMTS_FADED_BELOW_DBM,
        Technology::Lte => LTE_FADED_BELOW_DBM,
        Technology::Nr => NR_FADED_BELOW_DBM,
    }
}

pub fn edges_of(cell: &Cell, shape: &Shape, site: Point, surroundings: &impl Surroundings) -> Vec<Edge> {
    let plane = LocalPlane::around(site);
    let levels: Vec<((f64, f64), i64, i64)> = cell
        .bins
        .iter()
        .filter(|bin| bin.weight_milli > 0)
        .map(|bin| (plane.to_plane(square_centre(bin.square)), bin.level_wsum, bin.weight_milli))
        .collect();
    let faded_below = faded_below_dbm(cell.technology);
    let has_faded = |at: (f64, f64)| {
        let near = levels.iter().filter(|(place, _, _)| distance_between(*place, at) <= FADED_REACH_M);
        let (sum, weight) = near.fold((0, 0), |(sum, weight), &(_, level_wsum, weight_milli)| {
            (sum + level_wsum, weight + weight_milli)
        });
        weight > 0 && (sum as f64 / weight as f64 / CENTI_PER_UNIT) < faded_below
    };

    let mut parts: Vec<(EdgeKind, (f64, f64), (f64, f64))> = probes(shape, &plane)
        .into_iter()
        .map(|probe| {
            let kind = match surroundings.beyond(probe.beyond, cell) {
                Beyond::SameLayer => EdgeKind::HandedOver,
                _ if has_faded(probe.middle) => EdgeKind::Faded,
                Beyond::OtherLayersOnly => EdgeKind::OtherLayer,
                Beyond::Nobody => EdgeKind::Unmeasured,
            };
            (kind, probe.start, probe.end)
        })
        .collect();

    let first_change = (0..parts.len())
        .position(|index| parts[index].0 != parts[(index + parts.len() - 1) % parts.len()].0)
        .unwrap_or(0);
    parts.rotate_left(first_change);
    let mut by_kind: BTreeMap<EdgeKind, (Vec<Vec<Point>>, f64)> = BTreeMap::new();
    let mut previous: Option<EdgeKind> = None;
    for (kind, start, end) in parts {
        let (pieces, length) = by_kind.entry(kind).or_default();
        let end_point = plane.to_point(end.0, end.1);
        match pieces.last_mut() {
            Some(piece) if previous == Some(kind) => piece.push(end_point),
            _ => pieces.push(vec![plane.to_point(start.0, start.1), end_point]),
        }
        *length += distance_between(start, end);
        previous = Some(kind);
    }
    by_kind
        .into_iter()
        .map(|(kind, (pieces, length))| Edge {
            kind,
            pieces,
            length_m: length.round() as i32,
        })
        .collect()
}
