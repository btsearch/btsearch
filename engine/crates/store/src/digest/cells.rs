use std::collections::{BTreeSet, HashMap};

use engine_fold::identity::CellIdentity;
use engine_fold::memory::Direction;
use uuid::Uuid;

use crate::StoreError;
use crate::digest::{DELTA_CELL_COLUMNS, DELTA_CELLS, DELTA_SITE_COLUMNS, DELTA_SITES, Writer};
use crate::fold_inputs::rat_of_label;
use crate::sql_types::Label;

pub(super) struct CellIds {
    ids: HashMap<CellIdentity, i32>,
    pub(super) created: Vec<i32>,
    pub(super) sites: Vec<i32>,
}

fn not_observed(cell: &CellIdentity) -> StoreError {
    StoreError::Inexact(format!("{} {:?} {} is not an observed cell", cell.plmn, cell.rat, cell.cell_key))
}

impl CellIds {
    pub(super) fn of(&self, cell: &CellIdentity) -> Result<i32, StoreError> {
        self.ids.get(cell).copied().ok_or_else(|| not_observed(cell))
    }

    pub(super) fn touched(&self) -> Vec<i32> {
        let mut ids: Vec<i32> = self.ids.values().copied().collect();
        ids.sort_unstable();
        ids
    }
}

impl Writer<'_> {
    pub(super) async fn observed_cells(&self, identities: &BTreeSet<CellIdentity>, upload_id: Uuid) -> Result<CellIds, StoreError> {
        let mut cells = CellIds { ids: HashMap::new(), created: Vec::new(), sites: Vec::new() };
        if identities.is_empty() {
            return Ok(cells);
        }

        if self.direction == Direction::Add {
            let sites: BTreeSet<_> = identities.iter().filter_map(CellIdentity::lte_site).collect();
            let mut copy = self.open(DELTA_SITES, DELTA_SITE_COLUMNS).await?;
            for site in &sites {
                copy.as_mut().write(&[&site.plmn, &Label(site.rat.as_database_value()), &site.node_id]).await?;
            }
            copy.as_mut().finish().await?;
            self.transaction
                .execute(
                    &format!(
                        "INSERT INTO observations.observed_sites (plmn, rat, node_id)
                         SELECT plmn, rat, node_id FROM {DELTA_SITES} ORDER BY plmn, rat, node_id
                         ON CONFLICT (plmn, rat, node_id) WHERE retired_at IS NULL DO NOTHING"
                    ),
                    &[],
                )
                .await?;
        }

        let mut copy = self.open(DELTA_CELLS, DELTA_CELL_COLUMNS).await?;
        for cell in identities {
            let node_id = cell.lte_site().map(|site| site.node_id);
            copy.as_mut().write(&[&cell.plmn, &Label(cell.rat.as_database_value()), &cell.cell_key, &node_id]).await?;
        }
        copy.as_mut().finish().await?;

        if self.direction == Direction::Add {
            let created = self
                .transaction
                .query(
                    &format!(
                        "INSERT INTO observations.observed_cells (plmn, rat, cell_key, observed_site_id, first_upload_id)
                         SELECT d.plmn, d.rat, d.cell_key, s.id, $1 FROM {DELTA_CELLS} d
                         LEFT JOIN observations.observed_sites s ON s.plmn = d.plmn AND s.rat = d.rat AND s.node_id = d.node_id AND s.retired_at IS NULL
                         ORDER BY d.plmn, d.rat, d.cell_key
                         ON CONFLICT (plmn, rat, cell_key) DO NOTHING
                         RETURNING id"
                    ),
                    &[&upload_id],
                )
                .await?;
            cells.created = created.iter().map(|row| row.get(0)).collect();
        }

        let lock = match self.direction {
            Direction::Add => "FOR NO KEY UPDATE OF c",
            Direction::Subtract => "FOR UPDATE OF c",
        };
        let rows = self
            .transaction
            .query(
                &format!(
                    "SELECT c.id, c.plmn, c.rat::text, c.cell_key, c.observed_site_id FROM {DELTA_CELLS} d
                     JOIN observations.observed_cells c ON c.plmn = d.plmn AND c.rat = d.rat AND c.cell_key = d.cell_key
                     ORDER BY c.id
                     {lock}"
                ),
                &[],
            )
            .await?;
        let mut sites = BTreeSet::new();
        for row in &rows {
            let identity = CellIdentity { plmn: row.get(1), rat: rat_of_label(row.get(2))?, cell_key: row.get(3) };
            cells.ids.insert(identity, row.get(0));
            sites.extend(row.get::<_, Option<i32>>(4));
        }
        cells.sites = sites.into_iter().collect();
        if let Some(missing) = identities.iter().find(|identity| !cells.ids.contains_key(*identity)) {
            return Err(not_observed(missing));
        }
        Ok(cells)
    }

    pub(super) async fn remove_empty_cells(&self, cells: &CellIds) -> Result<Vec<i32>, StoreError> {
        let touched = cells.touched();
        let removed = self
            .transaction
            .query(
                "DELETE FROM observations.observed_cells c
                 WHERE c.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM observations.cell_contributors k WHERE k.observed_cell_id = c.id)
                 RETURNING c.id",
                &[&touched],
            )
            .await?;
        self.transaction
            .execute(
                "DELETE FROM observations.observed_sites s
                 WHERE s.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM observations.observed_cells c WHERE c.observed_site_id = s.id)",
                &[&cells.sites],
            )
            .await?;
        Ok(removed.iter().map(|row| row.get(0)).collect())
    }
}
