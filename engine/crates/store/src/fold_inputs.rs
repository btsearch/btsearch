use std::collections::{BTreeMap, BTreeSet};

use engine_batch::document::{Batch, ReaderSource};
use engine_fold::identity::{CellEntry, CellIdentity, Rat};
use engine_fold::inputs::{BlockField, BlockMode, BlockRole, ConfirmedCell, ReaderVersion, ReadingBlock};
use engine_fold::report::SquareOrigin;
use engine_geo::Point;
use tokio_postgres::types::ToSql;
use tokio_postgres::{GenericClient, Row};
use uuid::Uuid;

use crate::StoreError;
use crate::ground_truth::GROUND_TRUTH;
use crate::sql_types::{Date, Timestamp};

const FIRST_WEEK_MICROS: i64 = 7 * 24 * 60 * 60 * 1_000_000;
const UNKNOWN_MODEM_FAMILY: &str = "other";

pub struct Phone {
    pub user_id: Option<Uuid>,
    pub weight: f32,
    pub is_weight_computed: bool,
    pub contributor_since: Option<Timestamp>,
    pub device_model_id: i32,
    pub soc_id: Option<i16>,
    pub modem_family: Option<String>,
}

pub struct Recorded {
    pub fold_version: i16,
    pub weight_milli: i16,
    pub outline_version: i16,
    pub ta_groups: BTreeMap<ReaderSource, i16>,
    pub skipped_rules: BTreeSet<String>,
    pub closed_countries: BTreeSet<String>,
    pub reading_blocks: Vec<ReadingBlock>,
    pub new_squares: BTreeMap<SquareOrigin, i64>,
}

pub fn device_weight_milli(weight: f32, is_computed: bool, in_first_week: bool) -> i64 {
    let milli = (f64::from(weight) * 1_000.0).round() as i64;
    if is_computed && in_first_week { milli / 2 } else { milli }
}

pub fn is_in_first_week(contributor_since: Option<Timestamp>, received_at: Timestamp) -> bool {
    contributor_since.is_some_and(|since| received_at.micros_since_1970 < since.micros_since_1970 + FIRST_WEEK_MICROS)
}

pub async fn phone(client: &impl GenericClient, device_id: Uuid) -> Result<Phone, StoreError> {
    let row = client
        .query_one(
            "SELECT d.user_id, w.weight, w.basis = 'computed', c.created_at, d.model_id, s.id, s.modem_family::text
             FROM observations.devices d
             JOIN observations.device_models m ON m.id = d.model_id
             JOIN observations.device_weights_now w ON w.device_id = d.id
             LEFT JOIN observations.board_socs b ON m.soc_id IS NULL AND b.board = m.board
             LEFT JOIN observations.socs s ON s.id = coalesce(m.soc_id, b.soc_id)
             LEFT JOIN observations.contributors c ON c.user_id = d.user_id
             WHERE d.id = $1",
            &[&device_id],
        )
        .await?;
    Ok(Phone {
        user_id: row.get(0),
        weight: row.get(1),
        is_weight_computed: row.get(2),
        contributor_since: row.get(3),
        device_model_id: row.get(4),
        soc_id: row.get(5),
        modem_family: row.get(6),
    })
}

pub fn sources_of(batch: &Batch) -> BTreeSet<ReaderSource> {
    batch.readers.iter().map(|reader| reader.source).collect()
}

pub fn source_label(source: ReaderSource) -> &'static str {
    match source {
        ReaderSource::Api => "api",
        ReaderSource::ModemLog => "modemLog",
        ReaderSource::ModemPoll => "modemPoll",
    }
}

pub fn source_of_label(label: &str) -> Result<ReaderSource, StoreError> {
    match label {
        "api" => Ok(ReaderSource::Api),
        "modemLog" => Ok(ReaderSource::ModemLog),
        "modemPoll" => Ok(ReaderSource::ModemPoll),
        other => Err(StoreError::data(format!("unknown reader source {other}"))),
    }
}

pub async fn ta_groups(
    client: &impl GenericClient,
    sources: &BTreeSet<ReaderSource>,
    phone: &Phone,
) -> Result<BTreeMap<ReaderSource, i16>, StoreError> {
    let labels: Vec<&str> = sources.iter().map(|&source| source_label(source)).collect();
    let modem_family = phone.modem_family.as_deref().unwrap_or(UNKNOWN_MODEM_FAMILY);
    client
        .execute(
            "INSERT INTO observations.ta_groups (source, modem_family)
             SELECT source::reader_source, $2::text::modem_family FROM unnest($1::text[]) AS sources(source)
             ORDER BY 1
             ON CONFLICT (source, modem_family) DO NOTHING",
            &[&labels, &modem_family],
        )
        .await?;
    let rows = client
        .query(
            "SELECT source::text, id, device_model_id IS NOT NULL FROM observations.ta_groups
             WHERE source::text = ANY($1) AND (device_model_id = $2 OR modem_family::text = $3)",
            &[&labels, &phone.device_model_id, &modem_family],
        )
        .await?;
    let mut groups = BTreeMap::new();
    let mut own_groups = BTreeSet::new();
    for row in rows {
        let source = source_of_label(row.get(0))?;
        let is_own_group: bool = row.get(2);
        if is_own_group || !own_groups.contains(&source) {
            groups.insert(source, row.get(1));
        }
        if is_own_group {
            own_groups.insert(source);
        }
    }
    Ok(groups)
}

pub async fn confirmed_cells(client: &impl GenericClient, batch: &Batch) -> Result<BTreeMap<CellIdentity, ConfirmedCell>, StoreError> {
    let identities: BTreeSet<CellIdentity> =
        batch.cells.iter().filter_map(|cell| CellEntry::of(cell, &BTreeSet::new(), &mut BTreeSet::new()).identity).collect();
    let plmns: Vec<&str> = identities.iter().map(|identity| identity.plmn.as_str()).collect();
    let rats: Vec<&str> = identities.iter().map(|identity| identity.rat.as_database_value()).collect();
    let keys: Vec<i64> = identities.iter().map(|identity| identity.cell_key).collect();
    let rows = client
        .query(
            &format!(
                "SELECT i.plmn, i.rat, i.cell_key, st.id, l.latitude, l.longitude,
                   coalesce(lc.pci, nc.pci, uc.psc, gc.bsic), coalesce(lc.earfcn, nc.arfcn, uc.arfcn), coalesce(lc.tac, nc.nrtac, uc.lac, gc.lac)
                 FROM unnest($1::text[], $2::text[], $3::int8[]) AS i(plmn, rat, cell_key)
                 JOIN observations.observed_cells oc ON oc.plmn = i.plmn AND oc.rat = i.rat::rat AND oc.cell_key = i.cell_key
                 JOIN observations.cell_matches m ON m.observed_cell_id = oc.id
                 JOIN public.cells c ON c.id = m.cell_id
                 JOIN public.stations st ON st.id = c.station_id
                 JOIN public.locations l ON l.id = st.location_id
                 LEFT JOIN public.lte_cells lc ON lc.cell_id = c.id
                 LEFT JOIN public.nr_cells nc ON nc.cell_id = c.id
                 LEFT JOIN public.umts_cells uc ON uc.cell_id = c.id
                 LEFT JOIN public.gsm_cells gc ON gc.cell_id = c.id
                 WHERE {GROUND_TRUTH}"
            ),
            &[&plmns, &rats, &keys],
        )
        .await?;
    rows.iter()
        .map(|row| {
            let identity = CellIdentity { plmn: row.get(0), rat: rat_of_label(row.get(1))?, cell_key: row.get(2) };
            let curated = |index: usize| row.get::<_, Option<i32>>(index).map(i64::from);
            let cell = ConfirmedCell {
                station_id: row.get(3),
                station: Point::new(row.get(4), row.get(5)),
                pci: curated(6),
                channel: curated(7),
                area_code: curated(8),
            };
            Ok((identity, cell))
        })
        .collect()
}

pub async fn closed_countries(client: &impl GenericClient) -> Result<BTreeSet<String>, StoreError> {
    let rows = client.query("SELECT code::text FROM public.countries WHERE NOT ('measurements'::country_tool = ANY (tools))", &[]).await?;
    Ok(rows.iter().map(|row| row.get(0)).collect())
}

pub async fn blocked_quirk_rules(client: &impl GenericClient) -> Result<BTreeSet<String>, StoreError> {
    let rows = client.query("SELECT quirk_rule_id FROM observations.blocked_quirk_rules", &[]).await?;
    Ok(rows.iter().map(|row| row.get(0)).collect())
}

const READING_BLOCK_COLUMNS: &str = "b.id, v.reader_name, v.version, b.rats::text[], b.roles::text[], b.fields::text[], b.mode::text";

pub async fn matching_reading_blocks(client: &impl GenericClient, phone: &Phone, batch: &Batch) -> Result<Vec<ReadingBlock>, StoreError> {
    let sdk_int = i32::try_from(batch.os.sdk_int).unwrap_or(i32::MAX);
    let rows = client
        .query(
            &format!(
                "SELECT {READING_BLOCK_COLUMNS} FROM observations.reading_blocks b
                 LEFT JOIN observations.reader_versions v ON v.id = b.reader_version_id
                 WHERE b.disabled_at IS NULL
                   AND (b.modem_family IS NULL OR b.modem_family::text = $1)
                   AND (b.soc_id IS NULL OR b.soc_id = $2)
                   AND (b.device_model_id IS NULL OR b.device_model_id = $3)
                   AND (b.sdk_int_min IS NULL OR b.sdk_int_min <= $4::int)
                   AND (b.sdk_int_max IS NULL OR b.sdk_int_max >= $4::int)
                   AND (b.radio_version_prefix IS NULL OR starts_with($5, b.radio_version_prefix))
                 ORDER BY b.id"
            ),
            &[&phone.modem_family, &phone.soc_id, &phone.device_model_id, &sdk_int, &batch.os.radio_version],
        )
        .await?;
    rows.iter().map(reading_block).collect()
}

fn reading_block(row: &Row) -> Result<ReadingBlock, StoreError> {
    let reader_version = row.get::<_, Option<String>>(1).zip(row.get::<_, Option<String>>(2)).map(|(name, version)| ReaderVersion { name, version });
    let rats = row.get::<_, Option<Vec<String>>>(3).map(|labels| parse_labels(&labels, rat_of_label)).transpose()?;
    let roles = row.get::<_, Option<Vec<String>>>(4).map(|labels| parse_labels(&labels, role_of_label)).transpose()?;
    let fields = row.get::<_, Option<Vec<String>>>(5).map(|labels| parse_labels(&labels, field_of_label)).transpose()?;
    let mode = match row.get::<_, &str>(6) {
        "drop" => BlockMode::Drop,
        "corroborate" => BlockMode::Corroborate,
        other => return Err(StoreError::data(format!("unknown reading block mode {other}"))),
    };
    Ok(ReadingBlock { id: row.get(0), reader_version, rats, roles, fields, mode })
}

fn parse_labels<T>(labels: &[String], parse: fn(&str) -> Result<T, StoreError>) -> Result<Vec<T>, StoreError> {
    labels.iter().map(|label| parse(label)).collect()
}

pub fn rat_of_label(label: &str) -> Result<Rat, StoreError> {
    match label {
        "GSM" => Ok(Rat::Gsm),
        "UMTS" => Ok(Rat::Umts),
        "LTE" => Ok(Rat::Lte),
        "NR" => Ok(Rat::Nr),
        other => Err(StoreError::data(format!("the engine does not fold {other}"))),
    }
}

fn role_of_label(label: &str) -> Result<BlockRole, StoreError> {
    match label {
        "serving" => Ok(BlockRole::Serving),
        "neighbour" => Ok(BlockRole::Neighbour),
        "nsa" => Ok(BlockRole::Nsa),
        other => Err(StoreError::data(format!("unknown reading block role {other}"))),
    }
}

fn field_of_label(label: &str) -> Result<BlockField, StoreError> {
    match label {
        "pci" => Ok(BlockField::Pci),
        "channel" => Ok(BlockField::Channel),
        "areaCode" => Ok(BlockField::AreaCode),
        "bandwidth" => Ok(BlockField::Bandwidth),
        "timingAdvance" => Ok(BlockField::TimingAdvance),
        "signal" => Ok(BlockField::Signal),
        other => Err(StoreError::data(format!("unknown reading block field {other}"))),
    }
}

const RECORDED_FOLD: &str = "SELECT fold_version, weight_milli, outline_version FROM observations.upload_folds WHERE upload_id = $1";
const RECORDED_TA_GROUPS: &str = "SELECT source::text, ta_group_id FROM observations.upload_ta_groups WHERE upload_id = $1";
const RECORDED_SKIPPED_RULES: &str = "SELECT quirk_rule_id FROM observations.upload_skipped_rules WHERE upload_id = $1";
const RECORDED_CLOSED_COUNTRIES: &str = "SELECT country_code::text FROM observations.upload_closed_countries WHERE upload_id = $1";
const RECORDED_NEW_SQUARES: &str = "SELECT country_code::text, month, square_count FROM observations.upload_new_squares WHERE upload_id = $1";

pub async fn recorded(client: &impl GenericClient, upload_id: Uuid) -> Result<Option<Recorded>, StoreError> {
    let of_upload: [&(dyn ToSql + Sync); 1] = [&upload_id];
    let recorded_blocks = format!(
        "SELECT {READING_BLOCK_COLUMNS} FROM observations.upload_blocked_values u
         JOIN observations.reading_blocks b ON b.id = u.reading_block_id
         LEFT JOIN observations.reader_versions v ON v.id = b.reader_version_id
         WHERE u.upload_id = $1
         ORDER BY b.id"
    );
    let (fold, ta_groups, skipped_rules, closed_countries, reading_blocks, new_squares) = tokio::try_join!(
        client.query_opt(RECORDED_FOLD, &of_upload),
        client.query(RECORDED_TA_GROUPS, &of_upload),
        client.query(RECORDED_SKIPPED_RULES, &of_upload),
        client.query(RECORDED_CLOSED_COUNTRIES, &of_upload),
        client.query(&recorded_blocks, &of_upload),
        client.query(RECORDED_NEW_SQUARES, &of_upload),
    )?;
    let Some(fold) = fold else {
        return Ok(None);
    };

    let ta_groups = ta_groups.iter().map(|row| Ok((source_of_label(row.get(0))?, row.get(1)))).collect::<Result<BTreeMap<_, _>, StoreError>>()?;
    let reading_blocks = reading_blocks.iter().map(reading_block).collect::<Result<Vec<_>, _>>()?;
    let new_squares = new_squares
        .iter()
        .map(|row| {
            let month: Date = row.get(1);
            (SquareOrigin { country_code: row.get(0), month: month.0 }, i64::from(row.get::<_, i32>(2)))
        })
        .collect();

    Ok(Some(Recorded {
        fold_version: fold.get(0),
        weight_milli: fold.get(1),
        outline_version: fold.get(2),
        ta_groups,
        skipped_rules: skipped_rules.iter().map(|row| row.get(0)).collect(),
        closed_countries: closed_countries.iter().map(|row| row.get(0)).collect(),
        reading_blocks,
        new_squares,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_computed_weight_is_halved_in_the_first_week_and_an_admins_is_not() {
        assert_eq!(device_weight_milli(1.0, true, false), 1_000);
        assert_eq!(device_weight_milli(0.1, true, true), 50);
        assert_eq!(device_weight_milli(0.05, true, true), 25);
        assert_eq!(device_weight_milli(1.5, false, true), 1_500);

        let since = Timestamp { micros_since_1970: 0 };
        assert!(is_in_first_week(Some(since), Timestamp { micros_since_1970: FIRST_WEEK_MICROS - 1 }));
        assert!(!is_in_first_week(Some(since), Timestamp { micros_since_1970: FIRST_WEEK_MICROS }));
        assert!(!is_in_first_week(None, since));
    }
}
