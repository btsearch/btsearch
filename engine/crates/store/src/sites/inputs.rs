use std::collections::{BTreeMap, BTreeSet};

use engine_estimate::calibration::AreaClass;
use engine_estimate::input::{Bin, Cell, Handover, Site, Technology, TimingAdvance};
use engine_geo::Point;
use engine_geo::square::square_centre;
use tokio_postgres::GenericClient;
use uuid::Uuid;

use crate::StoreError;
use crate::calibrated::{Calibrated, area_classes, technology_of};
use crate::sites::SiteInput;
use crate::sites::confirmations::Sighting;
use crate::sites::copies::{CopyOf, Member, find_copies, load_members};
use crate::sql_types::Date;

#[derive(Debug, Clone)]
struct SiteCell {
    id: i32,
    plmn: String,
    cell_key: i64,
    technology: Technology,
}

#[derive(Debug, Clone, Copy)]
struct TaBin {
    square: u64,
    ta_group_id: i16,
    timing_advance: i16,
    sample_count: i64,
    weight_milli: i64,
    last_seen_on: i32,
}

#[derive(Debug, Clone, Copy)]
struct HandoverBin {
    from_cell_id: i32,
    to_cell_id: i32,
    square: u64,
    weight_milli: i64,
    last_seen_on: i32,
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct CellCodes {
    pub channel: Option<i32>,
    pub pci: Option<i32>,
}

pub(crate) struct CellRows {
    bins: BTreeMap<i32, Vec<Bin>>,
    timing_advance: BTreeMap<i32, Vec<TaBin>>,
    handovers: Vec<HandoverBin>,
    codes: BTreeMap<i32, CellCodes>,
    pub sightings: BTreeMap<i32, Vec<(Uuid, Sighting)>>,
    group_sources: BTreeMap<i16, String>,
    pub confirming_alone: BTreeSet<Uuid>,
}

pub(crate) struct Prepared {
    pub inputs: Vec<SiteInput>,
    pub members: Vec<Member>,
    pub copies: BTreeMap<i32, CopyOf>,
    pub copy_sites: BTreeMap<i32, i32>,
    pub site_of: BTreeMap<i32, Option<i32>>,
    pub rows: CellRows,
}

fn day(date: Date) -> i32 {
    date.0.0
}

pub(crate) async fn prepare(client: &impl GenericClient, site_ids: &[i32], calibrated: &Calibrated) -> Result<Prepared, StoreError> {
    let (site_cells, stations) = tokio::try_join!(load_site_cells(client, site_ids), load_station_places(client, site_ids))?;
    let cell_ids: Vec<i32> = site_cells.values().flatten().map(|cell| cell.id).collect();
    let (members, same_readings) = load_members(client, &cell_ids).await?;
    let copies = find_copies(&members, &same_readings);

    let site_of: BTreeMap<i32, Option<i32>> = members.iter().map(|member| (member.id, member.site_id)).collect();
    let copy_sites: BTreeMap<i32, i32> = site_cells
        .iter()
        .filter_map(|(&site_id, cells)| primary_site_of_copy(site_id, cells, &copies, &site_of).map(|primary| (site_id, primary)))
        .collect();

    let primary_cells: BTreeMap<i32, Vec<SiteCell>> = site_cells
        .iter()
        .filter(|(site_id, _)| !copy_sites.contains_key(*site_id))
        .map(|(&site_id, cells)| (site_id, cells.iter().filter(|cell| !copies.contains_key(&cell.id)).cloned().collect()))
        .collect();
    let merged_ids = |cell: &SiteCell| -> Vec<i32> {
        std::iter::once(cell.id).chain(copies.iter().filter(|(_, copy)| copy.primary_cell_id == cell.id).map(|(&copy_id, _)| copy_id)).collect()
    };
    let cell_groups: BTreeMap<i32, Vec<Vec<i32>>> =
        primary_cells.iter().map(|(&site_id, cells)| (site_id, cells.iter().map(|cell| merged_ids(cell)).collect())).collect();
    let all_ids: Vec<i32> = cell_groups.values().flatten().flatten().copied().collect();
    let rows = load_cell_rows(client, &all_ids).await?;
    let centres: Vec<(i32, Point)> = cell_groups
        .iter()
        .filter_map(|(&site_id, groups)| {
            let bins = groups.iter().flatten().flat_map(|id| rows.bins.get(id).into_iter().flatten());
            Some((site_id, weighted_centre(bins.map(|bin| (bin.square, bin.weight_milli)))?))
        })
        .collect();
    let areas = area_classes(client, &centres).await?;

    let inputs = cell_groups
        .into_iter()
        .map(|(site_id, groups)| {
            let area_class = areas.get(&site_id).copied().unwrap_or(AreaClass::Country);
            let input = build_site_input(site_id, &primary_cells[&site_id], groups, &rows, calibrated, area_class);
            SiteInput { station_at: stations.get(&site_id).copied(), ..input }
        })
        .collect();
    Ok(Prepared { inputs, members, copies, copy_sites, site_of, rows })
}

async fn load_station_places(client: &impl GenericClient, site_ids: &[i32]) -> Result<BTreeMap<i32, Point>, StoreError> {
    let rows = client
        .query(
            "SELECT k.observed_site_id, l.latitude, l.longitude FROM observations.site_links k
             JOIN public.stations s ON s.id = k.station_id JOIN public.locations l ON l.id = s.location_id
             WHERE k.observed_site_id = ANY($1) AND k.kind = 'matched'",
            &[&site_ids],
        )
        .await?;
    Ok(rows.iter().map(|row| (row.get(0), Point::new(row.get(1), row.get(2)))).collect())
}

pub(crate) async fn load_inputs(client: &impl GenericClient, site_ids: &[i32], calibrated: &Calibrated) -> Result<Vec<SiteInput>, StoreError> {
    Ok(prepare(client, site_ids, calibrated).await?.inputs)
}

pub(crate) fn weighted_centre(squares: impl IntoIterator<Item = (u64, i64)>) -> Option<Point> {
    let (latitude, longitude, total) =
        squares.into_iter().filter(|&(_, weight)| weight > 0).fold((0.0, 0.0, 0.0), |(latitude, longitude, total), (square, weight)| {
            let centre = square_centre(square);
            let weight = weight as f64;
            (latitude + centre.latitude * weight, longitude + centre.longitude * weight, total + weight)
        });
    (total > 0.0).then(|| Point::new(latitude / total, longitude / total))
}

fn primary_site_of_copy(site_id: i32, cells: &[SiteCell], copies: &BTreeMap<i32, CopyOf>, site_of: &BTreeMap<i32, Option<i32>>) -> Option<i32> {
    let mut primary_sites = BTreeSet::new();
    for cell in cells {
        let copy = copies.get(&cell.id)?;
        primary_sites.insert(site_of.get(&copy.primary_cell_id).copied().flatten()?);
    }
    let mut primary_sites = primary_sites.into_iter();
    let primary = primary_sites.next()?;
    (primary_sites.next().is_none() && primary != site_id).then_some(primary)
}

async fn load_site_cells(client: &impl GenericClient, site_ids: &[i32]) -> Result<BTreeMap<i32, Vec<SiteCell>>, StoreError> {
    let rows = client
        .query(
            "SELECT c.observed_site_id, c.id, c.rat::text, c.cell_key, c.plmn FROM observations.observed_cells c
             JOIN observations.observed_sites s ON s.id = c.observed_site_id AND s.retired_at IS NULL
             WHERE c.observed_site_id = ANY($1)
             ORDER BY c.observed_site_id, c.plmn, c.cell_key",
            &[&site_ids],
        )
        .await?;
    let mut cells: BTreeMap<i32, Vec<SiteCell>> = BTreeMap::new();
    for row in &rows {
        let Some(technology) = technology_of(row.get(2)) else {
            continue;
        };
        cells.entry(row.get(0)).or_default().push(SiteCell { id: row.get(1), plmn: row.get(4), cell_key: row.get(3), technology });
    }
    Ok(cells)
}

pub(crate) async fn load_current_codes(client: &impl GenericClient, cell_ids: &[i32]) -> Result<BTreeMap<i32, CellCodes>, StoreError> {
    let rows = client
        .query(
            "SELECT observed_cell_id, field::text, value FROM observations.observed_cell_values
             WHERE observed_cell_id = ANY($1) AND field IN ('channel', 'pci') AND is_current",
            &[&cell_ids],
        )
        .await?;
    let mut codes: BTreeMap<i32, CellCodes> = BTreeMap::new();
    for row in &rows {
        let cell = codes.entry(row.get(0)).or_default();
        if row.get::<_, &str>(1) == "channel" {
            cell.channel = Some(row.get(2));
        } else {
            cell.pci = Some(row.get(2));
        }
    }
    Ok(codes)
}

async fn load_cell_rows(client: &impl GenericClient, cell_ids: &[i32]) -> Result<CellRows, StoreError> {
    let (bins, timing_advance, handovers, codes, sightings) = tokio::try_join!(
        load_cell_bins(client, cell_ids),
        load_cell_ta_bins(client, cell_ids),
        load_handover_bins(client, cell_ids),
        load_current_codes(client, cell_ids),
        load_sightings(client, cell_ids),
    )?;
    let group_ids: Vec<i16> = timing_advance.values().flatten().map(|row| row.ta_group_id).collect::<BTreeSet<_>>().into_iter().collect();
    let users: Vec<Uuid> = sightings.values().flatten().filter_map(|(_, sighting)| sighting.user_id).collect::<BTreeSet<_>>().into_iter().collect();
    let (group_sources, confirming_alone) = tokio::try_join!(load_ta_group_sources(client, &group_ids), load_confirming_alone(client, &users))?;
    Ok(CellRows { bins, timing_advance, handovers, codes, sightings, group_sources, confirming_alone })
}

async fn load_cell_bins(client: &impl GenericClient, cell_ids: &[i32]) -> Result<BTreeMap<i32, Vec<Bin>>, StoreError> {
    let mut bins: BTreeMap<i32, Vec<Bin>> = BTreeMap::new();
    for row in client
        .query(
            "SELECT observed_cell_id, bin, sample_count, weight_milli, serving_weight_milli, level_wsum, offset_x_wsum, offset_y_wsum,
               quality_weight_milli, quality_wsum, sinr_weight_milli, sinr_wsum, stationary_count, first_seen_on, last_seen_on
             FROM observations.cell_bins WHERE observed_cell_id = ANY($1) ORDER BY observed_cell_id, bin",
            &[&cell_ids],
        )
        .await?
    {
        bins.entry(row.get(0)).or_default().push(Bin {
            square: row.get::<_, i64>(1) as u64,
            sample_count: i64::from(row.get::<_, i32>(2)),
            weight_milli: row.get(3),
            serving_weight_milli: row.get(4),
            level_wsum: row.get(5),
            offset_x_wsum: row.get(6),
            offset_y_wsum: row.get(7),
            quality_weight_milli: row.get(8),
            quality_wsum: row.get(9),
            sinr_weight_milli: row.get(10),
            sinr_wsum: row.get(11),
            stationary_count: i64::from(row.get::<_, i32>(12)),
            first_seen_on: day(row.get(13)),
            last_seen_on: day(row.get(14)),
        });
    }
    Ok(bins)
}

async fn load_cell_ta_bins(client: &impl GenericClient, cell_ids: &[i32]) -> Result<BTreeMap<i32, Vec<TaBin>>, StoreError> {
    let mut timing_advance: BTreeMap<i32, Vec<TaBin>> = BTreeMap::new();
    for row in client
        .query(
            "SELECT observed_cell_id, bin, ta_group_id, timing_advance, sample_count, weight_milli, last_seen_on
             FROM observations.cell_ta_bins WHERE observed_cell_id = ANY($1) ORDER BY observed_cell_id, bin, ta_group_id, timing_advance",
            &[&cell_ids],
        )
        .await?
    {
        timing_advance.entry(row.get(0)).or_default().push(TaBin {
            square: row.get::<_, i64>(1) as u64,
            ta_group_id: row.get(2),
            timing_advance: row.get(3),
            sample_count: i64::from(row.get::<_, i32>(4)),
            weight_milli: row.get(5),
            last_seen_on: day(row.get(6)),
        });
    }
    Ok(timing_advance)
}

async fn load_handover_bins(client: &impl GenericClient, cell_ids: &[i32]) -> Result<Vec<HandoverBin>, StoreError> {
    let rows = client
        .query(
            "SELECT from_cell_id, to_cell_id, bin, weight_milli, last_seen_on FROM observations.handover_bins
             WHERE from_cell_id = ANY($1) AND to_cell_id = ANY($1) ORDER BY from_cell_id, to_cell_id, bin",
            &[&cell_ids],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|row| HandoverBin {
            from_cell_id: row.get(0),
            to_cell_id: row.get(1),
            square: row.get::<_, i64>(2) as u64,
            weight_milli: row.get(3),
            last_seen_on: day(row.get(4)),
        })
        .collect())
}

async fn load_sightings(client: &impl GenericClient, cell_ids: &[i32]) -> Result<BTreeMap<i32, Vec<(Uuid, Sighting)>>, StoreError> {
    let mut sightings: BTreeMap<i32, Vec<(Uuid, Sighting)>> = BTreeMap::new();
    for row in client
        .query(
            "SELECT k.observed_cell_id, k.device_id, d.user_id, k.first_seen_on, k.last_seen_on, k.trip_count, t.tier = 'strong',
               r.device_id IS NOT NULL OR b.user_id IS NOT NULL
             FROM observations.cell_contributors k
             JOIN observations.devices d ON d.id = k.device_id
             JOIN observations.device_tiers t ON t.device_id = k.device_id
             LEFT JOIN observations.device_revocations r ON r.device_id = k.device_id
             LEFT JOIN observations.contributor_blocks b ON b.user_id = d.user_id AND (b.until IS NULL OR b.until > now())
             WHERE k.observed_cell_id = ANY($1) ORDER BY 1, 2",
            &[&cell_ids],
        )
        .await?
    {
        let sighting = Sighting {
            user_id: row.get(2),
            first_seen_on: day(row.get(3)),
            last_seen_on: day(row.get(4)),
            trip_count: row.get(5),
            is_strong: row.get(6),
            is_revoked_or_blocked: row.get(7),
        };
        sightings.entry(row.get(0)).or_default().push((row.get(1), sighting));
    }
    Ok(sightings)
}

async fn load_ta_group_sources(client: &impl GenericClient, group_ids: &[i16]) -> Result<BTreeMap<i16, String>, StoreError> {
    let rows = client.query("SELECT id, source::text FROM observations.ta_groups WHERE id = ANY($1)", &[&group_ids]).await?;
    Ok(rows.iter().map(|row| (row.get(0), row.get(1))).collect())
}

async fn load_confirming_alone(client: &impl GenericClient, users: &[Uuid]) -> Result<BTreeSet<Uuid>, StoreError> {
    let rows = client
        .query("SELECT user_id FROM observations.vouches WHERE user_id = ANY($1) AND confirms_alone AND (until IS NULL OR until > now())", &[&users])
        .await?;
    Ok(rows.iter().map(|row| row.get(0)).collect())
}

fn merge_bins(rows: &CellRows, ids: &[i32]) -> Vec<Bin> {
    let mut by_square: BTreeMap<u64, Bin> = BTreeMap::new();
    for bin in ids.iter().flat_map(|id| rows.bins.get(id).into_iter().flatten()) {
        by_square
            .entry(bin.square)
            .and_modify(|merged| {
                merged.sample_count += bin.sample_count;
                merged.weight_milli += bin.weight_milli;
                merged.serving_weight_milli += bin.serving_weight_milli;
                merged.level_wsum += bin.level_wsum;
                merged.offset_x_wsum += bin.offset_x_wsum;
                merged.offset_y_wsum += bin.offset_y_wsum;
                merged.quality_weight_milli += bin.quality_weight_milli;
                merged.quality_wsum += bin.quality_wsum;
                merged.sinr_weight_milli += bin.sinr_weight_milli;
                merged.sinr_wsum += bin.sinr_wsum;
                merged.stationary_count += bin.stationary_count;
                merged.first_seen_on = merged.first_seen_on.min(bin.first_seen_on);
                merged.last_seen_on = merged.last_seen_on.max(bin.last_seen_on);
            })
            .or_insert(*bin);
    }
    by_square.into_values().collect()
}

fn merge_timing_advance(rows: &CellRows, ids: &[i32], technology: Technology, calibrated: &Calibrated, area_class: AreaClass) -> Vec<TimingAdvance> {
    let mut by_reading: BTreeMap<(u64, i16, i16), TaBin> = BTreeMap::new();
    for row in ids.iter().flat_map(|id| rows.timing_advance.get(id).into_iter().flatten()) {
        by_reading
            .entry((row.square, row.ta_group_id, row.timing_advance))
            .and_modify(|merged| {
                merged.sample_count += row.sample_count;
                merged.weight_milli += row.weight_milli;
                merged.last_seen_on = merged.last_seen_on.max(row.last_seen_on);
            })
            .or_insert(*row);
    }
    by_reading
        .into_values()
        .filter_map(|row| {
            let calibration = calibrated.calibration_of(row.ta_group_id, technology, rows.group_sources.get(&row.ta_group_id)?)?;
            Some(TimingAdvance {
                square: row.square,
                distance_m: calibration.distance_m(row.timing_advance),
                sample_count: row.sample_count,
                weight_milli: row.weight_milli,
                last_seen_on: row.last_seen_on,
                error_model: calibrated.error_model_of(row.ta_group_id, technology, area_class)?,
            })
        })
        .collect()
}

fn people_of<'a>(rows: &'a CellRows, ids: impl IntoIterator<Item = &'a i32>) -> BTreeSet<Uuid> {
    ids.into_iter().flat_map(|id| rows.sightings.get(id).into_iter().flatten().filter_map(|(_, sighting)| sighting.user_id)).collect()
}

fn build_site_input(
    site_id: i32,
    cells: &[SiteCell],
    groups: Vec<Vec<i32>>,
    rows: &CellRows,
    calibrated: &Calibrated,
    area_class: AreaClass,
) -> SiteInput {
    let index_of: BTreeMap<i32, usize> = groups.iter().enumerate().flat_map(|(index, ids)| ids.iter().map(move |&id| (id, index))).collect();
    let mut handovers: BTreeMap<(usize, usize, u64), Handover> = BTreeMap::new();
    for row in &rows.handovers {
        let (Some(&from_cell), Some(&to_cell)) = (index_of.get(&row.from_cell_id), index_of.get(&row.to_cell_id)) else {
            continue;
        };
        handovers
            .entry((from_cell, to_cell, row.square))
            .and_modify(|merged| {
                merged.weight_milli += row.weight_milli;
                merged.last_seen_on = merged.last_seen_on.max(row.last_seen_on);
            })
            .or_insert(Handover { from_cell, to_cell, square: row.square, weight_milli: row.weight_milli, last_seen_on: row.last_seen_on });
    }

    let site_cells = cells
        .iter()
        .zip(&groups)
        .map(|(cell, ids)| Cell {
            key: cell.cell_key,
            technology: cell.technology,
            area_class,
            channel: ids.iter().find_map(|id| rows.codes.get(id)?.channel),
            bins: merge_bins(rows, ids),
            timing_advance: merge_timing_advance(rows, ids, cell.technology, calibrated, area_class),
        })
        .collect();
    let devices: BTreeSet<Uuid> =
        groups.iter().flatten().flat_map(|id| rows.sightings.get(id).into_iter().flatten().map(|(device, _)| *device)).collect();
    SiteInput {
        site_id,
        plmn: cells.first().map(|cell| cell.plmn.clone()).unwrap_or_default(),
        site: Site {
            cells: site_cells,
            handovers: handovers.into_values().collect(),
            contributor_count: devices.len() as i32,
            person_count: people_of(rows, groups.iter().flatten()).len() as i32,
        },
        cell_pcis: groups.iter().map(|ids| ids.iter().find_map(|id| rows.codes.get(id)?.pci)).collect(),
        cell_ids: groups,
        station_at: None,
    }
}
