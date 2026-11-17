use std::collections::{BTreeMap, BTreeSet};

use engine_geo::Point;
use engine_geo::plane::distance_meters;
use engine_geo::square::square_centre;

use crate::confidence::tempered;
use crate::group::{GROUPING_THRESHOLD, cost_at};
use crate::input::{Cell, Context, Handover, Site, Technology};
use crate::objective::CellParameters;
use crate::{Estimate, estimate};

const SPLIT_THRESHOLD: f64 = GROUPING_THRESHOLD;
const LEAST_TESTED_CELLS: usize = 2;
const PLACE_WITHIN_M: f64 = 3_000.0;
const PARTS_APART_M: f64 = 3_000.0;

pub type Cut = Vec<Vec<usize>>;

#[derive(Debug, Clone, PartialEq)]
pub struct Split {
    pub parts: Cut,
    pub estimates: Vec<Estimate>,
    pub gain: f64,
}

struct Place {
    centre: Point,
    weight: f64,
    cells: Vec<usize>,
}

fn part_of(site: &Site, cells: &[usize]) -> Site {
    let position_of = |cell: usize| cells.iter().position(|&kept| kept == cell);
    Site {
        cells: cells.iter().map(|&cell| site.cells[cell].clone()).collect(),
        handovers: site
            .handovers
            .iter()
            .filter_map(|handover| {
                Some(Handover { from_cell: position_of(handover.from_cell)?, to_cell: position_of(handover.to_cell)?, ..*handover })
            })
            .collect(),
        contributor_count: site.contributor_count,
        person_count: site.person_count,
    }
}

fn shares_channel_and_pci(site: &Site, pcis: &[Option<i32>], cells: &[usize]) -> bool {
    let mut seen = BTreeSet::new();
    cells.iter().any(|&cell| {
        let input = &site.cells[cell];
        match (input.channel, pcis.get(cell).copied().flatten()) {
            (Some(channel), Some(pci)) => !seen.insert((input.technology, channel, pci)),
            _ => false,
        }
    })
}

fn may_span_places(site: &Site, whole: &Estimate, pcis: &[Option<i32>]) -> bool {
    let every_cell: Vec<usize> = (0..site.cells.len()).collect();
    site.cells.len() >= LEAST_TESTED_CELLS && (!whole.is_consistent() || shares_channel_and_pci(site, pcis, &every_cell))
}

fn serving_centre(cell: &Cell) -> Option<(Point, f64)> {
    let (latitude, longitude, total) =
        cell.bins.iter().filter(|bin| bin.serving_weight_milli > 0).fold((0.0, 0.0, 0.0), |(latitude, longitude, total), bin| {
            let centre = square_centre(bin.square);
            let weight = bin.serving_weight_milli as f64;
            (latitude + centre.latitude * weight, longitude + centre.longitude * weight, total + weight)
        });
    (total > 0.0).then(|| (Point::new(latitude / total, longitude / total), total))
}

fn cut_by_places(site: &Site) -> Cut {
    let centres: Vec<Option<(Point, f64)>> = site.cells.iter().map(serving_centre).collect();
    let mut placed: Vec<(usize, Point, f64)> =
        centres.iter().enumerate().filter_map(|(cell, centre)| centre.map(|(point, weight)| (cell, point, weight))).collect();
    placed.sort_by(|a, b| b.2.total_cmp(&a.2).then(a.0.cmp(&b.0)));

    let mut places: Vec<Place> = Vec::new();
    for (cell, centre, weight) in placed {
        match places.iter_mut().find(|place| distance_meters(place.centre, centre) <= PLACE_WITHIN_M) {
            Some(place) => {
                let total = place.weight + weight;
                place.centre = Point::new(
                    (place.centre.latitude * place.weight + centre.latitude * weight) / total,
                    (place.centre.longitude * place.weight + centre.longitude * weight) / total,
                );
                place.weight = total;
                place.cells.push(cell);
            }
            None => places.push(Place { centre, weight, cells: vec![cell] }),
        }
    }

    let unplaced: Vec<usize> = centres.iter().enumerate().filter(|(_, centre)| centre.is_none()).map(|(cell, _)| cell).collect();
    match places.iter_mut().max_by(|a, b| a.weight.total_cmp(&b.weight)) {
        Some(heaviest) => heaviest.cells.extend(unplaced),
        None => return vec![unplaced],
    }
    places.into_iter().map(|place| place.cells).collect()
}

fn cut_by_disagreeing_cells(site: &Site, whole: &Estimate) -> Cut {
    let (disagreeing, agreeing): (Vec<usize>, Vec<usize>) = (0..site.cells.len()).partition(|cell| whole.disagreeing_cells.contains(cell));
    vec![agreeing, disagreeing]
}

fn is_node_technology(technology: Technology) -> bool {
    matches!(technology, Technology::Lte | Technology::Nr)
}

fn cut_by_area_codes(site: &Site, area_codes: &[Option<i32>]) -> Cut {
    let mut by_code: BTreeMap<i32, Vec<usize>> = BTreeMap::new();
    let mut without_node_code = Vec::new();
    for (cell, input) in site.cells.iter().enumerate() {
        match area_codes.get(cell).copied().flatten() {
            Some(area_code) if is_node_technology(input.technology) => by_code.entry(area_code).or_default().push(cell),
            _ => without_node_code.push(cell),
        }
    }
    let mut parts: Cut = by_code.into_values().collect();
    match parts.iter_mut().max_by_key(|part| part.len()) {
        Some(largest) => largest.extend(without_node_code),
        None => parts.push(without_node_code),
    }
    parts
}

fn normalised(parts: Cut) -> Cut {
    let mut parts: Cut = parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .map(|mut part| {
            part.sort_unstable();
            part
        })
        .collect();
    parts.sort();
    parts
}

pub fn candidate_cuts(site: &Site, whole: &Estimate, pcis: &[Option<i32>], area_codes: &[Option<i32>]) -> Vec<Cut> {
    let mut cuts: Vec<Cut> = Vec::new();
    for cut in [cut_by_places(site), cut_by_disagreeing_cells(site, whole), cut_by_area_codes(site, area_codes)] {
        let cut = normalised(cut);
        if cut.len() >= 2 && !cut.iter().any(|part| shares_channel_and_pci(site, pcis, part)) && !cuts.contains(&cut) {
            cuts.push(cut);
        }
    }
    cuts
}

fn lie_apart(one: &Estimate, other: &Estimate) -> bool {
    distance_meters(one.point, other.point) > PARTS_APART_M.max(f64::from(one.uncertainty_m + other.uncertainty_m))
}

fn accepted_split(site: &Site, whole: &Estimate, parts: &[Vec<usize>], context: &Context) -> Option<Split> {
    let parameters = whole.cell_parameters();
    let mut estimates = Vec::with_capacity(parts.len());
    let mut excess_cost = 0.0;
    for cells in parts {
        let part = part_of(site, cells);
        let own = estimate(&part, context)?;
        let start: Vec<CellParameters> = cells.iter().map(|&cell| parameters.get(cell).copied()).collect::<Option<_>>()?;
        excess_cost += cost_at(&part, context, whole.point, &start)? - own.cost;
        estimates.push(own);
    }
    let gain = tempered(excess_cost, whole.ellipse_scale);
    let apart = estimates.iter().enumerate().all(|(index, one)| estimates[index + 1..].iter().all(|other| lie_apart(one, other)));
    (gain > SPLIT_THRESHOLD && apart).then(|| Split { parts: parts.to_vec(), estimates, gain })
}

pub fn best_split(site: &Site, whole: &Estimate, cuts: &[Cut], context: &Context) -> Option<Split> {
    cuts.iter().filter_map(|parts| accepted_split(site, whole, parts, context)).max_by(|a, b| a.gain.total_cmp(&b.gain))
}

pub fn find_split(site: &Site, whole: &Estimate, pcis: &[Option<i32>], area_codes: &[Option<i32>], context: &Context) -> Option<Split> {
    if !may_span_places(site, whole, pcis) {
        return None;
    }
    best_split(site, whole, &candidate_cuts(site, whole, pcis, area_codes), context)
}
