use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use engine_geo::outlines::{CountryOutline, CountryOutlines};
use tokio_postgres::GenericClient;

use crate::StoreError;

const BUILD_LOCK: i64 = 0x0b75_c0de_0001;
const SIMPLIFY_DEGREES: f64 = 0.0009;

const SOURCE_FINGERPRINT: &str = "
    SELECT sha256(convert_to(coalesce(string_agg(
      r.id::text || ':' || r.country_code || ':' || (extract(epoch FROM b.updated_at) * 1000000)::bigint::text, ',' ORDER BY r.id
    ), ''), 'UTF8'))
    FROM public.region_boundaries b
    JOIN public.regions r ON r.id = b.region_id";

const NEWEST_VERSION: &str = "SELECT version, source_fingerprint FROM observations.country_outline_versions ORDER BY version DESC LIMIT 1";

const BUILD_OUTLINES: &str = "
    INSERT INTO observations.country_outlines (version, country_code, outline)
    SELECT $1, r.country_code, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(ST_Union(b.geom), $2)), 3))
    FROM public.region_boundaries b
    JOIN public.regions r ON r.id = b.region_id
    GROUP BY r.country_code
    ORDER BY r.country_code";

const FORGET_UNUSED_VERSIONS: &str = "
    DELETE FROM observations.country_outline_versions v
    WHERE v.version < $1 AND NOT EXISTS (
      SELECT 1 FROM observations.upload_folds f
      JOIN observations.uploads u ON u.id = f.upload_id
      WHERE f.outline_version = v.version AND f.unfolded_at IS NULL AND u.object_deleted_at IS NULL
    )";

#[derive(Default)]
pub struct OutlineVersions {
    loaded: Mutex<HashMap<i16, Arc<CountryOutlines>>>,
}

impl OutlineVersions {
    pub(crate) async fn get(&self, client: &impl GenericClient, version: i16) -> Result<Arc<CountryOutlines>, StoreError> {
        if let Some(outlines) = self.loaded.lock().expect("the outline cache is never poisoned").get(&version) {
            return Ok(outlines.clone());
        }
        let rows = client
            .query("SELECT country_code::text, ST_AsGeoJSON(outline) FROM observations.country_outlines WHERE version = $1 ORDER BY country_code", &[&version])
            .await?;
        let outlines = rows
            .iter()
            .map(|row| {
                let country_code: &str = row.get(0);
                CountryOutline::from_geojson(country_code, row.get(1))
                    .map_err(|error| StoreError::data(format!("the outline of {country_code} in version {version} is not GeoJSON: {error}")))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let outlines = Arc::new(CountryOutlines::new(outlines));
        self.loaded.lock().expect("the outline cache is never poisoned").insert(version, outlines.clone());
        Ok(outlines)
    }
}

pub(crate) async fn newest_version(client: &impl GenericClient) -> Result<Option<i16>, StoreError> {
    Ok(client.query_opt(NEWEST_VERSION, &[]).await?.map(|row| row.get(0)))
}

pub async fn build_when_changed(client: &mut deadpool_postgres::Client) -> Result<i16, StoreError> {
    let transaction = client.transaction().await?;
    transaction.execute("SELECT pg_advisory_xact_lock($1)", &[&BUILD_LOCK]).await?;
    let fingerprint: Vec<u8> = transaction.query_one(SOURCE_FINGERPRINT, &[]).await?.get(0);
    let newest = transaction.query_opt(NEWEST_VERSION, &[]).await?;
    let version = match newest {
        Some(row) if row.get::<_, Vec<u8>>(1) == fingerprint => row.get(0),
        _ => {
            let version: i16 = transaction
                .query_one("INSERT INTO observations.country_outline_versions (source_fingerprint) VALUES ($1) RETURNING version", &[&fingerprint])
                .await?
                .get(0);
            transaction.execute(BUILD_OUTLINES, &[&version, &SIMPLIFY_DEGREES]).await?;
            version
        }
    };
    transaction.execute(FORGET_UNUSED_VERSIONS, &[&version]).await?;
    transaction.commit().await?;
    Ok(version)
}
