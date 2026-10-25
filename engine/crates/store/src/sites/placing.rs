use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use deadpool_postgres::Object;
use engine_estimate::Estimate;
use engine_estimate::input::Site;

use crate::StoreError;
use crate::calibrated::Calibrated;
use crate::sites::grouping::{Facts, GroupFit, find_neighbourhoods, fit_groups, load_facts, write_groups};
use crate::sites::inputs::load_inputs;
use crate::sites::snapping::{Nearby, Shown, SnapRow, candidates_for, load_nearby, snap_rows, write_snap_tests};
use crate::sites::{SiteInput, in_parallel, own_estimate};

#[derive(Debug, Clone, Copy)]
pub(crate) struct Rules {
    pub matched_sites: bool,
}

const SNAPPING: Rules = Rules { matched_sites: false };

pub(crate) async fn place_sites(
    client: &mut Object,
    calibrated: &Arc<Calibrated>,
    mates: &BTreeSet<i32>,
    estimated: &[(&SiteInput, &Estimate)],
) -> Result<(), StoreError> {
    let neighbourhoods = find_neighbourhoods(&***client, mates, SNAPPING).await?;
    let everyone: Vec<i32> = neighbourhoods.iter().flatten().copied().collect();
    let fresh: BTreeSet<i32> = estimated.iter().map(|(input, _)| input.site_id).collect();
    let others: Vec<i32> = everyone.iter().filter(|&id| !fresh.contains(id)).copied().collect();
    let (facts, other_inputs) = tokio::try_join!(load_facts(&***client, &everyone), load_inputs(&***client, &others, calibrated))?;
    let recomputed = in_parallel(other_inputs, calibrated.clone(), own_estimate).await?;
    let mut sites: BTreeMap<i32, (&Site, &Estimate)> = estimated.iter().map(|(input, estimate)| (input.site_id, (&input.site, *estimate))).collect();
    sites.extend(recomputed.iter().filter_map(|(input, estimate)| Some((input.site_id, (&input.site, estimate.as_ref()?)))));

    let groups = fit_groups(&neighbourhoods, &sites, &facts, SNAPPING, &calibrated.context)?;
    let shown = shown_estimates(&groups, &sites, &facts);
    let nearby = load_nearby(&***client, &shown.iter().map(|(shown, _, _)| shown).collect::<Vec<_>>(), SNAPPING).await?;
    let snaps: Vec<SnapRow> = tokio::task::block_in_place(|| {
        shown
            .iter()
            .flat_map(|(shown, site, estimate)| {
                let candidates = candidates_for(shown, nearby.get(&shown.lead).unwrap_or(&Nearby::default()));
                snap_rows(shown.lead, site, estimate, &candidates, calibrated)
            })
            .collect()
    });

    let transaction = client.transaction().await?;
    write_groups(&transaction, &everyone, &groups, calibrated.run_id).await?;
    write_snap_tests(&transaction, &everyone, &snaps).await?;
    transaction.commit().await?;
    Ok(())
}

fn shown_estimates<'a>(
    groups: &'a [GroupFit],
    sites: &BTreeMap<i32, (&'a Site, &'a Estimate)>,
    facts: &BTreeMap<i32, Facts>,
) -> Vec<(Shown, &'a Site, &'a Estimate)> {
    let grouped: BTreeSet<i32> = groups.iter().flat_map(|group| group.members.iter().copied()).collect();
    let mut shown: Vec<(Shown, &Site, &Estimate)> = groups
        .iter()
        .filter_map(|group| {
            Some((shown_of(group.lead, group.members.clone(), &group.estimate, facts.get(&group.lead)?), &group.site, &group.estimate))
        })
        .collect();
    shown.extend(
        sites
            .iter()
            .filter(|(id, _)| !grouped.contains(*id))
            .filter_map(|(&id, &(site, estimate))| Some((shown_of(id, vec![id], estimate, facts.get(&id)?), site, estimate))),
    );
    shown
}

fn shown_of(lead: i32, members: Vec<i32>, estimate: &Estimate, facts: &Facts) -> Shown {
    Shown { lead, members, point: estimate.point, uncertainty_m: estimate.uncertainty_m, plmn: facts.plmn.clone(), operator_id: facts.operator_id }
}
