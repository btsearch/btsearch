use engine_batch::document::{ConnectionStatus, DataActivity, Measurement, ReaderSource, Role};

use crate::blocks::BlockedFields;
use crate::identity::Rat;

use super::{Context, Output, Reading};

const NR_MODEM_STEP_SPACING_KHZ: i64 = 120;
const GSM_SATURATED_TIMING_ADVANCE: i64 = 63;
const GSM_RSSI_FLOOR_DBM: i64 = -110;
const GSM_RSSI_CEILING_DBM: i64 = -51;

pub(super) struct Signal {
    pub(super) level: Option<i64>,
    pub(super) quality: Option<i64>,
    pub(super) sinr: Option<i64>,
    pub(super) timing_advance: Option<i16>,
}

pub(super) fn signal_of(context: &Context, output: &mut Output, reading: &Reading, blocked: &BlockedFields) -> Signal {
    let measurement = reading.measurement;
    let (level, quality, sinr) = match reading.entry.rat {
        Rat::Gsm => (("rssiDbm", measurement.rssi_dbm), None, None),
        Rat::Umts => (("rscpDbm", measurement.rscp_dbm), Some(("ecNoDb", measurement.ec_no_db)), None),
        Rat::Lte => (("rsrpDbm", measurement.rsrp_dbm), Some(("rsrqDb", measurement.rsrq_db)), Some(("rssnrDb", measurement.rssnr_db))),
        Rat::Nr => (("ssRsrpDbm", measurement.ss_rsrp_dbm), Some(("ssRsrqDb", measurement.ss_rsrq_db)), Some(("ssSinrDb", measurement.ss_sinr_db))),
    };
    let reported = |(field, value): (&str, Option<i64>)| measurement_value(context, measurement, field, value);
    let level = reported(level).filter(|&level| !is_censored(reading, level) && !may_be_power_controlled(reading));
    let quality = quality.and_then(reported);
    let sinr = sinr.and_then(reported);
    let timing_advance = reported(("timingAdvance", measurement.timing_advance))
        .filter(|_| has_a_current_timing_advance(reading))
        .and_then(|value| timing_advance_in_steps(reading, value));

    blocked.signal.count(level.is_some(), &mut output.report.blocked_values);
    blocked.timing_advance.count(timing_advance.is_some(), &mut output.report.blocked_values);
    Signal {
        level: blocked.signal.keep(level),
        quality: blocked.signal.keep(quality),
        sinr: blocked.signal.keep(sinr),
        timing_advance: blocked.timing_advance.keep(timing_advance).and_then(|steps| i16::try_from(steps).ok()),
    }
}

fn measurement_value(context: &Context, measurement: &Measurement, field: &str, value: Option<i64>) -> Option<i64> {
    let is_derived = measurement.derived.as_ref().is_some_and(|derived| derived.iter().any(|name| name == field));
    let is_dropped = measurement.dropped.as_ref().is_some_and(|dropped| dropped.contains_key(field));
    if is_derived || is_dropped {
        return None;
    }
    match measurement.corrected.as_ref().and_then(|corrected| corrected.get(field)) {
        Some(rule) if context.inputs.blocked_quirk_rules.contains(rule) => None,
        _ => value,
    }
}

fn is_censored(reading: &Reading, level: i64) -> bool {
    reading.entry.rat == Rat::Gsm && !(GSM_RSSI_FLOOR_DBM..GSM_RSSI_CEILING_DBM).contains(&level)
}

fn may_be_power_controlled(reading: &Reading) -> bool {
    reading.entry.rat == Rat::Gsm && reading.measurement.timing_advance.is_some()
}

fn has_a_current_timing_advance(reading: &Reading) -> bool {
    let measurement = reading.measurement;
    if !matches!(measurement.role, Role::Serving | Role::NrSecondary) {
        return false;
    }
    if reading.source == ReaderSource::ModemLog {
        return true;
    }
    match measurement.connection_status {
        Some(status) => matches!(status, ConnectionStatus::PrimaryServing | ConnectionStatus::SecondaryServing),
        None => matches!(reading.snapshot.data_activity, Some(DataActivity::In | DataActivity::Out | DataActivity::InOut)),
    }
}

fn timing_advance_in_steps(reading: &Reading, value: i64) -> Option<i64> {
    match (reading.entry.rat, reading.source) {
        (Rat::Gsm, _) => (value < GSM_SATURATED_TIMING_ADVANCE).then_some(value),
        (Rat::Nr, ReaderSource::ModemLog | ReaderSource::ModemPoll) => {
            let spacing = reading.measurement.subcarrier_spacing_khz?;
            matches!(spacing, 15 | 30 | 60 | 120).then(|| value * (NR_MODEM_STEP_SPACING_KHZ / spacing))
        }
        _ => Some(value),
    }
}
