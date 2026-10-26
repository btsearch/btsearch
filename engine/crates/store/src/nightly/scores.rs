use tokio_postgres::{GenericClient, Transaction};
use uuid::Uuid;

use crate::StoreError;

const LOOK_BACK_DAYS: i32 = 365;
const PHANTOM_WITHIN_DAYS: i32 = 30;
const POPULATION_READINGS: f64 = 100.0;
const AGREEMENT_WITHOUT_DATA: f64 = 0.9;
const LEAST_FACTOR: f64 = 0.2;
const MOST_FACTOR: f64 = 1.2;

const FOLDED_LATELY: &str = "
    folded AS (
      SELECT u.id, u.device_id FROM observations.uploads u JOIN observations.upload_folds f ON f.upload_id = u.id
      WHERE u.status = 'processed' AND f.unfolded_at IS NULL AND u.received_at >= now() - make_interval(days => $1)
    )";

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct DeviceRecord {
    pub readings: i64,
    pub ta_on_confirmed: i64,
    pub ta_within_tolerance: i64,
    pub dropped_implausible: i64,
    pub mock_readings: i64,
    pub phantom_cells: i64,
    pub cells: i64,
}

pub fn population_agreement(records: &[DeviceRecord]) -> f64 {
    let (within, on): (i64, i64) =
        records.iter().fold((0, 0), |(within, on), record| (within + record.ta_within_tolerance, on + record.ta_on_confirmed));
    if on > 0 { within as f64 / on as f64 } else { AGREEMENT_WITHOUT_DATA }
}

pub fn factor_of(record: &DeviceRecord, population_agreement: f64) -> f64 {
    let population = population_agreement.max(f64::EPSILON);
    let agreement = (record.ta_within_tolerance as f64 + POPULATION_READINGS * population) / (record.ta_on_confirmed as f64 + POPULATION_READINGS);
    let readings = record.readings.max(1) as f64;
    let share = |count: i64, of: f64| (count as f64 / of).min(1.0);
    let kept = (1.0 - share(record.dropped_implausible, readings))
        * (1.0 - share(record.mock_readings, readings))
        * (1.0 - share(record.phantom_cells, record.cells.max(1) as f64));
    (agreement / population * kept).clamp(LEAST_FACTOR, MOST_FACTOR)
}

pub async fn score_devices(client: &impl GenericClient) -> Result<usize, StoreError> {
    let rows = client
        .query(
            &format!(
                "WITH {FOLDED_LATELY},
                 readings AS (SELECT fo.device_id, sum(f.sample_count)::bigint AS readings FROM folded fo JOIN observations.upload_folds f ON f.upload_id = fo.id GROUP BY 1),
                 timing AS (
                   SELECT fo.device_id, sum(r.ta_on_confirmed)::bigint AS on_confirmed, sum(r.ta_within_tolerance)::bigint AS within
                   FROM folded fo JOIN observations.upload_readers r ON r.upload_id = fo.id GROUP BY 1
                 ),
                 drops AS (
                   SELECT fo.device_id,
                     coalesce(sum(d.sample_count) FILTER (WHERE d.reason IN ('implausible', 'implausibleFix')), 0)::bigint AS implausible,
                     coalesce(sum(d.sample_count) FILTER (WHERE d.reason = 'mockLocation'), 0)::bigint AS mock
                   FROM folded fo JOIN observations.upload_drops d ON d.upload_id = fo.id GROUP BY 1
                 ),
                 seen AS (SELECT k.device_id, count(*)::bigint AS cells FROM observations.cell_contributors k GROUP BY 1),
                 phantoms AS (
                   SELECT k.device_id, count(*)::bigint AS cells
                   FROM observations.cell_contributors k
                   JOIN observations.observed_cells c ON c.id = k.observed_cell_id
                   JOIN observations.devices d ON d.id = k.device_id
                   WHERE d.user_id IS NOT NULL
                     AND NOT EXISTS (
                       SELECT 1 FROM observations.cell_contributors other WHERE other.observed_cell_id = k.observed_cell_id AND other.device_id <> k.device_id
                     )
                     AND EXISTS (
                       SELECT 1 FROM observations.cell_bins b
                       JOIN observations.trail_squares t ON t.plmn = c.plmn AND t.zoom = 18 AND t.bin = (b.bin >> 4) AND NOT t.held
                       WHERE b.observed_cell_id = k.observed_cell_id
                         AND t.last_seen_on BETWEEN k.first_seen_on - $2::int AND k.last_seen_on + $2::int
                         AND (t.contributor_bits & ~(1::bigint << (get_byte(sha256(convert_to(lower(d.user_id::text), 'UTF8')), 31) & 63))) <> 0
                     )
                   GROUP BY 1
                 )
                 SELECT r.device_id, r.readings, coalesce(t.on_confirmed, 0), coalesce(t.within, 0), coalesce(dr.implausible, 0), coalesce(dr.mock, 0),
                   coalesce(p.cells, 0), coalesce(s.cells, 0)
                 FROM readings r
                 LEFT JOIN timing t USING (device_id)
                 LEFT JOIN drops dr USING (device_id)
                 LEFT JOIN phantoms p USING (device_id)
                 LEFT JOIN seen s USING (device_id)
                 ORDER BY 1"
            ),
            &[&LOOK_BACK_DAYS, &PHANTOM_WITHIN_DAYS],
        )
        .await?;
    let records: Vec<(Uuid, DeviceRecord)> = rows
        .iter()
        .map(|row| {
            let record = DeviceRecord {
                readings: row.get(1),
                ta_on_confirmed: row.get(2),
                ta_within_tolerance: row.get(3),
                dropped_implausible: row.get(4),
                mock_readings: row.get(5),
                phantom_cells: row.get(6),
                cells: row.get(7),
            };
            (row.get(0), record)
        })
        .collect();
    let population = population_agreement(&records.iter().map(|(_, record)| *record).collect::<Vec<_>>());
    let device_ids: Vec<Uuid> = records.iter().map(|(device_id, _)| *device_id).collect();
    let column = |count: fn(&DeviceRecord) -> i64| -> Vec<i32> {
        records.iter().map(|(_, record)| i32::try_from(count(record)).unwrap_or(i32::MAX)).collect()
    };
    let factors: Vec<f32> = records.iter().map(|(_, record)| factor_of(record, population) as f32).collect();
    client
        .execute(
            "INSERT INTO observations.device_scores
               (device_id, scored_on, readings, ta_on_confirmed, ta_within_tolerance, dropped_implausible, mock_readings, phantom_cells, factor)
             SELECT device_id, current_date, readings, ta_on_confirmed, ta_within_tolerance, dropped_implausible, mock_readings, phantom_cells, factor
             FROM unnest($1::uuid[], $2::int[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[], $8::real[])
               AS t(device_id, readings, ta_on_confirmed, ta_within_tolerance, dropped_implausible, mock_readings, phantom_cells, factor)
             ON CONFLICT (device_id, scored_on) DO UPDATE SET
               readings = excluded.readings, ta_on_confirmed = excluded.ta_on_confirmed, ta_within_tolerance = excluded.ta_within_tolerance,
               dropped_implausible = excluded.dropped_implausible, mock_readings = excluded.mock_readings, phantom_cells = excluded.phantom_cells,
               factor = excluded.factor",
            &[
                &device_ids,
                &column(|record| record.readings),
                &column(|record| record.ta_on_confirmed),
                &column(|record| record.ta_within_tolerance.min(record.ta_on_confirmed)),
                &column(|record| record.dropped_implausible),
                &column(|record| record.mock_readings),
                &column(|record| record.phantom_cells),
                &factors,
            ],
        )
        .await?;
    Ok(records.len())
}

pub async fn write_reader_scores(transaction: &Transaction<'_>, run_id: i32) -> Result<(), StoreError> {
    transaction
        .execute(
            &format!(
                "WITH {FOLDED_LATELY},
                 readers AS (
                   SELECT r.reader_version_id, count(*)::int AS uploads, sum(r.ta_on_confirmed)::int AS on_confirmed, sum(r.ta_within_tolerance)::int AS within
                   FROM folded fo JOIN observations.upload_readers r ON r.upload_id = fo.id GROUP BY 1
                 ),
                 checks AS (
                   SELECT v.reader_version_id, sum(v.agreed)::int AS agreed, sum(v.differed)::int AS differed
                   FROM folded fo JOIN observations.upload_value_checks v ON v.upload_id = fo.id GROUP BY 1
                 ),
                 single_reader AS (
                   SELECT reader_version_id, count(*)::int AS cells
                   FROM (SELECT observed_cell_id, min(reader_version_id) AS reader_version_id FROM observations.cell_readers GROUP BY 1 HAVING count(*) = 1) single
                   GROUP BY 1
                 )
                 INSERT INTO observations.reader_scores
                   (evaluation_run_id, reader_version_id, uploads, ta_on_confirmed, ta_within_tolerance, values_agreed, values_differed, only_cells)
                 SELECT $2, r.reader_version_id, r.uploads, r.on_confirmed, r.within, coalesce(c.agreed, 0), coalesce(c.differed, 0), coalesce(s.cells, 0)
                 FROM readers r
                 LEFT JOIN checks c USING (reader_version_id)
                 LEFT JOIN single_reader s USING (reader_version_id)"
            ),
            &[&LOOK_BACK_DAYS, &run_id],
        )
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(ta_on_confirmed: i64, ta_within_tolerance: i64) -> DeviceRecord {
        DeviceRecord { readings: 10_000, ta_on_confirmed, ta_within_tolerance, cells: 100, ..DeviceRecord::default() }
    }

    #[test]
    fn a_device_like_the_others_keeps_a_factor_of_one() {
        assert!((factor_of(&record(1_000, 900), 0.9) - 1.0).abs() < 1e-9);
        assert!((factor_of(&record(0, 0), 0.9) - 1.0).abs() < 1e-9, "no readings on our stations: the population's average");
    }

    #[test]
    fn a_device_that_disagrees_with_our_stations_drops_to_the_floor() {
        assert_eq!(factor_of(&record(2_000, 100), 0.9), LEAST_FACTOR);
        let mocking = DeviceRecord { mock_readings: 5_000, ..record(1_000, 900) };
        assert!((factor_of(&mocking, 0.9) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn the_population_agreement_pools_every_device() {
        assert!((population_agreement(&[record(100, 90), record(300, 210)]) - 0.75).abs() < 1e-12);
    }
}
