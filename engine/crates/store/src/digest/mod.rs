mod cells;
mod deltas;
mod tables;

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::pin::Pin;
use std::sync::Mutex;

use engine_fold::deltas::{Deltas, TrailSquareKey};
use engine_fold::inputs::ReaderVersion;
use engine_fold::memory::Direction;
use engine_fold::report::SquareOrigin;
use tokio_postgres::binary_copy::BinaryCopyInWriter;
use tokio_postgres::types::Type;
use tokio_postgres::{Client, Row, Transaction};
use uuid::Uuid;

use crate::StoreError;
use crate::digest::tables::{DIGEST, Table};
use crate::summaries;

const DELTA_SITES: &str = "pg_temp.delta_sites";
const DELTA_SITE_COLUMNS: &str = "plmn, rat, node_id";
const DELTA_CELLS: &str = "pg_temp.delta_cells";
const DELTA_CELL_COLUMNS: &str = "plmn, rat, cell_key, node_id";
const NEW_OR_SEEN_BY_ANOTHER_PERSON: &str = "RETURNING observed_cell_id, old.contributor_bits IS DISTINCT FROM new.contributor_bits";

pub struct Upload<'a> {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub reader_ids: &'a BTreeMap<ReaderVersion, i16>,
    pub trail_square_origins: &'a BTreeMap<TrailSquareKey, SquareOrigin>,
    pub recorded_new_squares: &'a BTreeMap<SquareOrigin, i64>,
}

#[derive(Debug, Default)]
pub struct Touched {
    pub cells: Vec<i32>,
    pub removed_cells: Vec<i32>,
    pub new_squares: BTreeMap<SquareOrigin, i64>,
}

#[derive(Default)]
pub struct CopyTypes {
    by_table: Mutex<HashMap<String, Vec<Type>>>,
}

impl CopyTypes {
    async fn of(&self, transaction: &Transaction<'_>, delta_table: &str, columns: &str) -> Result<Vec<Type>, StoreError> {
        let cached = self.by_table.lock().expect("the copy types are never poisoned").get(delta_table).cloned();
        if let Some(types) = cached {
            return Ok(types);
        }
        let statement = transaction.prepare(&format!("SELECT {columns} FROM {delta_table}")).await?;
        let types: Vec<Type> = statement.columns().iter().map(|column| column.type_().clone()).collect();
        self.by_table.lock().expect("the copy types are never poisoned").insert(delta_table.to_owned(), types.clone());
        Ok(types)
    }
}

pub async fn prepare_session(client: &Client) -> Result<(), StoreError> {
    let digest_tables: String = DIGEST.iter().map(|table| table.create_delta_table()).collect::<Vec<_>>().join("\n");
    client
        .batch_execute(&format!(
            "DO $$ BEGIN
               IF to_regclass('{DELTA_CELLS}') IS NULL THEN
                 CREATE TEMP TABLE delta_sites (plmn varchar(6) NOT NULL, rat rat NOT NULL, node_id bigint NOT NULL) ON COMMIT DELETE ROWS;
                 CREATE TEMP TABLE delta_cells (plmn varchar(6) NOT NULL, rat rat NOT NULL, cell_key bigint NOT NULL, node_id bigint) ON COMMIT DELETE ROWS;
                 {digest_tables}
               END IF;
             END $$"
        ))
        .await?;
    Ok(())
}

async fn empty_delta_tables(transaction: &Transaction<'_>) -> Result<(), StoreError> {
    let digest_tables: Vec<String> = DIGEST.iter().map(|table| table.delta_table()).collect();
    transaction.batch_execute(&format!("TRUNCATE {DELTA_SITES}, {DELTA_CELLS}, {}", digest_tables.join(", "))).await?;
    Ok(())
}

pub async fn apply(
    transaction: &Transaction<'_>,
    types: &CopyTypes,
    deltas: &Deltas,
    upload: &Upload<'_>,
    direction: Direction,
) -> Result<Touched, StoreError> {
    empty_delta_tables(transaction).await?;
    let writer = Writer { transaction, types, direction };
    let cells = writer.observed_cells(&deltas.cells(), upload.id).await?;

    writer.cell_bins(deltas, &cells).await?;
    writer.cell_ta_bins(deltas, &cells).await?;
    let cells_with_changed_values = writer.cell_values(deltas, &cells).await?;
    let cells_with_changed_networks = writer.cell_networks(deltas, &cells).await?;
    writer.cell_contributors(deltas, &cells).await?;
    writer.cell_readers(deltas, &cells, upload.reader_ids).await?;
    writer.handover_bins(deltas, &cells).await?;
    writer.cell_transitions(deltas, &cells).await?;
    writer.neighbour_bins(deltas).await?;
    writer.nsa_links(deltas, &cells).await?;
    writer.same_reading_pairs(deltas, &cells).await?;
    let new_squares = match direction {
        Direction::Add => {
            let new_squares = writer.add_trail_squares(deltas, upload.trail_square_origins).await?;
            writer.trail_levels(deltas).await?;
            new_squares
        }
        Direction::Subtract => {
            writer.trail_levels(deltas).await?;
            writer.remove_unmeasured_trail_squares(deltas).await?;
            upload.recorded_new_squares.clone()
        }
    };
    writer.person_trail_bins(deltas).await?;
    writer.contributor_months(deltas, upload.user_id, &new_squares).await?;

    let removed_cells = match direction {
        Direction::Add => Vec::new(),
        Direction::Subtract => writer.remove_empty_cells(&cells).await?,
    };
    let remaining: Vec<i32> = cells.touched().into_iter().filter(|id| !removed_cells.contains(id)).collect();
    let mut to_match: Vec<i32> = cells
        .created
        .iter()
        .copied()
        .chain(cells_with_changed_values)
        .chain(cells_with_changed_networks)
        .filter(|id| !removed_cells.contains(id))
        .collect();
    to_match.sort_unstable();
    to_match.dedup();
    writer.queue(&to_match, &cells.sites, &deltas.trail_tiles()).await?;
    summaries::refresh(transaction, &remaining).await?;

    Ok(Touched { cells: remaining, removed_cells, new_squares })
}

type CopyWriter = Pin<Box<BinaryCopyInWriter>>;

struct Writer<'a> {
    transaction: &'a Transaction<'a>,
    types: &'a CopyTypes,
    direction: Direction,
}

impl Writer<'_> {
    fn sign(&self) -> i64 {
        match self.direction {
            Direction::Add => 1,
            Direction::Subtract => -1,
        }
    }

    async fn open(&self, delta_table: &str, columns: &str) -> Result<CopyWriter, StoreError> {
        let types = self.types.of(self.transaction, delta_table, columns).await?;
        let sink = self.transaction.copy_in(&format!("COPY {delta_table} ({columns}) FROM STDIN BINARY")).await?;
        Ok(Box::pin(BinaryCopyInWriter::new(sink, &types)))
    }

    async fn open_table(&self, table: &Table) -> Result<CopyWriter, StoreError> {
        self.open(&table.delta_table(), &table.columns()).await
    }

    async fn merge(&self, mut copy: CopyWriter, table: &Table) -> Result<(), StoreError> {
        copy.as_mut().finish().await?;
        self.transaction.execute(&table.upsert(self.direction), &[]).await?;
        if self.direction == Direction::Subtract {
            self.check_and_delete_spent(table).await?;
        }
        Ok(())
    }

    async fn merge_finding_changed_cells(&self, mut copy: CopyWriter, table: &Table) -> Result<Vec<i32>, StoreError> {
        copy.as_mut().finish().await?;
        match self.direction {
            Direction::Add => {
                let rows = self.transaction.query(&format!("{} {NEW_OR_SEEN_BY_ANOTHER_PERSON}", table.upsert(Direction::Add)), &[]).await?;
                Ok(rows.iter().filter(|row| row.get::<_, bool>(1)).map(|row| row.get(0)).collect())
            }
            Direction::Subtract => {
                self.transaction.execute(&table.upsert(Direction::Subtract), &[]).await?;
                Ok(self.check_and_delete_spent(table).await?.iter().map(|row| row.get(0)).collect())
            }
        }
    }

    async fn check_and_delete_spent(&self, table: &Table) -> Result<Vec<Row>, StoreError> {
        let below_zero: i64 = self.transaction.query_one(&table.negative_rows(), &[]).await?.get(0);
        if below_zero > 0 {
            return Err(StoreError::Inexact(format!("{below_zero} rows of {} would fall below zero", table.name)));
        }
        let returning = table.key.iter().map(|column| format!("t.{column}")).collect::<Vec<_>>().join(", ");
        Ok(self.transaction.query(&format!("{} RETURNING {returning}", table.delete_spent()), &[]).await?)
    }

    async fn queue(&self, cells_to_match: &[i32], sites: &[i32], tiles: &BTreeSet<u64>) -> Result<(), StoreError> {
        if !cells_to_match.is_empty() {
            self.transaction
                .execute(
                    "INSERT INTO observations.match_queue (observed_cell_id)
                     SELECT id FROM unnest($1::int[]) AS cells(id) ORDER BY id
                     ON CONFLICT (observed_cell_id) DO UPDATE SET queued_at = now()",
                    &[&cells_to_match],
                )
                .await?;
        }
        if !sites.is_empty() {
            self.transaction
                .execute(
                    "INSERT INTO observations.dirty_sites (observed_site_id)
                     SELECT s.id FROM observations.observed_sites s WHERE s.id = ANY($1) ORDER BY s.id
                     ON CONFLICT (observed_site_id) DO NOTHING",
                    &[&sites],
                )
                .await?;
        }
        if !tiles.is_empty() {
            let tiles: Vec<i64> = tiles.iter().map(|&tile| tile as i64).collect();
            self.transaction
                .execute(
                    "INSERT INTO observations.trail_dirty_tiles (tile)
                     SELECT tile FROM unnest($1::bigint[]) AS tiles(tile) ORDER BY tile
                     ON CONFLICT (tile) DO NOTHING",
                    &[&tiles],
                )
                .await?;
        }
        Ok(())
    }
}
