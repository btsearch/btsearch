use engine_batch::document::Role;
use engine_geo::square::parent;

use crate::blocks::BlockedFields;
use crate::deltas::{LevelSighting, NEIGHBOUR_ZOOM, NeighbourKey, NsaKey, Seen, absorb_into};
use crate::identity::CellIdentity;
use crate::report::DropReason;

use super::checks::Checked;
use super::signal::Signal;
use super::{Context, Output, Reading, ReadingUse};

pub(super) fn fold_unidentified(
    context: &Context,
    output: &mut Output,
    reading: &Reading,
    signal: &Signal,
    blocked: &BlockedFields,
    checked: &Checked,
    anchor: Option<&CellIdentity>,
) -> ReadingUse {
    let entry = reading.entry;
    if (blocked.channel.is_dropped() && entry.channel.is_some()) || (blocked.pci.is_dropped() && entry.code.is_some()) {
        output.report.drop(DropReason::ReadingBlock);
        return ReadingUse::Dropped;
    }
    let (Some(channel), Some(code), Some(plmn)) = (entry.channel, entry.code, reading.registered_plmn) else {
        output.report.drop(DropReason::NoIdentity);
        return ReadingUse::Dropped;
    };
    let Some(level) = signal.level else {
        output.report.drop(DropReason::NoLevel);
        return ReadingUse::Dropped;
    };

    let held = blocked.channel.is_held() || blocked.pci.is_held();
    let sighting = LevelSighting {
        sample_count: 1,
        weight_milli: checked.weight_milli,
        level_wsum: checked.weight_milli * level * 100,
        contributor_bits: context.contributor_bit,
        seen: Seen::on(checked.day),
    };
    let neighbour = NeighbourKey { plmn: plmn.to_owned(), rat: entry.rat, channel, pci: code, bin: parent(checked.square, NEIGHBOUR_ZOOM), held };
    absorb_into(&mut output.deltas.neighbour_bins, neighbour, sighting.clone());
    if reading.measurement.role == Role::NrSecondary
        && let Some(anchor) = anchor
    {
        let link = NsaKey { anchor: anchor.clone(), nr_arfcn: channel, nr_pci: code, held };
        absorb_into(&mut output.deltas.nsa_links, link, LevelSighting { contributor_bits: 0, ..sighting });
    }
    ReadingUse::Whole { level }
}
