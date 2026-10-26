use engine_geo::Point;
use engine_geo::plane::distance_meters;

use crate::confidence::tempered;
use crate::input::{Context, Handover, Site};
use crate::objective::{CellParameters, Problem};
use crate::search::fit_parameters;
use crate::{Estimate, estimate};

pub const GROUPING_THRESHOLD: f64 = 2.0;
const REFIT_SWEEPS: usize = 2;

fn may_join(excess_cost: f64, joint_ellipse_scale: f64) -> bool {
    tempered(excess_cost, joint_ellipse_scale) <= GROUPING_THRESHOLD
}

pub fn combined(sites: &[&Site]) -> Site {
    let mut cells = Vec::new();
    let mut handovers = Vec::new();
    for site in sites {
        let offset = cells.len();
        cells.extend(site.cells.iter().cloned());
        handovers.extend(site.handovers.iter().map(|handover| Handover {
            from_cell: handover.from_cell + offset,
            to_cell: handover.to_cell + offset,
            ..*handover
        }));
    }
    Site {
        cells,
        handovers,
        contributor_count: sites.iter().map(|site| site.contributor_count).max().unwrap_or(0),
        person_count: sites.iter().map(|site| site.person_count).max().unwrap_or(0),
    }
}

pub(crate) fn cost_at(site: &Site, context: &Context, point: Point, start: &[CellParameters]) -> Option<f64> {
    let problem = Problem::new(site, context)?;
    let (east, north) = problem.plane.to_plane(point);
    let parameters = fit_parameters(&problem, east, north, start, REFIT_SWEEPS);
    Some(problem.total_cost(east, north, &parameters))
}

pub fn joint_cost(members: &[&Site], joint: &Estimate, context: &Context) -> Option<f64> {
    let parameters = joint.cell_parameters();
    let mut offset = 0;
    let mut total = 0.0;
    for site in members {
        let start = parameters.get(offset..offset + site.cells.len())?;
        offset += site.cells.len();
        total += cost_at(site, context, joint.point, start)?;
    }
    Some(total)
}

pub struct Group {
    pub members: Vec<usize>,
    pub estimate: Estimate,
    pub cost: f64,
}

pub fn form_groups(sites: &[(&Site, &Estimate)], context: &Context) -> Vec<Group> {
    let mut groups: Vec<Group> = Vec::new();
    for (index, &(site, own)) in sites.iter().enumerate() {
        let joined = groups.iter_mut().find_map(|group| {
            let apart = distance_meters(group.estimate.point, own.point);
            if apart > f64::from(group.estimate.uncertainty_m + own.uncertainty_m) {
                return None;
            }
            let members: Vec<&Site> = group.members.iter().map(|&member| sites[member].0).chain(std::iter::once(site)).collect();
            let joint = estimate(&combined(&members), context)?;
            let cost = joint_cost(&members, &joint, context)?;
            may_join(cost - (group.cost + own.cost), joint.ellipse_scale).then_some((group, joint, cost))
        });
        match joined {
            Some((group, joint, cost)) => {
                group.members.push(index);
                group.estimate = joint;
                group.cost = cost;
            }
            None => groups.push(Group { members: vec![index], estimate: own.clone(), cost: own.cost }),
        }
    }
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cost_that_keeps_sites_apart_at_the_nominal_ellipse_lets_them_join_when_the_ellipse_is_twice_as_wide() {
        let excess_cost = 3.0;
        assert!(!may_join(excess_cost, 1.0));
        assert!(may_join(excess_cost, 2.0), "a fit that overstates its precision twice overstates its cost differences four times");
    }
}
