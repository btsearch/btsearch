use std::collections::BTreeMap;

use engine_fold::deltas::{ContributorMonthKey, Deltas, TrailSquareKey};
use engine_fold::inputs::ReaderVersion;
use engine_fold::memory::Direction;
use engine_fold::report::SquareOrigin;
use uuid::Uuid;

use crate::StoreError;
use crate::digest::Writer;
use crate::digest::cells::CellIds;
use crate::digest::tables::{
    CELL_BINS, CELL_CONTRIBUTORS, CELL_NETWORKS, CELL_READERS, CELL_TA_BINS, CELL_TRANSITIONS, CELL_VALUES, CONTRIBUTOR_MONTHS, HANDOVER_BINS,
    NEIGHBOUR_BINS, NSA_LINKS, PERSON_TRAIL_BINS, SAME_READING_PAIRS, TRAIL_LEVELS, TRAIL_SQUARES,
};
use crate::fold_inputs::rat_of_label;
use crate::record::reader_id;
use crate::sql_types::{Date, Label, int, smallint};

fn uuid_of(text: &str) -> Result<Uuid, StoreError> {
    Uuid::parse_str(text).map_err(|_| StoreError::data(format!("{text} is not a uuid")))
}

impl Writer<'_> {
    pub(super) async fn cell_bins(&self, deltas: &Deltas, cells: &CellIds) -> Result<(), StoreError> {
        if deltas.cell_bins.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&CELL_BINS).await?;
        for (key, row) in &deltas.cell_bins {
            copy.as_mut()
                .write(&[
                    &cells.of(&key.cell)?,
                    &(key.bin as i64),
                    &int(sign * row.sample_count)?,
                    &(sign * row.weight_milli),
                    &(sign * row.serving_weight_milli),
                    &(sign * row.level_wsum),
                    &(sign * row.level_wsq),
                    &(sign * row.quality_weight_milli),
                    &(sign * row.quality_wsum),
                    &(sign * row.sinr_weight_milli),
                    &(sign * row.sinr_wsum),
                    &(sign * row.sinr_wsq),
                    &(sign * row.offset_x_wsum),
                    &(sign * row.offset_y_wsum),
                    &int(sign * row.stationary_count)?,
                    &row.contributor_bits.cast_signed(),
                    &Date(row.seen.first),
                    &Date(row.seen.last),
                ])
                .await?;
        }
        self.merge(copy, &CELL_BINS).await
    }

    pub(super) async fn cell_ta_bins(&self, deltas: &Deltas, cells: &CellIds) -> Result<(), StoreError> {
        if deltas.cell_ta_bins.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&CELL_TA_BINS).await?;
        for (key, row) in &deltas.cell_ta_bins {
            copy.as_mut()
                .write(&[
                    &cells.of(&key.cell)?,
                    &(key.bin as i64),
                    &key.ta_group_id,
                    &key.timing_advance,
                    &int(sign * row.sample_count)?,
                    &(sign * row.weight_milli),
                    &Date(row.last_seen_on),
                ])
                .await?;
        }
        self.merge(copy, &CELL_TA_BINS).await
    }

    pub(super) async fn cell_values(&self, deltas: &Deltas, cells: &CellIds) -> Result<Vec<i32>, StoreError> {
        if deltas.cell_values.is_empty() {
            return Ok(Vec::new());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&CELL_VALUES).await?;
        for (key, row) in &deltas.cell_values {
            copy.as_mut()
                .write(&[
                    &cells.of(&key.cell)?,
                    &Label(key.field.as_str()),
                    &int(key.value)?,
                    &key.held,
                    &int(sign * row.sample_count)?,
                    &row.contributor_bits.cast_signed(),
                    &Date(row.seen.first),
                    &Date(row.seen.last),
                ])
                .await?;
        }
        self.merge_finding_changed_cells(copy, &CELL_VALUES).await
    }

    pub(super) async fn cell_networks(&self, deltas: &Deltas, cells: &CellIds) -> Result<Vec<i32>, StoreError> {
        if deltas.cell_networks.is_empty() {
            return Ok(Vec::new());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&CELL_NETWORKS).await?;
        for (key, row) in &deltas.cell_networks {
            copy.as_mut()
                .write(&[
                    &cells.of(&key.cell)?,
                    &key.plmn,
                    &int(sign * row.sample_count)?,
                    &row.contributor_bits.cast_signed(),
                    &Date(row.seen.first),
                    &Date(row.seen.last),
                ])
                .await?;
        }
        self.merge_finding_changed_cells(copy, &CELL_NETWORKS).await
    }

    pub(super) async fn cell_contributors(&self, deltas: &Deltas, cells: &CellIds) -> Result<(), StoreError> {
        if deltas.cell_contributors.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&CELL_CONTRIBUTORS).await?;
        for (key, row) in &deltas.cell_contributors {
            copy.as_mut()
                .write(&[
                    &cells.of(&key.cell)?,
                    &uuid_of(&key.device_id)?,
                    &int(sign * row.sample_count)?,
                    &int(sign * row.trip_count)?,
                    &Date(row.seen.first),
                    &Date(row.seen.last),
                ])
                .await?;
        }
        self.merge(copy, &CELL_CONTRIBUTORS).await
    }

    pub(super) async fn cell_readers(&self, deltas: &Deltas, cells: &CellIds, reader_ids: &BTreeMap<ReaderVersion, i16>) -> Result<(), StoreError> {
        if deltas.cell_readers.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&CELL_READERS).await?;
        for (key, row) in &deltas.cell_readers {
            let reader_version_id = reader_id(reader_ids, &key.reader)?;
            copy.as_mut().write(&[&cells.of(&key.cell)?, &reader_version_id, &int(sign * row.sample_count)?]).await?;
        }
        self.merge(copy, &CELL_READERS).await
    }

    pub(super) async fn handover_bins(&self, deltas: &Deltas, cells: &CellIds) -> Result<(), StoreError> {
        if deltas.handover_bins.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&HANDOVER_BINS).await?;
        for (key, row) in &deltas.handover_bins {
            copy.as_mut()
                .write(&[
                    &cells.of(&key.from)?,
                    &cells.of(&key.to)?,
                    &(key.bin as i64),
                    &int(sign * row.handover_count)?,
                    &(sign * row.weight_milli),
                    &Date(row.last_seen_on),
                ])
                .await?;
        }
        self.merge(copy, &HANDOVER_BINS).await
    }

    pub(super) async fn cell_transitions(&self, deltas: &Deltas, cells: &CellIds) -> Result<(), StoreError> {
        if deltas.cell_transitions.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&CELL_TRANSITIONS).await?;
        for (key, row) in &deltas.cell_transitions {
            copy.as_mut().write(&[&cells.of(&key.from)?, &cells.of(&key.to)?, &int(sign * row.transition_count)?, &Date(row.last_seen_on)]).await?;
        }
        self.merge(copy, &CELL_TRANSITIONS).await
    }

    pub(super) async fn neighbour_bins(&self, deltas: &Deltas) -> Result<(), StoreError> {
        if deltas.neighbour_bins.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&NEIGHBOUR_BINS).await?;
        for (key, row) in &deltas.neighbour_bins {
            copy.as_mut()
                .write(&[
                    &key.plmn,
                    &Label(key.rat.as_database_value()),
                    &int(key.channel)?,
                    &smallint(key.pci)?,
                    &(key.bin as i64),
                    &key.held,
                    &int(sign * row.sample_count)?,
                    &(sign * row.weight_milli),
                    &(sign * row.level_wsum),
                    &row.contributor_bits.cast_signed(),
                    &Date(row.seen.first),
                    &Date(row.seen.last),
                ])
                .await?;
        }
        self.merge(copy, &NEIGHBOUR_BINS).await
    }

    pub(super) async fn nsa_links(&self, deltas: &Deltas, cells: &CellIds) -> Result<(), StoreError> {
        if deltas.nsa_links.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&NSA_LINKS).await?;
        for (key, row) in &deltas.nsa_links {
            copy.as_mut()
                .write(&[
                    &cells.of(&key.anchor)?,
                    &int(key.nr_arfcn)?,
                    &smallint(key.nr_pci)?,
                    &key.held,
                    &int(sign * row.sample_count)?,
                    &(sign * row.weight_milli),
                    &(sign * row.level_wsum),
                    &Date(row.seen.first),
                    &Date(row.seen.last),
                ])
                .await?;
        }
        self.merge(copy, &NSA_LINKS).await
    }

    pub(super) async fn same_reading_pairs(&self, deltas: &Deltas, cells: &CellIds) -> Result<(), StoreError> {
        if deltas.same_reading_pairs.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut pairs: BTreeMap<(i32, i32, bool), i64> = BTreeMap::new();
        for (key, row) in &deltas.same_reading_pairs {
            let (first, second) = (cells.of(&key.first)?, cells.of(&key.second)?);
            *pairs.entry((first.min(second), first.max(second), key.held)).or_insert(0) += row.sample_count;
        }
        let mut copy = self.open_table(&SAME_READING_PAIRS).await?;
        for ((lower, higher, held), sample_count) in pairs {
            copy.as_mut().write(&[&lower, &higher, &held, &int(sign * sample_count)?]).await?;
        }
        self.merge(copy, &SAME_READING_PAIRS).await
    }

    async fn copy_trail_squares(&self, deltas: &Deltas) -> Result<(), StoreError> {
        let mut copy = self.open_table(&TRAIL_SQUARES).await?;
        for (key, row) in &deltas.trail_squares {
            copy.as_mut()
                .write(&[
                    &key.plmn,
                    &Label(key.rat.as_database_value()),
                    &int(key.channel)?,
                    &i16::from(key.zoom),
                    &(key.bin as i64),
                    &key.held,
                    &row.contributor_bits.cast_signed(),
                    &Date(row.last_seen_on),
                ])
                .await?;
        }
        copy.as_mut().finish().await?;
        Ok(())
    }

    pub(super) async fn add_trail_squares(
        &self,
        deltas: &Deltas,
        origins: &BTreeMap<TrailSquareKey, SquareOrigin>,
    ) -> Result<BTreeMap<SquareOrigin, i64>, StoreError> {
        let mut new_squares = BTreeMap::new();
        if deltas.trail_squares.is_empty() {
            return Ok(new_squares);
        }
        self.copy_trail_squares(deltas).await?;
        let returning = "RETURNING plmn, rat::text, channel, zoom, bin, held, xmax = 0";
        let rows = self.transaction.query(&format!("{} {returning}", TRAIL_SQUARES.upsert(Direction::Add)), &[]).await?;
        for row in rows.iter().filter(|row| row.get::<_, bool>(6)) {
            let key = TrailSquareKey {
                plmn: row.get(0),
                rat: rat_of_label(row.get(1))?,
                channel: i64::from(row.get::<_, i32>(2)),
                zoom: u8::try_from(row.get::<_, i16>(3)).map_err(|_| StoreError::data("a trail zoom out of range"))?,
                bin: row.get::<_, i64>(4) as u64,
                held: row.get(5),
            };
            if let Some(origin) = origins.get(&key) {
                *new_squares.entry(origin.clone()).or_insert(0) += 1;
            }
        }
        Ok(new_squares)
    }

    pub(super) async fn remove_unmeasured_trail_squares(&self, deltas: &Deltas) -> Result<(), StoreError> {
        if deltas.trail_squares.is_empty() {
            return Ok(());
        }
        self.copy_trail_squares(deltas).await?;
        self.transaction
            .execute(
                "DELETE FROM observations.trail_squares t USING pg_temp.delta_trail_squares d
                 WHERE t.plmn = d.plmn AND t.rat = d.rat AND t.channel = d.channel AND t.zoom = d.zoom AND t.bin = d.bin AND t.held = d.held
                   AND NOT EXISTS (
                     SELECT 1 FROM observations.trail_levels l
                     WHERE l.plmn = t.plmn AND l.rat = t.rat AND l.channel = t.channel AND l.zoom = t.zoom AND l.bin = t.bin AND l.held = t.held
                   )",
                &[],
            )
            .await?;
        Ok(())
    }

    pub(super) async fn trail_levels(&self, deltas: &Deltas) -> Result<(), StoreError> {
        if deltas.trail_levels.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&TRAIL_LEVELS).await?;
        for (key, row) in &deltas.trail_levels {
            let square = &key.square;
            copy.as_mut()
                .write(&[
                    &square.plmn,
                    &Label(square.rat.as_database_value()),
                    &int(square.channel)?,
                    &i16::from(square.zoom),
                    &(square.bin as i64),
                    &square.held,
                    &i16::from(key.level_bucket),
                    &int(sign * row.sample_count)?,
                ])
                .await?;
        }
        self.merge(copy, &TRAIL_LEVELS).await
    }

    pub(super) async fn person_trail_bins(&self, deltas: &Deltas) -> Result<(), StoreError> {
        if deltas.person_trail_bins.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&PERSON_TRAIL_BINS).await?;
        for (key, row) in &deltas.person_trail_bins {
            copy.as_mut()
                .write(&[
                    &uuid_of(&key.user_id)?,
                    &key.plmn,
                    &Label(key.rat.as_database_value()),
                    &(key.bin as i64),
                    &int(sign * row.sample_count)?,
                    &Date(row.last_seen_on),
                ])
                .await?;
        }
        self.merge(copy, &PERSON_TRAIL_BINS).await
    }

    pub(super) async fn contributor_months(
        &self,
        deltas: &Deltas,
        user_id: Option<Uuid>,
        new_squares: &BTreeMap<SquareOrigin, i64>,
    ) -> Result<(), StoreError> {
        let mut months: BTreeMap<ContributorMonthKey, (i64, i64)> = BTreeMap::new();
        for (key, row) in &deltas.contributor_months {
            months.entry(key.clone()).or_default().0 += row.sample_count;
        }
        if let Some(user_id) = user_id {
            for (origin, count) in new_squares {
                let key =
                    ContributorMonthKey { user_id: user_id.hyphenated().to_string(), country_code: origin.country_code.clone(), month: origin.month };
                months.entry(key).or_default().1 += count;
            }
        }
        if months.is_empty() {
            return Ok(());
        }
        let sign = self.sign();
        let mut copy = self.open_table(&CONTRIBUTOR_MONTHS).await?;
        for (key, (sample_count, square_count)) in &months {
            copy.as_mut()
                .write(&[&uuid_of(&key.user_id)?, &key.country_code, &Date(key.month), &int(sign * sample_count)?, &int(sign * square_count)?])
                .await?;
        }
        self.merge(copy, &CONTRIBUTOR_MONTHS).await
    }
}
