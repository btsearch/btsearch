use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use engine_estimate::input::{Site, Technology};
use engine_estimate::{ALGORITHM_VERSION, Estimate};
use engine_geo::Point;
use engine_geo::plane::distance_meters;
use tokio_postgres::{Client, GenericClient, Transaction};

use crate::calibrated::{Calibrated, SnapKind, rat_of};
use crate::nightly::calibrate::{GroundTruth, RIGHT_WITHIN_M, ground_truth, latest_half};
use crate::nightly::{Half, gnb_lengths, scores};
use crate::sites::grouping::{Facts, find_neighbourhoods, fit_groups, load_facts};
use crate::sites::inputs::{load_inputs, weighted_centre};
use crate::sites::placing::Rules;
use crate::sites::snapping::{Candidate, Nearby, Shown, Target, candidates_for, load_nearby, snap_rows};
use crate::sites::{SiteInput, in_parallel, own_estimate};
use crate::{Database, StoreError};

const BATCH: usize = 64;
const BASELINE_VERSION: i16 = 0;
const EVALUATION: Rules = Rules { matched_sites: true };
const PERCENTILES: [f64; 3] = [0.5, 0.8, 0.95];
const BAND_COUNT: usize = 10;

#[derive(Default)]
struct Errors {
    errors_m: Vec<f64>,
    inside_radius: i32,
    ambiguous: i32,
}

#[derive(Default, Clone, Copy)]
struct SnapCounts {
    possible: i32,
    right: i32,
    wrong: i32,
    missed: i32,
}

#[derive(Default)]
struct GroupingCounts {
    groups: i32,
    right: i32,
    wrong: i32,
    missed: i32,
}

#[derive(Default)]
struct Tally {
    results: BTreeMap<(i16, &'static str, String), Errors>,
    snapping: BTreeMap<SnapKind, SnapCounts>,
    bands: [(i32, i32); BAND_COUNT],
    grouping: GroupingCounts,
    scored_neighbourhoods: BTreeSet<i32>,
}

struct Scored<'a> {
    input: &'a SiteInput,
    estimate: &'a Estimate,
    station_id: i32,
    station: &'a GroundTruth,
}

fn percentile(sorted: &[f64], share: f64) -> f64 {
    let rank = ((share * sorted.len() as f64).ceil() as usize).clamp(1, sorted.len().max(1));
    sorted.get(rank - 1).copied().unwrap_or(0.0)
}

fn serving_centre(site: &Site) -> Option<Point> {
    weighted_centre(site.cells.iter().flat_map(|cell| &cell.bins).map(|bin| (bin.square, bin.serving_weight_milli)))
}

fn most_sampled_technology(site: &Site) -> Option<Technology> {
    let mut samples: BTreeMap<Technology, i64> = BTreeMap::new();
    for cell in &site.cells {
        let bins = cell.bins.iter().map(|bin| bin.sample_count);
        let timing_advance = cell.timing_advance.iter().map(|row| row.sample_count);
        *samples.entry(cell.technology).or_default() += bins.chain(timing_advance).sum::<i64>();
    }
    samples.into_iter().max_by_key(|&(_, count)| count).map(|(technology, _)| technology)
}

async fn site_rats(client: &impl GenericClient, site_ids: &[i32]) -> Result<BTreeMap<i32, String>, StoreError> {
    let rows = client.query("SELECT id, rat::text FROM observations.observed_sites WHERE id = ANY($1) AND rat IS NOT NULL", &[&site_ids]).await?;
    Ok(rows.iter().map(|row| (row.get(0), row.get(1))).collect())
}

async fn scoring_sites(client: &impl GenericClient, stations: &BTreeMap<i32, GroundTruth>) -> Result<Vec<(i32, i32)>, StoreError> {
    let ids: Vec<i32> = stations.keys().copied().collect();
    let rows = client
        .query(
            "SELECT k.observed_site_id, k.station_id FROM observations.site_links k
             JOIN observations.observed_sites s ON s.id = k.observed_site_id AND s.retired_at IS NULL
             WHERE k.kind = 'matched' AND k.station_id = ANY($1)
             ORDER BY 1",
            &[&ids],
        )
        .await?;
    Ok(rows.iter().map(|row| (row.get(0), row.get(1))).collect())
}

async fn dominant(
    client: &impl GenericClient,
    site_ids: &[i32],
    table: &str,
    column: &str,
    weight: &str,
) -> Result<BTreeMap<i32, String>, StoreError> {
    let rows = client
        .query(
            &format!(
                "SELECT DISTINCT ON (c.observed_site_id) c.observed_site_id, t.{column}::text
                 FROM observations.{table} t JOIN observations.observed_cells c ON c.id = t.observed_cell_id
                 WHERE c.observed_site_id = ANY($1)
                 GROUP BY c.observed_site_id, t.{column}
                 ORDER BY c.observed_site_id, sum(t.{weight}) DESC, t.{column}"
            ),
            &[&site_ids],
        )
        .await?;
    Ok(rows.iter().map(|row| (row.get(0), row.get(1))).collect())
}

fn note_error(tally: &mut Tally, version: i16, dimensions: &[(&'static str, String)], error_m: f64, inside: bool, ambiguous: bool) {
    for (dimension, value) in dimensions {
        let errors = tally.results.entry((version, dimension, value.clone())).or_default();
        errors.errors_m.push(error_m);
        errors.inside_radius += i32::from(inside);
        errors.ambiguous += i32::from(ambiguous);
    }
}

async fn score_errors(client: &impl GenericClient, scored: &[Scored<'_>], tally: &mut Tally) -> Result<(), StoreError> {
    let site_ids: Vec<i32> = scored.iter().map(|site| site.input.site_id).collect();
    let (groups, readers, rats) = tokio::try_join!(
        dominant(client, &site_ids, "cell_ta_bins", "ta_group_id", "weight_milli"),
        dominant(client, &site_ids, "cell_readers", "reader_version_id", "sample_count"),
        site_rats(client, &site_ids),
    )?;
    for site in scored {
        let rat = match rats.get(&site.input.site_id) {
            Some(rat) => rat.clone(),
            None => most_sampled_technology(&site.input.site).map_or("unknown", rat_of).to_owned(),
        };
        let dimensions = [
            ("all", "all".to_owned()),
            ("rat", rat),
            ("areaClass", site.station.area_class.label().to_owned()),
            ("evidenceClass", site.estimate.evidence.class().label().to_owned()),
            ("taGroup", groups.get(&site.input.site_id).cloned().unwrap_or_else(|| "none".to_owned())),
            ("reader", readers.get(&site.input.site_id).cloned().unwrap_or_else(|| "none".to_owned())),
            ("country", site.station.country_code.clone()),
        ];
        let error_m = distance_meters(site.estimate.point, site.station.point);
        let inside = error_m <= f64::from(site.estimate.uncertainty_m);
        note_error(tally, ALGORITHM_VERSION, &dimensions, error_m, inside, site.estimate.alternative_point.is_some());
        if let Some(centre) = serving_centre(&site.input.site) {
            note_error(tally, BASELINE_VERSION, &dimensions, distance_meters(centre, site.station.point), false, false);
        }
    }
    Ok(())
}

async fn score_snaps(client: &Client, calibrated: &Calibrated, scored: &[Scored<'_>], tally: &mut Tally) -> Result<(), StoreError> {
    let site_ids: Vec<i32> = scored.iter().map(|site| site.input.site_id).collect();
    let facts = load_facts(client, &site_ids).await?;
    let shown: Vec<(&Scored, Shown)> = scored
        .iter()
        .filter_map(|site| {
            let facts = facts.get(&site.input.site_id)?;
            let shown = Shown {
                lead: site.input.site_id,
                members: vec![site.input.site_id],
                point: site.estimate.point,
                uncertainty_m: site.estimate.uncertainty_m,
                plmn: facts.plmn.clone(),
                operator_id: facts.operator_id,
            };
            Some((site, shown))
        })
        .collect();
    let nearby = load_nearby(client, &shown.iter().map(|(_, shown)| shown).collect::<Vec<_>>(), EVALUATION).await?;

    let station_ids: Vec<i32> = scored.iter().map(|site| site.station_id).collect();
    let linked_sites: BTreeSet<(i32, i32)> = client
        .query(
            "SELECT so.station_id, so.official_site_id FROM public.stations_official_sites so WHERE so.station_id = ANY($1)",
            &[&station_ids],
        )
        .await?
        .iter()
        .map(|row| (row.get(0), row.get(1)))
        .collect();
    let other_ids: Vec<i32> = nearby.values().flat_map(|near| near.other_sites.iter().map(|other| other.id)).collect();
    let other_locations: BTreeMap<i32, Option<i32>> = client
        .query(
            "SELECT k.observed_site_id, st.location_id FROM observations.site_links k JOIN public.stations st ON st.id = k.station_id
             WHERE k.kind = 'matched' AND k.observed_site_id = ANY($1)",
            &[&other_ids],
        )
        .await?
        .iter()
        .map(|row| (row.get(0), row.get(1)))
        .collect();

    for (site, shown) in &shown {
        let mut near = nearby.get(&shown.lead).cloned().unwrap_or_else(Nearby::default);
        near.locations.retain(|location| location.id != site.station.location_id || location.carries_other_operators);
        let candidates = candidates_for(shown, &near);
        let is_right = |candidate: &Candidate| match candidate.target {
            Target::Location(id) => id == site.station.location_id,
            Target::OfficialSite(id) => {
                linked_sites.contains(&(site.station_id, id)) || distance_meters(candidate.point, site.station.point) <= RIGHT_WITHIN_M
            }
            Target::OtherSite(id) => other_locations.get(&id).copied().flatten() == Some(site.station.location_id),
            Target::Candidate(_) => distance_meters(candidate.point, site.station.point) <= RIGHT_WITHIN_M,
        };
        let rows = tokio::task::block_in_place(|| snap_rows(shown.lead, &site.input.site, site.estimate, &candidates, calibrated));
        let snapped = rows.iter().find(|row| row.is_snap);
        let possible: BTreeSet<SnapKind> = rows.iter().filter(|row| is_right(&row.candidate)).map(|row| row.candidate.kind).collect();
        for &kind in &possible {
            let counts = tally.snapping.entry(kind).or_default();
            counts.possible += 1;
            if !snapped.is_some_and(|row| row.candidate.kind == kind && is_right(&row.candidate)) {
                counts.missed += 1;
            }
        }
        if let Some(row) = snapped {
            let right = is_right(&row.candidate);
            let counts = tally.snapping.entry(row.candidate.kind).or_default();
            if right {
                counts.right += 1;
            } else {
                counts.wrong += 1;
            }
            let band = ((row.probability * BAND_COUNT as f64).floor() as usize).min(BAND_COUNT - 1);
            tally.bands[band].0 += 1;
            tally.bands[band].1 += i32::from(right);
        }
    }
    Ok(())
}

async fn score_groups(client: &Client, calibrated: &Arc<Calibrated>, scored: &[Scored<'_>], tally: &mut Tally) -> Result<(), StoreError> {
    let seeds: BTreeSet<i32> = scored.iter().map(|site| site.input.site_id).collect();
    let neighbourhoods: Vec<BTreeSet<i32>> = find_neighbourhoods(client, &seeds, EVALUATION)
        .await?
        .into_iter()
        .filter(|neighbourhood| neighbourhood.len() > 1 && neighbourhood.first().is_some_and(|&first| tally.scored_neighbourhoods.insert(first)))
        .collect();
    let members: Vec<i32> = neighbourhoods.iter().flatten().copied().collect();
    if members.is_empty() {
        return Ok(());
    }
    let facts: BTreeMap<i32, Facts> = load_facts(client, &members).await?;
    let known: BTreeMap<i32, (&Site, &Estimate)> = scored.iter().map(|site| (site.input.site_id, (&site.input.site, site.estimate))).collect();
    let others: Vec<i32> = members.iter().filter(|&id| !known.contains_key(id)).copied().collect();
    let recomputed = in_parallel(load_inputs(client, &others, calibrated).await?, calibrated.clone(), own_estimate).await?;
    let mut sites = known;
    sites.extend(recomputed.iter().filter_map(|(input, estimate)| Some((input.site_id, (&input.site, estimate.as_ref()?)))));

    let stations: BTreeMap<i32, (i32, Option<i32>)> = client
        .query(
            "SELECT k.observed_site_id, k.station_id, st.location_id FROM observations.site_links k JOIN public.stations st ON st.id = k.station_id
             WHERE k.kind = 'matched' AND k.observed_site_id = ANY($1)",
            &[&members],
        )
        .await?
        .iter()
        .map(|row| (row.get(0), (row.get(1), row.get(2))))
        .collect();
    let groups = fit_groups(&neighbourhoods, &sites, &facts, EVALUATION, &calibrated.context)?;

    let mut group_of: BTreeMap<i32, i32> = BTreeMap::new();
    for group in &groups {
        let places: Option<BTreeSet<Option<i32>>> = group.members.iter().map(|member| stations.get(member).map(|&(_, location)| location)).collect();
        let Some(places) = places else {
            continue;
        };
        tally.grouping.groups += 1;
        if places.len() == 1 && places.iter().all(Option::is_some) {
            tally.grouping.right += 1;
        } else {
            tally.grouping.wrong += 1;
        }
        for &member in &group.members {
            group_of.insert(member, group.lead);
        }
    }
    let mut by_station: BTreeMap<i32, BTreeSet<i32>> = BTreeMap::new();
    for &member in &members {
        if let Some(&(station, _)) = stations.get(&member) {
            by_station.entry(station).or_default().insert(group_of.get(&member).copied().unwrap_or(member));
        }
    }
    tally.grouping.missed += by_station.values().filter(|groups| groups.len() > 1).count() as i32;
    Ok(())
}

pub async fn evaluate(database: &Database, with_gnb_lengths: bool) -> Result<i32, StoreError> {
    let mut client = database.pool.get().await?;
    let calibrated = Arc::new(Calibrated::latest_of_its_half(&**client).await?);
    let half = latest_half(&**client).await?.map_or(Half::Odd, Half::other);
    let stations = ground_truth(&**client, half).await?;
    let sites = scoring_sites(&**client, &stations).await?;

    let mut tally = Tally::default();
    for batch in sites.chunks(BATCH) {
        let station_of: BTreeMap<i32, i32> = batch.iter().copied().collect();
        let ids: Vec<i32> = batch.iter().map(|&(site_id, _)| site_id).collect();
        let estimated = in_parallel(load_inputs(&**client, &ids, &calibrated).await?, calibrated.clone(), own_estimate).await?;
        let scored: Vec<Scored> = estimated
            .iter()
            .filter_map(|(input, estimate)| {
                let station_id = *station_of.get(&input.site_id)?;
                Some(Scored { input, estimate: estimate.as_ref()?, station_id, station: stations.get(&station_id)? })
            })
            .collect();
        score_errors(&**client, &scored, &mut tally).await?;
        score_snaps(&client, &calibrated, &scored, &mut tally).await?;
        score_groups(&client, &calibrated, &scored, &mut tally).await?;
    }

    let transaction = client.transaction().await?;
    let run_id: i32 = transaction
        .query_one(
            "INSERT INTO observations.evaluation_runs (calibration_run_id, station_half, ground_truth_count) VALUES ($1, $2::text::station_half, $3) RETURNING id",
            &[&calibrated.run_id, &half.label(), &(stations.len() as i32)],
        )
        .await?
        .get(0);
    write_tally(&transaction, run_id, &mut tally).await?;
    scores::write_reader_scores(&transaction, run_id).await?;
    transaction.commit().await?;

    scores::score_devices(&**client).await?;
    if with_gnb_lengths {
        gnb_lengths::test_lengths(&client, run_id).await?;
    }
    Ok(run_id)
}

async fn write_tally(transaction: &Transaction<'_>, run_id: i32, tally: &mut Tally) -> Result<(), StoreError> {
    for ((version, dimension, value), errors) in &mut tally.results {
        errors.errors_m.sort_by(f64::total_cmp);
        let [p50, p80, p95] = PERCENTILES.map(|share| percentile(&errors.errors_m, share).round() as i32);
        let value: String = value.chars().take(32).collect();
        transaction
            .execute(
                "INSERT INTO observations.evaluation_results (evaluation_run_id, algorithm_version, dimension, dimension_value, site_count,
                   error_p50_m, error_p80_m, error_p95_m, inside_radius_count, ambiguous_count)
                 VALUES ($1, $2, $3::text::evaluation_dimension, $4, $5, $6, $7, $8, $9, $10)",
                &[&run_id, version, dimension, &value, &(errors.errors_m.len() as i32), &p50, &p80, &p95, &errors.inside_radius, &errors.ambiguous],
            )
            .await?;
    }
    for (kind, counts) in &tally.snapping {
        transaction
            .execute(
                "INSERT INTO observations.snapping_results (evaluation_run_id, algorithm_version, kind, possible, \"right\", wrong, missed)
                 VALUES ($1, $2, $3::text::snap_candidate_kind, $4, $5, $6, $7)",
                &[&run_id, &ALGORITHM_VERSION, &kind.label(), &counts.possible, &counts.right, &counts.wrong, &counts.missed],
            )
            .await?;
    }
    for (band, (snaps, right)) in tally.bands.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO observations.snapping_bands (evaluation_run_id, algorithm_version, band, snaps, \"right\") VALUES ($1, $2, $3, $4, $5)",
                &[&run_id, &ALGORITHM_VERSION, &(band as i16), snaps, right],
            )
            .await?;
    }
    let grouping = &tally.grouping;
    transaction
        .execute(
            "INSERT INTO observations.grouping_results (evaluation_run_id, algorithm_version, groups, \"right\", wrong, missed) VALUES ($1, $2, $3, $4, $5, $6)",
            &[&run_id, &ALGORITHM_VERSION, &grouping.groups, &grouping.right, &grouping.wrong, &grouping.missed],
        )
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentiles_take_the_nearest_rank() {
        let sorted: Vec<f64> = (1..=20).map(f64::from).collect();
        assert_eq!(percentile(&sorted, 0.5), 10.0);
        assert_eq!(percentile(&sorted, 0.95), 19.0);
    }
}
