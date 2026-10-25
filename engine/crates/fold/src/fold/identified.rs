use std::collections::BTreeSet;

use engine_batch::document::{BarredService, BarringKind, Role};
use engine_geo::square::offset_centimetres;

use crate::blocks::BlockedFields;
use crate::calendar::Day;
use crate::deltas::{
    CellBin, CellBinKey, CellContributorKey, CellNetworkKey, CellReaderKey, CellTaBin, CellTaBinKey, CellValueKey, Contribution, Count, Handover, HandoverKey,
    Seen, Sighting, Transition, TransitionKey, ValueKind, absorb_into,
};
use crate::identity::CellIdentity;
use crate::report::DropReason;

use super::checks::Checked;
use super::our_station::compare_with_our_station;
use super::signal::Signal;
use super::{Context, Output, Reading, ReadingUse, ServingReading};

const HANDOVER_MILLIS: i64 = 5_000;

pub(super) fn fold_identified(
    context: &Context,
    output: &mut Output,
    reading: &Reading,
    identity: &CellIdentity,
    signal: &Signal,
    blocked: &BlockedFields,
    checked: &Checked,
) -> ReadingUse {
    compare_with_our_station(context, output, reading, identity, signal.timing_advance, checked);
    let grouped_timing_advance = context.inputs.ta_groups.get(&reading.source).copied().zip(signal.timing_advance);
    if let Some((ta_group_id, timing_advance)) = grouped_timing_advance {
        let key = CellTaBinKey { cell: identity.clone(), bin: checked.square, ta_group_id, timing_advance };
        absorb_into(&mut output.deltas.cell_ta_bins, key, CellTaBin { sample_count: 1, weight_milli: checked.weight_milli, last_seen_on: checked.day });
    }
    let Some(level) = signal.level else {
        if grouped_timing_advance.is_none() {
            output.report.drop(DropReason::NoLevel);
            return ReadingUse::Dropped;
        }
        note_contribution(context, output, reading, identity, checked);
        return ReadingUse::DistanceOnly;
    };

    let weight_milli = checked.weight_milli;
    let level_centi = level * 100;
    let quality_centi = signal.quality.map(|quality| quality * 100);
    let sinr_centi = signal.sinr.map(|sinr| sinr * 100);
    let (offset_east, offset_north) = offset_centimetres(checked.square, checked.placement.point);
    let bin = CellBin {
        sample_count: 1,
        weight_milli,
        serving_weight_milli: if reading.measurement.role == Role::Serving { weight_milli } else { 0 },
        level_wsum: weight_milli * level_centi,
        level_wsq: weight_milli * level_centi * level_centi,
        quality_weight_milli: quality_centi.map_or(0, |_| weight_milli),
        quality_wsum: quality_centi.map_or(0, |quality| weight_milli * quality),
        sinr_weight_milli: sinr_centi.map_or(0, |_| weight_milli),
        sinr_wsum: sinr_centi.map_or(0, |sinr| weight_milli * sinr),
        sinr_wsq: sinr_centi.map_or(0, |sinr| weight_milli * sinr * sinr),
        offset_x_wsum: weight_milli * i64::from(offset_east),
        offset_y_wsum: weight_milli * i64::from(offset_north),
        stationary_count: i64::from(checked.placement.is_standing_still),
        contributor_bits: context.contributor_bit,
        seen: Seen::on(checked.day),
    };
    absorb_into(&mut output.deltas.cell_bins, CellBinKey { cell: identity.clone(), bin: checked.square }, bin);
    add_cell_values(context, output, reading, identity, blocked, checked.day);
    add_cell_networks(context, output, reading, identity, checked.day);
    note_contribution(context, output, reading, identity, checked);
    note_handover(output, reading, identity, checked);
    ReadingUse::Whole { level }
}

fn note_contribution(context: &Context, output: &mut Output, reading: &Reading, identity: &CellIdentity, checked: &Checked) {
    let deltas = &mut output.deltas;
    let contributor = CellContributorKey { cell: identity.clone(), device_id: context.inputs.device_id.clone() };
    absorb_into(&mut deltas.cell_contributors, contributor, Contribution { sample_count: 1, trip_count: 0, seen: Seen::on(checked.day) });
    absorb_into(&mut deltas.cell_readers, CellReaderKey { cell: identity.clone(), reader: reading.reader.clone() }, Count { sample_count: 1 });
    output.cell_moments.entry(identity.clone()).or_default().push(checked.epoch_millis);
}

fn add_cell_values(context: &Context, output: &mut Output, reading: &Reading, identity: &CellIdentity, blocked: &BlockedFields, day: Day) {
    let entry = reading.entry;
    let access_closed = reading.measurement.access_barring.as_ref().filter(|_| reading.measurement.role == Role::Serving).map(|barring| {
        let bars = |service| barring.get(&service) == Some(&BarringKind::Unconditional);
        bars(BarredService::MoData) && bars(BarredService::MoSignalling)
    });
    let sighting = Sighting { sample_count: 1, contributor_bits: context.contributor_bit, seen: Seen::on(day) };
    let mut add = |field: ValueKind, value: Option<i64>, held: bool| {
        if let Some(value) = value {
            absorb_into(&mut output.deltas.cell_values, CellValueKey { cell: identity.clone(), field, value, held }, sighting.clone());
        }
    };
    add(ValueKind::AreaCode, blocked.area_code.keep(entry.area_code), blocked.area_code.is_held());
    add(ValueKind::Pci, blocked.pci.keep(entry.code), blocked.pci.is_held());
    add(ValueKind::Channel, blocked.channel.keep(entry.channel), blocked.channel.is_held());
    add(ValueKind::Bandwidth, blocked.bandwidth.keep(entry.bandwidth_khz), blocked.bandwidth.is_held());
    add(ValueKind::UlChannel, entry.ul_channel, false);
    add(ValueKind::UlBandwidth, entry.ul_bandwidth_khz, false);
    add(ValueKind::EndcAvailable, entry.endc_available.map(i64::from), false);
    add(ValueKind::Barred, entry.barred.map(i64::from), false);
    add(ValueKind::Reserved, entry.reserved.map(i64::from), false);
    add(ValueKind::AccessClosed, access_closed.map(i64::from), false);
    for &band in &entry.reported_bands {
        add(ValueKind::ReportedBand, Some(band), false);
    }
}

fn add_cell_networks(context: &Context, output: &mut Output, reading: &Reading, identity: &CellIdentity, day: Day) {
    let Some(additional) = &reading.entry.additional_plmns else {
        return;
    };
    let named: BTreeSet<&String> = std::iter::once(&identity.plmn).chain(additional).collect();
    for plmn in named {
        let key = CellNetworkKey { cell: identity.clone(), plmn: plmn.clone() };
        absorb_into(&mut output.deltas.cell_networks, key, Sighting { sample_count: 1, contributor_bits: context.contributor_bit, seen: Seen::on(day) });
    }
}

fn note_handover(output: &mut Output, reading: &Reading, identity: &CellIdentity, checked: &Checked) {
    if reading.measurement.role != Role::Serving {
        return;
    }
    let current = ServingReading { cell: identity.clone(), epoch_millis: checked.epoch_millis };
    let Some(previous) = output.previous_serving.insert(reading.snapshot.sim_slot, current) else {
        return;
    };
    if previous.cell == *identity || checked.epoch_millis - previous.epoch_millis > HANDOVER_MILLIS {
        return;
    }
    if previous.cell.may_share_a_site_with(identity) {
        let key = HandoverKey { from: previous.cell, to: identity.clone(), bin: checked.square };
        absorb_into(&mut output.deltas.handover_bins, key, Handover { handover_count: 1, weight_milli: checked.weight_milli, last_seen_on: checked.day });
    } else {
        let key = TransitionKey { from: previous.cell, to: identity.clone() };
        absorb_into(&mut output.deltas.cell_transitions, key, Transition { transition_count: 1, last_seen_on: checked.day });
    }
}
