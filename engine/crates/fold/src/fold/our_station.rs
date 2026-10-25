use engine_estimate::timing_advance::shortest_plausible_residual_m;
use engine_geo::plane::distance_meters;

use crate::identity::CellIdentity;
use crate::inputs::uncalibrated_step_m;
use crate::report::{CheckedField, DISTANCE_BUCKET_M, TaResidualKey};

use super::checks::Checked;
use super::{Context, Output, Reading};

const TIMING_ADVANCE_TOO_LONG_M: f64 = 2_000.0;

pub(super) fn compare_with_our_station(
    context: &Context,
    output: &mut Output,
    reading: &Reading,
    identity: &CellIdentity,
    timing_advance: Option<i16>,
    checked: &Checked,
) {
    let Some(confirmed) = context.inputs.confirmed_cells.get(identity) else {
        return;
    };
    let entry = reading.entry;
    for (field, value, curated) in [
        (CheckedField::Pci, entry.code, confirmed.pci),
        (CheckedField::Channel, entry.channel, confirmed.channel),
        (CheckedField::AreaCode, entry.area_code, confirmed.area_code),
    ] {
        let (Some(value), Some(curated)) = (value, curated) else {
            continue;
        };
        let agreement = output.report.value_checks.entry((reading.reader.clone(), field)).or_default();
        if value == curated {
            agreement.agreed += 1;
        } else {
            agreement.differed += 1;
            output.report.note_difference(reading.reader, field, identity, curated, value);
        }
    }

    let Some(steps) = timing_advance else {
        return;
    };
    let distance = distance_meters(checked.placement.point, confirmed.station);
    let Ok(distance_bucket) = i16::try_from((distance / DISTANCE_BUCKET_M).round() as i64) else {
        return;
    };
    let key = TaResidualKey { source: reading.source, rat: identity.rat, station_id: confirmed.station_id, timing_advance: steps, distance_bucket };
    *output.report.ta_residuals.entry(key).or_insert(0) += 1;
    if let Some(step_m) = uncalibrated_step_m(identity.rat, reading.source) {
        let residual = f64::from(steps) * step_m - distance;
        let reader = output.report.readers.entry(reading.reader.clone()).or_default();
        reader.ta_on_confirmed += 1;
        if (shortest_plausible_residual_m(step_m)..=TIMING_ADVANCE_TOO_LONG_M).contains(&residual) {
            reader.ta_within_tolerance += 1;
        }
    }
}
