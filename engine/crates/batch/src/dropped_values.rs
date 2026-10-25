use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ValueField {
    Latitude,
    Longitude,
    AltitudeMeters,
    SpeedMetersPerSecond,
    BearingDegrees,
    Lac,
    Cid,
    LongCid,
    Eci,
    Nci,
    Tac,
    Arfcn,
    Uarfcn,
    Earfcn,
    Bsic,
    Psc,
    Pci,
    BandwidthKhz,
    UlArfcn,
    UlEarfcn,
    UlBandwidthKhz,
    Bands,
    RsrpDbm,
    RsrqDb,
    RssnrDb,
    RssiDbm,
    Cqi,
    SsRsrpDbm,
    SsRsrqDb,
    SsSinrDb,
    CsiRsrpDbm,
    CsiRsrqDb,
    CsiSinrDb,
    SubcarrierSpacingKhz,
    SsbIndex,
    RscpDbm,
    EcNoDb,
    BitErrorRate,
    TimingAdvance,
}

impl ValueField {
    pub const ALL: [Self; 39] = [
        Self::Latitude,
        Self::Longitude,
        Self::AltitudeMeters,
        Self::SpeedMetersPerSecond,
        Self::BearingDegrees,
        Self::Lac,
        Self::Cid,
        Self::LongCid,
        Self::Eci,
        Self::Nci,
        Self::Tac,
        Self::Arfcn,
        Self::Uarfcn,
        Self::Earfcn,
        Self::Bsic,
        Self::Psc,
        Self::Pci,
        Self::BandwidthKhz,
        Self::UlArfcn,
        Self::UlEarfcn,
        Self::UlBandwidthKhz,
        Self::Bands,
        Self::RsrpDbm,
        Self::RsrqDb,
        Self::RssnrDb,
        Self::RssiDbm,
        Self::Cqi,
        Self::SsRsrpDbm,
        Self::SsRsrqDb,
        Self::SsSinrDb,
        Self::CsiRsrpDbm,
        Self::CsiRsrqDb,
        Self::CsiSinrDb,
        Self::SubcarrierSpacingKhz,
        Self::SsbIndex,
        Self::RscpDbm,
        Self::EcNoDb,
        Self::BitErrorRate,
        Self::TimingAdvance,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Latitude => "latitude",
            Self::Longitude => "longitude",
            Self::AltitudeMeters => "altitudeMeters",
            Self::SpeedMetersPerSecond => "speedMetersPerSecond",
            Self::BearingDegrees => "bearingDegrees",
            Self::Lac => "lac",
            Self::Cid => "cid",
            Self::LongCid => "longCid",
            Self::Eci => "eci",
            Self::Nci => "nci",
            Self::Tac => "tac",
            Self::Arfcn => "arfcn",
            Self::Uarfcn => "uarfcn",
            Self::Earfcn => "earfcn",
            Self::Bsic => "bsic",
            Self::Psc => "psc",
            Self::Pci => "pci",
            Self::BandwidthKhz => "bandwidthKhz",
            Self::UlArfcn => "ulArfcn",
            Self::UlEarfcn => "ulEarfcn",
            Self::UlBandwidthKhz => "ulBandwidthKhz",
            Self::Bands => "bands",
            Self::RsrpDbm => "rsrpDbm",
            Self::RsrqDb => "rsrqDb",
            Self::RssnrDb => "rssnrDb",
            Self::RssiDbm => "rssiDbm",
            Self::Cqi => "cqi",
            Self::SsRsrpDbm => "ssRsrpDbm",
            Self::SsRsrqDb => "ssRsrqDb",
            Self::SsSinrDb => "ssSinrDb",
            Self::CsiRsrpDbm => "csiRsrpDbm",
            Self::CsiRsrqDb => "csiRsrqDb",
            Self::CsiSinrDb => "csiSinrDb",
            Self::SubcarrierSpacingKhz => "subcarrierSpacingKhz",
            Self::SsbIndex => "ssbIndex",
            Self::RscpDbm => "rscpDbm",
            Self::EcNoDb => "ecNoDb",
            Self::BitErrorRate => "bitErrorRate",
            Self::TimingAdvance => "timingAdvance",
        }
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct DroppedValues(BTreeMap<ValueField, u32>);

impl DroppedValues {
    pub fn get(&self, field: ValueField) -> u32 {
        self.0.get(&field).copied().unwrap_or(0)
    }

    pub fn iter(&self) -> impl Iterator<Item = (ValueField, u32)> + '_ {
        self.0.iter().map(|(field, count)| (*field, *count))
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub(crate) fn add(&mut self, field: ValueField, count: u32) {
        if count > 0 {
            *self.0.entry(field).or_insert(0) += count;
        }
    }
}
