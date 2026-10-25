use engine_batch::document::Role;
use engine_geo::Point;
use engine_geo::mcc::countries_of_plmn;
use engine_geo::square::square_at;

use crate::calendar::Day;
use crate::report::{DropReason, FoldReport};
use crate::track::Placement;
use crate::weights::reading_weight_milli;

use super::{Context, Reading};

const MAX_AGE_MILLIS: i64 = 90 * 24 * 60 * 60 * 1000;
const FOREIGN_NETWORK_METERS: f64 = 30_000.0;

pub(super) struct Checked {
    pub(super) epoch_millis: i64,
    pub(super) day: Day,
    pub(super) placement: Placement,
    pub(super) square: u64,
    pub(super) weight_milli: i64,
    pub(super) country_code: Option<String>,
}

pub(super) fn check_moment(context: &Context, report: &mut FoldReport, t: u64) -> Result<Checked, DropReason> {
    let (earliest, latest) = context.span;
    let epoch_millis = context.clock.epoch_millis(t);
    if t < earliest || t > latest || epoch_millis > context.inputs.received_at_millis {
        return Err(DropReason::BadTime);
    }
    if epoch_millis < context.inputs.received_at_millis - MAX_AGE_MILLIS {
        return Err(DropReason::TooOld);
    }
    let placement = context.track.place(t)?;
    let country_code = context.inputs.outlines.country_at(placement.point).map(str::to_owned);
    if let Some(country) = &country_code
        && context.inputs.closed_countries.contains(country)
    {
        report.closed_countries.insert(country.clone());
        return Err(DropReason::ClosedCountry);
    }
    let weight_milli = reading_weight_milli(context.inputs.device_weight_milli, placement.accuracy_meters, placement.speed_meters_per_second);
    Ok(Checked { epoch_millis, day: Day::of_epoch_millis(epoch_millis), placement, square: square_at(placement.point), weight_milli, country_code })
}

pub(super) fn serves_a_foreign_network(context: &Context, reading: &Reading, point: Point) -> bool {
    let serves = matches!(reading.measurement.role, Role::Serving | Role::Aggregated);
    serves && reading.entry.own_plmn().is_some_and(|plmn| is_foreign_network(context, plmn, point))
}

fn is_foreign_network(context: &Context, plmn: &str, point: Point) -> bool {
    let outlines = context.inputs.outlines;
    let mut checkable = countries_of_plmn(plmn).iter().filter(|country| outlines.has(country)).peekable();
    checkable.peek().is_some() && !checkable.any(|country| outlines.is_within(country, point, FOREIGN_NETWORK_METERS))
}
