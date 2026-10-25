use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet};

use tokio_postgres::GenericClient;

use crate::StoreError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum CopyBasis {
    BroadcastList,
    SameReading,
    OurCell,
}

impl CopyBasis {
    pub fn label(self) -> &'static str {
        match self {
            Self::BroadcastList => "broadcastList",
            Self::SameReading => "sameReading",
            Self::OurCell => "ourCell",
        }
    }

    pub fn of_label(label: &str) -> Option<Self> {
        [Self::BroadcastList, Self::SameReading, Self::OurCell].into_iter().find(|basis| basis.label() == label)
    }
}

#[derive(Debug, Clone)]
pub struct Member {
    pub id: i32,
    pub plmn: String,
    pub rat: String,
    pub cell_key: i64,
    pub site_id: Option<i32>,
    pub matched_cell_id: Option<i32>,
    pub is_own_match: bool,
    pub listed_plmns: BTreeSet<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CopyOf {
    pub primary_cell_id: i32,
    pub basis: CopyBasis,
}

fn network_code(plmn: &str) -> u32 {
    plmn.parse().unwrap_or(u32::MAX)
}

fn root(parents: &mut BTreeMap<i32, i32>, id: i32) -> i32 {
    let parent = parents[&id];
    if parent == id {
        return id;
    }
    let top = root(parents, parent);
    parents.insert(id, top);
    top
}

pub(crate) fn connected_components(ids: &[i32], links: impl IntoIterator<Item = (i32, i32)>) -> Vec<Vec<i32>> {
    let mut parents: BTreeMap<i32, i32> = ids.iter().map(|&id| (id, id)).collect();
    for (a, b) in links {
        let (top_a, top_b) = (root(&mut parents, a), root(&mut parents, b));
        if top_a != top_b {
            parents.insert(top_a.max(top_b), top_a.min(top_b));
        }
    }
    let mut components: BTreeMap<i32, Vec<i32>> = BTreeMap::new();
    for &id in ids {
        let top = root(&mut parents, id);
        components.entry(top).or_default().push(id);
    }
    components.into_values().collect()
}

pub fn find_copies(members: &[Member], same_readings: &[(i32, i32)]) -> BTreeMap<i32, CopyOf> {
    let by_id: BTreeMap<i32, &Member> = members.iter().map(|member| (member.id, member)).collect();
    let mut edges: Vec<(i32, i32, CopyBasis)> = Vec::new();
    for (index, a) in members.iter().enumerate() {
        for b in &members[index + 1..] {
            let same_identity = a.rat == b.rat && a.cell_key == b.cell_key && a.plmn != b.plmn;
            if same_identity && (a.listed_plmns.contains(&b.plmn) || b.listed_plmns.contains(&a.plmn)) {
                edges.push((a.id, b.id, CopyBasis::BroadcastList));
            }
            if a.matched_cell_id.is_some() && a.matched_cell_id == b.matched_cell_id {
                edges.push((a.id, b.id, CopyBasis::OurCell));
            }
        }
    }
    edges.extend(
        same_readings.iter().filter(|(a, b)| a != b && by_id.contains_key(a) && by_id.contains_key(b)).map(|&(a, b)| (a, b, CopyBasis::SameReading)),
    );

    let ids: Vec<i32> = members.iter().map(|member| member.id).collect();
    let components = connected_components(&ids, edges.iter().map(|&(a, b, _)| (a, b)));

    let mut copies = BTreeMap::new();
    for component in components.iter().filter(|component| component.len() > 1) {
        let component: Vec<&Member> = component.iter().map(|id| by_id[id]).collect();
        let networks: BTreeSet<&str> = component.iter().map(|member| member.plmn.as_str()).collect();
        let lists_others = |member: &Member| networks.iter().filter(|plmn| **plmn != member.plmn && member.listed_plmns.contains(**plmn)).count();
        let primary = component
            .iter()
            .min_by_key(|member| (Reverse(lists_others(member)), Reverse(member.is_own_match), network_code(&member.plmn), member.cell_key))
            .expect("a component of copies has at least two members");
        for member in component.iter().filter(|member| member.id != primary.id) {
            let basis =
                edges.iter().filter(|(a, b, _)| *a == member.id || *b == member.id).map(|(_, _, basis)| *basis).min().unwrap_or(CopyBasis::OurCell);
            copies.insert(member.id, CopyOf { primary_cell_id: primary.id, basis });
        }
    }
    copies
}

pub async fn load_members(client: &impl GenericClient, cell_ids: &[i32]) -> Result<(Vec<Member>, Vec<(i32, i32)>), StoreError> {
    let rows = client
        .query(
            "WITH site_cells AS (SELECT unnest($1::int[]) AS id),
             related AS (
               SELECT id FROM site_cells
               UNION SELECT b.id FROM observations.observed_cells a
                 JOIN observations.observed_cells b ON b.rat = a.rat AND b.cell_key = a.cell_key AND b.id <> a.id
                 WHERE a.id IN (SELECT id FROM site_cells)
               UNION SELECT CASE WHEN p.observed_cell_id IN (SELECT id FROM site_cells) THEN p.other_observed_cell_id ELSE p.observed_cell_id END
                 FROM observations.same_reading_pairs p
                 WHERE NOT p.held AND p.sample_count > 0
                   AND (p.observed_cell_id IN (SELECT id FROM site_cells) OR p.other_observed_cell_id IN (SELECT id FROM site_cells))
               UNION SELECT b.observed_cell_id FROM observations.cell_matches a
                 JOIN observations.cell_matches b ON b.cell_id = a.cell_id
                 WHERE a.observed_cell_id IN (SELECT id FROM site_cells)
             )
             SELECT c.id, c.plmn, c.rat::text, c.cell_key, c.observed_site_id, m.cell_id, coalesce(m.network_match = 'own', false),
               ARRAY(SELECT n.plmn::text FROM observations.cell_networks n
                     WHERE n.observed_cell_id = c.id AND n.plmn <> c.plmn AND bit_count(n.contributor_bits::bit(64)) >= 2 ORDER BY n.plmn)
             FROM observations.observed_cells c
             JOIN related r ON r.id = c.id
             LEFT JOIN observations.cell_matches m ON m.observed_cell_id = c.id
             ORDER BY c.plmn, c.rat, c.cell_key",
            &[&cell_ids],
        )
        .await?;
    let members: Vec<Member> = rows
        .iter()
        .map(|row| Member {
            id: row.get(0),
            plmn: row.get(1),
            rat: row.get(2),
            cell_key: row.get(3),
            site_id: row.get(4),
            matched_cell_id: row.get(5),
            is_own_match: row.get(6),
            listed_plmns: row.get::<_, Vec<String>>(7).into_iter().collect(),
        })
        .collect();
    let ids: Vec<i32> = members.iter().map(|member| member.id).collect();
    let pairs = client
        .query(
            "SELECT observed_cell_id, other_observed_cell_id FROM observations.same_reading_pairs
             WHERE NOT held AND sample_count > 0 AND observed_cell_id = ANY($1) AND other_observed_cell_id = ANY($1)
             ORDER BY 1, 2",
            &[&ids],
        )
        .await?;
    Ok((members, pairs.iter().map(|row| (row.get(0), row.get(1))).collect()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn member(id: i32, plmn: &str, cell_key: i64, listed: &[&str]) -> Member {
        Member {
            id,
            plmn: plmn.to_string(),
            rat: "LTE".to_string(),
            cell_key,
            site_id: Some(id * 10),
            matched_cell_id: None,
            is_own_match: false,
            listed_plmns: listed.iter().map(|plmn| plmn.to_string()).collect(),
        }
    }

    #[test]
    fn the_copy_whose_readings_carry_the_list_is_the_primary() {
        let copies = find_copies(&[member(1, "26002", 500, &[]), member(2, "26003", 500, &["26002"])], &[]);
        assert_eq!(copies, BTreeMap::from([(1, CopyOf { primary_cell_id: 2, basis: CopyBasis::BroadcastList })]));
    }

    #[test]
    fn a_list_that_names_no_other_copy_leaves_cells_apart() {
        assert!(find_copies(&[member(1, "26002", 500, &["26006"]), member(2, "26003", 500, &[])], &[]).is_empty());
        assert!(find_copies(&[member(1, "26002", 500, &["26003"]), member(2, "26003", 501, &[])], &[]).is_empty(), "another identity");
    }

    #[test]
    fn groups_reported_in_one_reading_take_our_owners_code_then_the_lowest() {
        let mut ours = member(2, "26003", 900, &[]);
        ours.matched_cell_id = Some(77);
        ours.is_own_match = true;
        let mut guest = member(1, "26002", 901, &[]);
        guest.matched_cell_id = Some(77);
        let copies = find_copies(&[guest.clone(), ours], &[(1, 2)]);
        assert_eq!(copies[&1], CopyOf { primary_cell_id: 2, basis: CopyBasis::SameReading });

        let copies = find_copies(&[member(5, "26003", 900, &[]), member(4, "26002", 901, &[])], &[(4, 5)]);
        assert_eq!(copies[&5].primary_cell_id, 4, "without a cell of ours, the lowest network code");
    }

    #[test]
    fn the_choice_does_not_depend_on_ids_or_order() {
        let forward = find_copies(&[member(1, "26002", 500, &[]), member(2, "26003", 500, &[]), member(3, "26001", 500, &[])], &[(1, 2), (2, 3)]);
        let backward = find_copies(&[member(3, "26001", 500, &[]), member(2, "26003", 500, &[]), member(1, "26002", 500, &[])], &[(3, 2), (2, 1)]);
        assert_eq!(forward, backward);
        assert!(forward.values().all(|copy| copy.primary_cell_id == 3));
    }
}
