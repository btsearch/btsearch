use std::ops::RangeInclusive;

use crate::document::{Batch, Cell, CellCommon, Fix, Measurement, Technology};
use crate::dropped_values::{DroppedValues, ValueField};

enum Valid {
    Between(i64, i64),
    OneOf(&'static [i64]),
}

impl Valid {
    fn admits(&self, value: i64) -> bool {
        match self {
            Self::Between(lowest, highest) => (*lowest..=*highest).contains(&value),
            Self::OneOf(values) => values.contains(&value),
        }
    }
}

const LATITUDE: RangeInclusive<f64> = -90.0..=90.0;
const LONGITUDE: RangeInclusive<f64> = -180.0..=180.0;
const ALTITUDE_METERS: RangeInclusive<f64> = -1_000.0..=50_000.0;
const SPEED_METERS_PER_SECOND: RangeInclusive<f64> = 0.0..=1_000.0;
const BEARING_DEGREES: RangeInclusive<f64> = 0.0..=360.0;

const AREA_CODE_16_BITS: Valid = Valid::Between(0, 65_535);
const CELL_ID_28_BITS: Valid = Valid::Between(0, 268_435_455);
const NR_ARFCN: Valid = Valid::Between(0, 3_279_165);
const LTE_EARFCN: Valid = Valid::Between(0, 262_143);
const LTE_BANDWIDTH_KHZ: Valid = Valid::Between(1_400, 20_000);
const NR_BANDWIDTH_KHZ: Valid = Valid::Between(5_000, 400_000);

const GSM_SIGNAL: [(ValueField, Valid); 3] = [
    (ValueField::RssiDbm, Valid::Between(-113, -51)),
    (ValueField::BitErrorRate, Valid::Between(0, 7)),
    (ValueField::TimingAdvance, Valid::Between(0, 219)),
];
const UMTS_SIGNAL: [(ValueField, Valid); 3] = [
    (ValueField::RscpDbm, Valid::Between(-120, -24)),
    (ValueField::EcNoDb, Valid::Between(-24, 1)),
    (ValueField::RssiDbm, Valid::Between(-113, -51)),
];
const LTE_SIGNAL: [(ValueField, Valid); 6] = [
    (ValueField::RsrpDbm, Valid::Between(-140, -43)),
    (ValueField::RsrqDb, Valid::Between(-34, 3)),
    (ValueField::RssnrDb, Valid::Between(-20, 30)),
    (ValueField::RssiDbm, Valid::Between(-113, -51)),
    (ValueField::Cqi, Valid::Between(0, 15)),
    (ValueField::TimingAdvance, Valid::Between(0, 1_282)),
];
const NR_SIGNAL: [(ValueField, Valid); 9] = [
    (ValueField::SsRsrpDbm, Valid::Between(-156, -31)),
    (ValueField::SsRsrqDb, Valid::Between(-43, 20)),
    (ValueField::SsSinrDb, Valid::Between(-23, 40)),
    (ValueField::CsiRsrpDbm, Valid::Between(-156, -31)),
    (ValueField::CsiRsrqDb, Valid::Between(-20, -3)),
    (ValueField::CsiSinrDb, Valid::Between(-23, 23)),
    (ValueField::TimingAdvance, Valid::Between(0, 3_846)),
    (ValueField::SubcarrierSpacingKhz, Valid::OneOf(&[15, 30, 60, 120, 240, 480, 960])),
    (ValueField::SsbIndex, Valid::Between(0, 63)),
];

pub(crate) fn drop_out_of_range(batch: &mut Batch) -> DroppedValues {
    let mut dropped = DroppedValues::default();
    batch.fixes.retain_mut(|fix| keep_fix(fix, &mut dropped));
    for cell in &mut batch.cells {
        check_cell(cell, &mut dropped);
    }
    let technologies: Vec<Technology> = batch.cells.iter().map(Cell::technology).collect();
    for snapshot in &mut batch.snapshots {
        for measurement in &mut snapshot.measurements {
            let technology = technologies[measurement.cell];
            check_signal(measurement, technology, &mut dropped);
        }
    }
    dropped
}

fn keep_fix(fix: &mut Fix, dropped: &mut DroppedValues) -> bool {
    let latitude_in_range = LATITUDE.contains(&fix.latitude);
    let longitude_in_range = LONGITUDE.contains(&fix.longitude);
    if !(latitude_in_range && longitude_in_range) {
        dropped.add(ValueField::Latitude, u32::from(!latitude_in_range));
        dropped.add(ValueField::Longitude, u32::from(!longitude_in_range));
        return false;
    }
    keep_measure(&mut fix.altitude_meters, &ALTITUDE_METERS, ValueField::AltitudeMeters, dropped);
    keep_measure(&mut fix.speed_meters_per_second, &SPEED_METERS_PER_SECOND, ValueField::SpeedMetersPerSecond, dropped);
    keep_measure(&mut fix.bearing_degrees, &BEARING_DEGREES, ValueField::BearingDegrees, dropped);
    true
}

fn check_cell(cell: &mut Cell, dropped: &mut DroppedValues) {
    match cell {
        Cell::Gsm(gsm) => {
            keep(&mut gsm.lac, &AREA_CODE_16_BITS, ValueField::Lac, dropped);
            keep(&mut gsm.cid, &Valid::Between(0, 65_535), ValueField::Cid, dropped);
            keep(&mut gsm.arfcn, &Valid::Between(0, 1_023), ValueField::Arfcn, dropped);
            keep(&mut gsm.bsic, &Valid::Between(0, 63), ValueField::Bsic, dropped);
            keep_bands(&mut gsm.common, 1..=14, dropped);
        }
        Cell::Umts(umts) => {
            keep(&mut umts.lac, &AREA_CODE_16_BITS, ValueField::Lac, dropped);
            keep(&mut umts.long_cid, &CELL_ID_28_BITS, ValueField::LongCid, dropped);
            keep(&mut umts.uarfcn, &Valid::Between(0, 16_383), ValueField::Uarfcn, dropped);
            keep(&mut umts.psc, &Valid::Between(0, 511), ValueField::Psc, dropped);
            keep_bands(&mut umts.common, 1..=106, dropped);
        }
        Cell::Lte(lte) => {
            keep(&mut lte.eci, &CELL_ID_28_BITS, ValueField::Eci, dropped);
            keep(&mut lte.tac, &AREA_CODE_16_BITS, ValueField::Tac, dropped);
            keep(&mut lte.earfcn, &LTE_EARFCN, ValueField::Earfcn, dropped);
            keep(&mut lte.pci, &Valid::Between(0, 503), ValueField::Pci, dropped);
            keep(&mut lte.bandwidth_khz, &LTE_BANDWIDTH_KHZ, ValueField::BandwidthKhz, dropped);
            keep(&mut lte.ul_earfcn, &LTE_EARFCN, ValueField::UlEarfcn, dropped);
            keep(&mut lte.ul_bandwidth_khz, &LTE_BANDWIDTH_KHZ, ValueField::UlBandwidthKhz, dropped);
            keep_bands(&mut lte.common, 1..=255, dropped);
        }
        Cell::Nr(nr) => {
            keep(&mut nr.nci, &Valid::Between(0, 68_719_476_735), ValueField::Nci, dropped);
            keep(&mut nr.tac, &Valid::Between(0, 16_777_215), ValueField::Tac, dropped);
            keep(&mut nr.arfcn, &NR_ARFCN, ValueField::Arfcn, dropped);
            keep(&mut nr.pci, &Valid::Between(0, 1_007), ValueField::Pci, dropped);
            keep(&mut nr.bandwidth_khz, &NR_BANDWIDTH_KHZ, ValueField::BandwidthKhz, dropped);
            keep(&mut nr.ul_arfcn, &NR_ARFCN, ValueField::UlArfcn, dropped);
            keep(&mut nr.ul_bandwidth_khz, &NR_BANDWIDTH_KHZ, ValueField::UlBandwidthKhz, dropped);
            keep_bands(&mut nr.common, 1..=1_024, dropped);
        }
    }
}

fn check_signal(measurement: &mut Measurement, technology: Technology, dropped: &mut DroppedValues) {
    let signal: &[(ValueField, Valid)] = match technology {
        Technology::Gsm => &GSM_SIGNAL,
        Technology::Umts => &UMTS_SIGNAL,
        Technology::Lte => &LTE_SIGNAL,
        Technology::Nr => &NR_SIGNAL,
    };
    for (field, value) in signal_values(measurement) {
        match signal.iter().find(|(own, _)| *own == field) {
            Some((_, valid)) => keep(value, valid, field, dropped),
            None => drop_foreign(value, field, dropped),
        }
    }
}

fn signal_values(measurement: &mut Measurement) -> [(ValueField, &mut Option<i64>); 17] {
    [
        (ValueField::RsrpDbm, &mut measurement.rsrp_dbm),
        (ValueField::RsrqDb, &mut measurement.rsrq_db),
        (ValueField::RssnrDb, &mut measurement.rssnr_db),
        (ValueField::RssiDbm, &mut measurement.rssi_dbm),
        (ValueField::Cqi, &mut measurement.cqi),
        (ValueField::SsRsrpDbm, &mut measurement.ss_rsrp_dbm),
        (ValueField::SsRsrqDb, &mut measurement.ss_rsrq_db),
        (ValueField::SsSinrDb, &mut measurement.ss_sinr_db),
        (ValueField::CsiRsrpDbm, &mut measurement.csi_rsrp_dbm),
        (ValueField::CsiRsrqDb, &mut measurement.csi_rsrq_db),
        (ValueField::CsiSinrDb, &mut measurement.csi_sinr_db),
        (ValueField::SubcarrierSpacingKhz, &mut measurement.subcarrier_spacing_khz),
        (ValueField::SsbIndex, &mut measurement.ssb_index),
        (ValueField::RscpDbm, &mut measurement.rscp_dbm),
        (ValueField::EcNoDb, &mut measurement.ec_no_db),
        (ValueField::BitErrorRate, &mut measurement.bit_error_rate),
        (ValueField::TimingAdvance, &mut measurement.timing_advance),
    ]
}

fn keep(value: &mut Option<i64>, valid: &Valid, field: ValueField, dropped: &mut DroppedValues) {
    if value.is_some_and(|value| !valid.admits(value)) {
        *value = None;
        dropped.add(field, 1);
    }
}

fn drop_foreign(value: &mut Option<i64>, field: ValueField, dropped: &mut DroppedValues) {
    if value.take().is_some() {
        dropped.add(field, 1);
    }
}

fn keep_measure(value: &mut Option<f64>, range: &RangeInclusive<f64>, field: ValueField, dropped: &mut DroppedValues) {
    if value.is_some_and(|value| !range.contains(&value)) {
        *value = None;
        dropped.add(field, 1);
    }
}

fn keep_bands(common: &mut CellCommon, valid: RangeInclusive<i64>, dropped: &mut DroppedValues) {
    if let Some(bands) = &mut common.bands {
        let reported = bands.len();
        bands.retain(|band| valid.contains(band));
        dropped.add(ValueField::Bands, u32::try_from(reported - bands.len()).unwrap_or(u32::MAX));
    }
}
