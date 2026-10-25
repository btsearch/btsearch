use std::collections::{BTreeMap, BTreeSet};

use engine_estimate::group::{combined, form_groups};
use engine_estimate::input::{Context, Site};
use engine_estimate::{ALGORITHM_VERSION, Estimate};
use engine_geo::plane::METERS_PER_DEGREE;
use futures_util::future::try_join_all;
use tokio_postgres::{GenericClient, Transaction};

use crate::StoreError;
use crate::parallel::on_every_core;
use crate::reported_codes::REPORTED_CODES;
use crate::sites::copies::connected_components;
use crate::sites::placing::Rules;
use crate::sites::writes::{group_estimate_statement, insert_estimate};

const MOST_GROUPING_RADIUS_M: i32 = 5_000;
const MOST_SITES_FOUND: usize = 512;
const MOST_SITES_GROUPED_TOGETHER: usize = 64;

fn grouping_neighbours_statement() -> String {
    format!(
        "SELECT s.id, o.id
         FROM observations.observed_sites s
         JOIN observations.site_estimates e ON e.observed_site_id = s.id AND e.algorithm_version = $2
         LEFT JOIN {REPORTED_CODES} sp ON sp.reported_code = s.plmn
         JOIN observations.site_estimates oe ON oe.algorithm_version = $2 AND oe.observed_site_id <> s.id
           AND ST_DWithin(oe.point, e.point, (e.uncertainty_m + $3) / ($4 * cos(radians(ST_Y(e.point)))))
         JOIN observations.observed_sites o ON o.id = oe.observed_site_id AND o.retired_at IS NULL
         LEFT JOIN {REPORTED_CODES} op ON op.reported_code = o.plmn
         WHERE s.id = ANY($1)
           AND (o.plmn = s.plmn OR op.operator_id = sp.operator_id)
           AND ST_DistanceSphere(oe.point, e.point) <= e.uncertainty_m + oe.uncertainty_m
           AND e.alternative_point IS NULL AND e.is_consistent AND e.uncertainty_m <= $3
           AND oe.alternative_point IS NULL AND oe.is_consistent AND oe.uncertainty_m <= $3
           AND ($5 OR NOT EXISTS (SELECT 1 FROM observations.site_links l WHERE l.observed_site_id IN (s.id, o.id) AND l.kind = 'matched'))
         ORDER BY 1, 2"
    )
}

#[derive(Debug, Clone)]
pub(crate) struct Facts {
    pub plmn: String,
    rat: Option<String>,
    node_id: Option<i64>,
    station_id: Option<i32>,
    pub operator_id: Option<i32>,
    pub is_matched: bool,
}

impl Facts {
    fn identity(&self) -> (&str, Option<i32>, Option<&str>, Option<i64>) {
        (self.plmn.as_str(), self.station_id, self.rat.as_deref(), self.node_id)
    }
}

pub(crate) struct GroupFit {
    pub lead: i32,
    pub members: Vec<i32>,
    pub site: Site,
    pub estimate: Estimate,
}

pub(crate) async fn load_group_mates(client: &impl GenericClient, site_ids: &[i32]) -> Result<BTreeSet<i32>, StoreError> {
    let rows = client
        .query(
            "SELECT g.observed_site_id, g.lead_site_id FROM observations.site_groups g
             WHERE g.algorithm_version = $2 AND g.lead_site_id IN (
               SELECT lead_site_id FROM observations.site_groups WHERE observed_site_id = ANY($1) AND algorithm_version = $2
             )",
            &[&site_ids, &ALGORITHM_VERSION],
        )
        .await?;
    Ok(rows.iter().flat_map(|row| [row.get::<_, i32>(0), row.get(1)]).chain(site_ids.iter().copied()).collect())
}

pub(crate) async fn load_facts(client: &impl GenericClient, site_ids: &[i32]) -> Result<BTreeMap<i32, Facts>, StoreError> {
    let rows = client
        .query(
            &format!(
                "SELECT s.id, s.plmn, s.rat::text, s.node_id, p.operator_id,
                   EXISTS (SELECT 1 FROM observations.site_links l WHERE l.observed_site_id = s.id AND l.kind = 'matched'), s.station_id
                 FROM observations.observed_sites s LEFT JOIN {REPORTED_CODES} p ON p.reported_code = s.plmn
                 WHERE s.id = ANY($1) AND s.retired_at IS NULL"
            ),
            &[&site_ids],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|row| {
            let facts = Facts {
                plmn: row.get(1),
                rat: row.get(2),
                node_id: row.get(3),
                station_id: row.get(6),
                operator_id: row.get(4),
                is_matched: row.get(5),
            };
            (row.get(0), facts)
        })
        .collect())
}

pub(crate) async fn find_neighbourhoods(client: &impl GenericClient, seeds: &BTreeSet<i32>, rules: Rules) -> Result<Vec<BTreeSet<i32>>, StoreError> {
    let mut found = seeds.clone();
    let mut frontier: Vec<i32> = seeds.iter().copied().collect();
    let mut links: Vec<(i32, i32)> = Vec::new();
    let statement = grouping_neighbours_statement();
    while !frontier.is_empty() && found.len() < MOST_SITES_FOUND {
        let rows =
            client.query(&statement, &[&frontier, &ALGORITHM_VERSION, &MOST_GROUPING_RADIUS_M, &METERS_PER_DEGREE, &rules.matched_sites]).await?;
        frontier = Vec::new();
        for row in &rows {
            let (from, to): (i32, i32) = (row.get(0), row.get(1));
            links.push((from, to));
            if found.insert(to) {
                frontier.push(to);
            }
        }
    }
    let ids: Vec<i32> = found.into_iter().collect();
    Ok(connected_components(&ids, links).into_iter().map(|neighbourhood| neighbourhood.into_iter().collect::<BTreeSet<i32>>()).collect())
}

fn may_group(estimate: &Estimate, facts: &Facts, rules: Rules) -> bool {
    (rules.matched_sites || !facts.is_matched)
        && estimate.alternative_point.is_none()
        && estimate.is_consistent
        && estimate.uncertainty_m <= MOST_GROUPING_RADIUS_M
}

pub(crate) fn fit_groups(
    neighbourhoods: &[BTreeSet<i32>],
    sites: &BTreeMap<i32, (&Site, &Estimate)>,
    facts: &BTreeMap<i32, Facts>,
    rules: Rules,
    context: &Context,
) -> Result<Vec<GroupFit>, StoreError> {
    let chunks: Vec<Vec<i32>> = neighbourhoods
        .iter()
        .flat_map(|neighbourhood| {
            let mut members: Vec<i32> = neighbourhood
                .iter()
                .filter(|&id| sites.get(id).zip(facts.get(id)).is_some_and(|((_, estimate), facts)| may_group(estimate, facts, rules)))
                .copied()
                .collect();
            members.sort_by(|a, b| facts[a].identity().cmp(&facts[b].identity()));
            members.chunks(MOST_SITES_GROUPED_TOGETHER).filter(|chunk| chunk.len() > 1).map(<[i32]>::to_vec).collect::<Vec<_>>()
        })
        .collect();

    let fits = tokio::task::block_in_place(|| {
        on_every_core(&chunks, |chunk| {
            let members: Vec<(&Site, &Estimate)> = chunk.iter().map(|id| sites[id]).collect();
            form_groups(&members, context)
                .into_iter()
                .filter(|group| group.members.len() > 1)
                .map(|group| {
                    let ids: Vec<i32> = group.members.iter().map(|&index| chunk[index]).collect();
                    let lead = ids.iter().copied().min().expect("a group has at least two members");
                    let site = combined(&group.members.iter().map(|&index| members[index].0).collect::<Vec<_>>());
                    GroupFit { lead, members: ids, site, estimate: group.estimate }
                })
                .collect::<Vec<_>>()
        })
    });
    let fits = fits.ok_or_else(|| StoreError::data("a grouping thread stopped before it finished"))?;
    Ok(fits.into_iter().flatten().collect())
}

pub(crate) async fn write_groups(
    transaction: &Transaction<'_>,
    affected: &[i32],
    groups: &[GroupFit],
    run_id: Option<i32>,
) -> Result<(), StoreError> {
    transaction
        .execute("DELETE FROM observations.site_groups WHERE observed_site_id = ANY($1) AND algorithm_version = $2", &[&affected, &ALGORITHM_VERSION])
        .await?;
    transaction
        .execute("DELETE FROM observations.group_estimates WHERE lead_site_id = ANY($1) AND algorithm_version = $2", &[&affected, &ALGORITHM_VERSION])
        .await?;
    let insert = transaction.prepare(&group_estimate_statement()).await?;
    try_join_all(groups.iter().map(|group| insert_estimate(transaction, &insert, group.lead, &group.estimate, run_id, &[]))).await?;
    let mut rows: Vec<(i32, i32)> = groups.iter().flat_map(|group| group.members.iter().map(|&member| (member, group.lead))).collect();
    rows.sort_unstable();
    let (members, leads): (Vec<i32>, Vec<i32>) = rows.into_iter().unzip();
    transaction
        .execute(
            "INSERT INTO observations.site_groups (observed_site_id, algorithm_version, lead_site_id)
             SELECT member, $3::int2, lead FROM unnest($1::int[], $2::int[]) AS t(member, lead)",
            &[&members, &leads, &ALGORITHM_VERSION],
        )
        .await?;
    Ok(())
}
