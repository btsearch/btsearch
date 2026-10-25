use std::error::Error;
use std::fmt::Display;
use std::time::{SystemTime, UNIX_EPOCH};

use bytes::{BufMut, BytesMut};
use engine_fold::calendar::Day;
use tokio_postgres::types::{FromSql, IsNull, Kind, ToSql, Type, to_sql_checked};

use crate::StoreError;

const DAYS_FROM_1970_TO_2000: i32 = 10_957;
const MICROS_FROM_1970_TO_2000: i64 = 946_684_800_000_000;

type SqlResult<T> = Result<T, Box<dyn Error + Sync + Send>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Date(pub Day);

impl ToSql for Date {
    fn to_sql(&self, _: &Type, out: &mut BytesMut) -> SqlResult<IsNull> {
        out.put_i32(self.0.0 - DAYS_FROM_1970_TO_2000);
        Ok(IsNull::No)
    }

    fn accepts(ty: &Type) -> bool {
        *ty == Type::DATE
    }

    to_sql_checked!();
}

impl<'a> FromSql<'a> for Date {
    fn from_sql(_: &Type, raw: &'a [u8]) -> SqlResult<Self> {
        let days = i32::from_be_bytes(raw.try_into()?);
        Ok(Self(Day(days + DAYS_FROM_1970_TO_2000)))
    }

    fn accepts(ty: &Type) -> bool {
        *ty == Type::DATE
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Timestamp {
    pub micros_since_1970: i64,
}

impl Timestamp {
    pub fn now() -> Self {
        let since_1970 = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
        Self { micros_since_1970: i64::try_from(since_1970.as_micros()).unwrap_or(i64::MAX) }
    }

    pub fn from_epoch_millis(millis: i64) -> Self {
        Self { micros_since_1970: millis * 1_000 }
    }

    pub fn epoch_millis(self) -> i64 {
        self.micros_since_1970.div_euclid(1_000)
    }
}

impl ToSql for Timestamp {
    fn to_sql(&self, _: &Type, out: &mut BytesMut) -> SqlResult<IsNull> {
        out.put_i64(self.micros_since_1970 - MICROS_FROM_1970_TO_2000);
        Ok(IsNull::No)
    }

    fn accepts(ty: &Type) -> bool {
        *ty == Type::TIMESTAMPTZ
    }

    to_sql_checked!();
}

impl<'a> FromSql<'a> for Timestamp {
    fn from_sql(_: &Type, raw: &'a [u8]) -> SqlResult<Self> {
        let micros = i64::from_be_bytes(raw.try_into()?);
        Ok(Self { micros_since_1970: micros + MICROS_FROM_1970_TO_2000 })
    }

    fn accepts(ty: &Type) -> bool {
        *ty == Type::TIMESTAMPTZ
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Label<'a>(pub &'a str);

impl ToSql for Label<'_> {
    fn to_sql(&self, _: &Type, out: &mut BytesMut) -> SqlResult<IsNull> {
        out.put_slice(self.0.as_bytes());
        Ok(IsNull::No)
    }

    fn accepts(ty: &Type) -> bool {
        matches!(ty.kind(), Kind::Enum(_))
    }

    to_sql_checked!();
}

pub(crate) fn int<T: Copy + Display>(value: T) -> Result<i32, StoreError>
where
    i32: TryFrom<T>,
{
    i32::try_from(value).map_err(|_| StoreError::data(format!("{value} does not fit an integer column")))
}

pub(crate) fn smallint<T: Copy + Display>(value: T) -> Result<i16, StoreError>
where
    i16: TryFrom<T>,
{
    i16::try_from(value).map_err(|_| StoreError::data(format!("{value} does not fit a smallint column")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_and_times_count_from_2000_on_the_wire() {
        let mut out = BytesMut::new();
        Date(Day(DAYS_FROM_1970_TO_2000)).to_sql(&Type::DATE, &mut out).expect("a date writes");
        assert_eq!(&out[..], &0_i32.to_be_bytes());
        assert_eq!(Date::from_sql(&Type::DATE, &1_i32.to_be_bytes()).expect("a date reads"), Date(Day(DAYS_FROM_1970_TO_2000 + 1)));

        let read = Timestamp::from_sql(&Type::TIMESTAMPTZ, &0_i64.to_be_bytes()).expect("a time reads");
        assert_eq!(read.epoch_millis(), 946_684_800_000);
    }
}
