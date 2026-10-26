mod checks;
mod identified;
mod our_station;
mod signal;
mod unidentified;

use std::collections::{BTreeMap, BTreeSet, HashSet};

use engine_batch::document::{Batch, Measurement, ReaderSource, Role, Snapshot};
use engine_geo::square::parent;
use sha2::{Digest, Sha256};

use crate::blocks::{blocked_fields, whole_reading_block};
use crate::clock::ClockMap;
use crate::deltas::{ContributorMonthKey, Count, Deltas, PERSON_TRAIL_ZOOM, PairKey, PersonTrailBin, PersonTrailKey, absorb_into};
use crate::identity::{CellEntry, CellIdentity, Rat};
use crate::inputs::{FoldInputs, ReaderVersion, ReadingBlock};
use crate::report::{BoundingBox, DropReason, FoldReport};
use crate::track::Track;
use crate::trails::{TrailReading, TripMarks, fold_trips};

use checks::{Checked, check_moment, serves_a_foreign_network};
use identified::fold_identified;
use signal::signal_of;
use unidentified::fold_unidentified;

const CONTRIBUTOR_BIT_MASK: u8 = 63;

pub struct Fold {
    pub deltas: Deltas,
    pub report: FoldReport,
}

pub fn fold(batch: &Batch, inputs: &FoldInputs) -> Fold {
    let mut skipped_rules = BTreeSet::new();
    let entries: Vec<CellEntry> = batch.cells.iter().map(|cell| CellEntry::of(cell, &inputs.blocked_quirk_rules, &mut skipped_rules)).collect();
    let reader_versions: Vec<ReaderVersion> =
        batch.readers.iter().map(|reader| ReaderVersion { name: reader.name.trim().to_owned(), version: reader.version.trim().to_owned() }).collect();
    let mut blocks = inputs.reading_blocks.clone();
    blocks.sort_by_key(|block| block.id);

    let context = Context {
        batch,
        inputs,
        clock: ClockMap::of(batch),
        track: Track::build(&batch.fixes),
        span: upload_span(batch),
        contributor_bit: contributor_bit(inputs.user_id.as_deref()),
        entries,
        reader_versions,
        blocks,
    };
    let mut output = Output::default();
    output.report.skipped_rules = skipped_rules;
    output.report.snapshot_count = batch.snapshots.len() as i64;
    output.report.wall_clock_error_millis = context.clock.wall_clock_error_millis;

    let mut order: Vec<usize> = (0..batch.snapshots.len()).collect();
    order.sort_by_key(|&index| (batch.snapshots[index].t, index));
    let mut seen_moments = HashSet::new();
    for index in order {
        fold_snapshot(&context, &mut output, &batch.snapshots[index], &mut seen_moments);
    }

    let marks = TripMarks { starts_mid_trip: batch.starts_mid_trip == Some(true), ends_mid_trip: batch.ends_mid_trip == Some(true) };
    let Output { mut deltas, mut report, trail_readings, cell_moments, .. } = output;
    fold_trips(trail_readings, &cell_moments, &marks, context.contributor_bit, &mut deltas, &mut report);
    Fold { deltas, report }
}

struct Context<'a> {
    batch: &'a Batch,
    inputs: &'a FoldInputs<'a>,
    clock: ClockMap,
    track: Track,
    span: (u64, u64),
    contributor_bit: u64,
    entries: Vec<CellEntry>,
    reader_versions: Vec<ReaderVersion>,
    blocks: Vec<ReadingBlock>,
}

#[derive(Default)]
struct Output {
    deltas: Deltas,
    report: FoldReport,
    previous_serving: BTreeMap<u32, ServingReading>,
    trail_readings: Vec<TrailReading>,
    cell_moments: BTreeMap<CellIdentity, Vec<i64>>,
}

struct ServingReading {
    cell: CellIdentity,
    epoch_millis: i64,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ReadingUse {
    Dropped,
    DistanceOnly,
    Whole { level: i64 },
}

struct KeptCell {
    identity: CellIdentity,
    channel: Option<i64>,
    code: Option<i64>,
    is_held: bool,
}

struct Reading<'a> {
    snapshot: &'a Snapshot,
    measurement: &'a Measurement,
    entry: &'a CellEntry,
    reader: &'a ReaderVersion,
    source: ReaderSource,
    registered_plmn: Option<&'a str>,
}

fn upload_span(batch: &Batch) -> (u64, u64) {
    let times = batch.fixes.iter().map(|fix| fix.t).chain(batch.snapshots.iter().map(|snapshot| snapshot.t));
    times.fold((u64::MAX, 0), |(earliest, latest), t| (earliest.min(t), latest.max(t)))
}

fn contributor_bit(user_id: Option<&str>) -> u64 {
    let Some(user_id) = user_id else {
        return 0;
    };
    let digest = Sha256::digest(user_id.to_ascii_lowercase().as_bytes());
    1 << (digest[digest.len() - 1] & CONTRIBUTOR_BIT_MASK)
}

fn fold_snapshot(context: &Context, output: &mut Output, snapshot: &Snapshot, seen_moments: &mut HashSet<(u32, u64)>) {
    let reader = &context.batch.readers[snapshot.reader];
    let reader_version = &context.reader_versions[snapshot.reader];
    let reader_report = output.report.readers.entry(reader_version.clone()).or_default();
    reader_report.snapshot_count += 1;
    reader_report.source = Some(reader.source);
    reader_report.rules_version = reader.rules;
    let sample_count = snapshot.measurements.len() as i64;
    output.report.sample_count += sample_count;
    if sample_count == 0 {
        return;
    }

    let skip_reason = if let Some(block) = whole_reading_block(&context.blocks, reader_version) {
        output.report.blocked_values.entry(block.id).or_default().dropped += sample_count;
        Some(DropReason::ReadingBlock)
    } else if !seen_moments.insert((snapshot.sim_slot, snapshot.t)) {
        Some(DropReason::Duplicate)
    } else {
        None
    };
    if let Some(reason) = skip_reason {
        *output.report.drops.entry(reason).or_insert(0) += sample_count;
        return;
    }

    let sim = context.batch.sims.iter().find(|sim| sim.slot == snapshot.sim_slot);
    let registered_plmn = snapshot.registered_plmn.as_deref().or_else(|| sim.and_then(|sim| sim.registered_plmn.as_deref()));

    let mut kept: Vec<KeptCell> = Vec::new();
    let mut anchor: Option<CellIdentity> = None;
    let mut checked_moments = BTreeMap::new();
    let others = snapshot.measurements.iter().filter(|measurement| measurement.role != Role::NrSecondary);
    let nr_secondaries = snapshot.measurements.iter().filter(|measurement| measurement.role == Role::NrSecondary);
    for measurement in others.chain(nr_secondaries) {
        let reading = Reading {
            snapshot,
            measurement,
            entry: &context.entries[measurement.cell],
            reader: reader_version,
            source: reader.source,
            registered_plmn,
        };
        if let Some(cell) = fold_measurement(context, output, &reading, anchor.as_ref(), &mut checked_moments) {
            if measurement.role == Role::Serving && cell.identity.rat == Rat::Lte {
                anchor.get_or_insert_with(|| cell.identity.clone());
            }
            kept.push(cell);
        }
    }
    add_same_reading_pairs(&kept, &mut output.deltas);
}

fn fold_measurement(
    context: &Context,
    output: &mut Output,
    reading: &Reading,
    anchor: Option<&CellIdentity>,
    checked_moments: &mut BTreeMap<u64, Result<Checked, DropReason>>,
) -> Option<KeptCell> {
    let t = reading.measurement.t.unwrap_or(reading.snapshot.t);
    let moment = checked_moments.entry(t).or_insert_with(|| check_moment(context, &mut output.report, t));
    let checked = match moment {
        Ok(checked) => checked,
        Err(reason) => {
            output.report.drop(*reason);
            return None;
        }
    };
    if serves_a_foreign_network(context, reading, checked.placement.point) {
        output.report.drop(DropReason::Implausible);
        return None;
    }
    fold_checked(context, output, reading, checked, anchor)
}

fn fold_checked(context: &Context, output: &mut Output, reading: &Reading, checked: &Checked, anchor: Option<&CellIdentity>) -> Option<KeptCell> {
    let entry = reading.entry;
    let blocked = blocked_fields(&context.blocks, reading.reader, entry.rat, reading.measurement.role);
    let signal = signal_of(context, output, reading, &blocked);
    for (state, value_present) in [
        (blocked.pci, entry.code.is_some()),
        (blocked.channel, entry.channel.is_some()),
        (blocked.area_code, entry.area_code.is_some()),
        (blocked.bandwidth, entry.bandwidth_khz.is_some()),
    ] {
        state.count(value_present, &mut output.report.blocked_values);
    }

    let reading_use = match &entry.identity {
        Some(identity) => fold_identified(context, output, reading, identity, &signal, &blocked, checked),
        None => fold_unidentified(context, output, reading, &signal, &blocked, checked, anchor),
    };
    if reading_use == ReadingUse::Dropped {
        return None;
    }
    note_kept(context, output, reading, checked);
    let ReadingUse::Whole { level } = reading_use else {
        output.report.distance_only_count += 1;
        return None;
    };

    let channel = blocked.channel.keep(entry.channel);
    if reading.measurement.role == Role::Serving {
        collect_trail_reading(context, output, reading, checked, channel, blocked.channel.is_held(), level);
    }
    entry.identity.as_ref().map(|identity| KeptCell {
        identity: identity.clone(),
        channel,
        code: blocked.pci.keep(entry.code),
        is_held: blocked.channel.is_held() || blocked.pci.is_held(),
    })
}

fn note_kept(context: &Context, output: &mut Output, reading: &Reading, checked: &Checked) {
    let report = &mut output.report;
    let point = checked.placement.point;
    report.first_reading_millis = Some(report.first_reading_millis.map_or(checked.epoch_millis, |first| first.min(checked.epoch_millis)));
    report.last_reading_millis = Some(report.last_reading_millis.map_or(checked.epoch_millis, |last| last.max(checked.epoch_millis)));
    report.bounding_box = Some(match report.bounding_box {
        None => BoundingBox { west: point.longitude, south: point.latitude, east: point.longitude, north: point.latitude },
        Some(bounds) => BoundingBox {
            west: bounds.west.min(point.longitude),
            south: bounds.south.min(point.latitude),
            east: bounds.east.max(point.longitude),
            north: bounds.north.max(point.latitude),
        },
    });
    let measurement_rules = reading.measurement.corrected.iter().flat_map(|corrected| corrected.values());
    let applied_rules =
        reading.entry.applied_rules.iter().chain(measurement_rules.filter(|rule| !context.inputs.blocked_quirk_rules.contains(*rule)));
    for rule in applied_rules {
        report.correct(rule, &reading.reader.name);
    }
    let derived = reading.measurement.derived.as_ref().map_or(0, Vec::len) as i64 + reading.entry.derived_count;
    report.readers.entry(reading.reader.clone()).or_default().derived_values += derived;

    if let (Some(user_id), Some(country_code)) = (&context.inputs.user_id, &checked.country_code) {
        let key = ContributorMonthKey { user_id: user_id.clone(), country_code: country_code.clone(), month: checked.day.first_of_month() };
        absorb_into(&mut output.deltas.contributor_months, key, Count { sample_count: 1 });
    }
}

fn collect_trail_reading(
    context: &Context,
    output: &mut Output,
    reading: &Reading,
    checked: &Checked,
    channel: Option<i64>,
    channel_held: bool,
    level: i64,
) {
    let entry = reading.entry;
    let plmn = match reading.registered_plmn {
        Some(registered) if entry.broadcasts(registered) => Some(registered),
        _ => entry.own_plmn(),
    };
    let Some(plmn) = plmn else {
        return;
    };
    if let Some(user_id) = &context.inputs.user_id {
        let key = PersonTrailKey { user_id: user_id.clone(), plmn: plmn.to_owned(), rat: entry.rat, bin: parent(checked.square, PERSON_TRAIL_ZOOM) };
        absorb_into(&mut output.deltas.person_trail_bins, key, PersonTrailBin { sample_count: 1, last_seen_on: checked.day });
    }
    output.trail_readings.push(TrailReading {
        epoch_millis: checked.epoch_millis,
        point: checked.placement.point,
        square: checked.square,
        is_standing_still: checked.placement.is_standing_still,
        plmn: plmn.to_owned(),
        rat: entry.rat,
        channel,
        channel_held,
        level_centi_db: level * 100,
        day: checked.day,
        country_code: checked.country_code.clone(),
    });
}

fn add_same_reading_pairs(kept: &[KeptCell], deltas: &mut Deltas) {
    for (index, first) in kept.iter().enumerate() {
        for second in &kept[index + 1..] {
            let same_radio = first.identity.rat == second.identity.rat
                && first.channel.is_some()
                && first.code.is_some()
                && first.channel == second.channel
                && first.code == second.code;
            if !same_radio || first.identity.plmn == second.identity.plmn {
                continue;
            }
            let (lower, higher) = if first.identity < second.identity { (first, second) } else { (second, first) };
            let key = PairKey { first: lower.identity.clone(), second: higher.identity.clone(), held: first.is_held || second.is_held };
            absorb_into(&mut deltas.same_reading_pairs, key, Count { sample_count: 1 });
        }
    }
}
