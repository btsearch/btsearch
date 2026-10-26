#![allow(dead_code)]

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use engine_batch::SealKeys;
use engine_corpus::{GeneratedUpload, Options, generate, read_fixtures};
use engine_store::pipeline::{Finish, Outcome, Store};
use engine_store::queue::{Claim, UploadRow};
use engine_store::raw::{RawFiles, raw_file_path};
use engine_store::sql_types::Timestamp;
use engine_store::{Database, queue};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use tokio::sync::{Mutex, MutexGuard};
use uuid::Uuid;

pub const DATABASE_URL_VARIABLE: &str = "ENGINE_TEST_DATABASE_URL";
const SEAL_KEY_ID: &str = "test";
const TEST_EMAIL_DOMAIN: &str = "engine-test.invalid";

static ONE_TEST_AT_A_TIME: Mutex<()> = Mutex::const_new(());

pub struct Harness {
    pub store: Arc<Store>,
    pub raw_directory: PathBuf,
    _turn: MutexGuard<'static, ()>,
}

fn seal_key() -> [u8; 32] {
    std::array::from_fn(|index| index as u8)
}

pub fn fixtures_directory() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/v1")
}

pub fn corpus(uploads: usize, devices: usize, seed: u64) -> Vec<GeneratedUpload> {
    let fixtures: Vec<Value> =
        read_fixtures(&fixtures_directory()).expect("the fixtures are readable").into_iter().map(|(_, document)| document).collect();
    generate(&fixtures, &Options { uploads, devices, seed })
}

pub fn fixture_upload(name: &str, seed: u64) -> GeneratedUpload {
    let fixtures = read_fixtures(&fixtures_directory()).expect("the fixtures are readable");
    let (_, document) = fixtures.into_iter().find(|(fixture, _)| fixture == name).expect("the fixture exists");
    generate(&[document], &Options { uploads: 1, devices: 1, seed }).remove(0)
}

const RESET: &str = "
    TRUNCATE observations.observed_cells, observations.observed_sites, observations.neighbour_bins, observations.trail_squares,
      observations.person_trail_bins, observations.contributor_months, observations.trail_dirty_tiles, observations.engine_runs,
      observations.engine_heartbeats, observations.country_outline_versions, observations.devices, observations.device_models,
      observations.socs, observations.board_socs, observations.readers, observations.contributors, observations.ta_groups,
      observations.candidates, observations.candidate_sources, observations.calibration_runs, observations.evaluation_runs CASCADE;
    DELETE FROM auth.users WHERE email LIKE '%@engine-test.invalid';
    DELETE FROM public.regions WHERE code = 'ZZT';
    DELETE FROM public.operators WHERE full_name = 'engine-test';
    UPDATE public.countries SET tools = '{analyzer,measurements}';
    INSERT INTO observations.reading_blocks (modem_family, fields, mode, reason)
    VALUES ('samsung', '{pci,channel}', 'corroborate', 'Samsung modems, Exynos and Tensor, sometimes report the PCI or the channel of another cell');";

impl Harness {
    pub async fn start() -> Option<Self> {
        let Ok(url) = std::env::var(DATABASE_URL_VARIABLE) else {
            eprintln!("skipped: {DATABASE_URL_VARIABLE} is not set; it names an empty database built from the migrations");
            return None;
        };
        let turn = ONE_TEST_AT_A_TIME.lock().await;
        let raw_directory = std::env::temp_dir().join(format!("engine-store-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&raw_directory);
        fs::create_dir_all(&raw_directory).expect("a raw directory can be made");
        let keys = format!("{SEAL_KEY_ID}:{}", STANDARD.encode(seal_key()));
        let store = Store {
            database: Database::connect(&url).expect("the test database URL parses"),
            raw: RawFiles::on_disk(raw_directory.to_str().expect("a UTF-8 temp path")).expect("the raw directory opens"),
            seal_keys: Arc::new(SealKeys::parse(&keys).expect("the test key parses")),
            outlines: Default::default(),
            copy_types: Default::default(),
        };
        let harness = Self { store: Arc::new(store), raw_directory, _turn: turn };
        harness.reset().await;
        Some(harness)
    }

    pub async fn reset(&self) {
        let client = self.store.database.pool.get().await.expect("the test database accepts connections");
        let has_stations: bool =
            client.query_one("SELECT EXISTS (SELECT 1 FROM public.stations)", &[]).await.expect("stations can be counted").get(0);
        assert!(!has_stations, "{DATABASE_URL_VARIABLE} names a database with stations; these tests empty tables and run only on an empty database");
        client.batch_execute(RESET).await.expect("the test database resets");
    }

    pub async fn execute(&self, statement: &str) {
        let client = self.store.database.pool.get().await.expect("a connection");
        client.batch_execute(statement).await.unwrap_or_else(|error| panic!("{statement} failed: {error}"));
    }

    pub async fn seed_phone(&self, device_id: Uuid, modem_family: &str) {
        let user_id = Uuid::from_u128(device_id.as_u128() ^ 1);
        let client = self.store.database.pool.get().await.expect("a connection");
        let email = format!("{}@{TEST_EMAIL_DOMAIN}", user_id.simple());
        client.execute("INSERT INTO auth.users (id, email, name) VALUES ($1, $2, 'engine test')", &[&user_id, &email]).await.expect("a user");
        client
            .execute("INSERT INTO observations.contributors (user_id, created_at) VALUES ($1, now() - interval '30 days')", &[&user_id])
            .await
            .expect("a contributor");
        let soc_id: i16 = client
            .query_one(
                "INSERT INTO observations.socs (manufacturer, model, modem_family) VALUES ('Engine', $1, $2::text::modem_family)
                 ON CONFLICT (manufacturer, model) DO UPDATE SET modem_family = excluded.modem_family RETURNING id",
                &[&modem_family, &modem_family],
            )
            .await
            .expect("a SoC")
            .get(0);
        let model_id: i32 = client
            .query_one(
                "INSERT INTO observations.device_models (manufacturer, model, soc_id) VALUES ('Engine', $1, $2)
                 ON CONFLICT (manufacturer, model, soc_id) DO UPDATE SET updated_at = now() RETURNING id",
                &[&format!("Test phone {modem_family}"), &soc_id],
            )
            .await
            .expect("a device model")
            .get(0);
        client
            .execute(
                "INSERT INTO observations.devices (id, user_id, model_id, public_key) VALUES ($1, $2, $3, $4)",
                &[&device_id, &user_id, &model_id, &device_id.as_bytes().as_slice()],
            )
            .await
            .expect("a device");
    }

    pub async fn seed_phones(&self, uploads: &[GeneratedUpload], modem_family: &str) {
        let devices: BTreeSet<Uuid> = uploads.iter().map(|upload| upload.device_id).collect();
        for device_id in devices {
            self.seed_phone(device_id, modem_family).await;
        }
    }

    pub async fn store_upload(&self, upload: &GeneratedUpload) {
        let document = serde_json::to_vec(&upload.document).expect("a document serializes");
        let body = zstd::encode_all(document.as_slice(), 3).expect("zstd compresses");
        let body_sha256 = Sha256::digest(&body).to_vec();
        let upload_id = upload.upload_id.hyphenated().to_string();
        let cipher = Aes256Gcm::new_from_slice(&seal_key()).expect("a 32-byte key");
        let nonce: [u8; 12] = std::array::from_fn(|index| upload.upload_id.as_bytes()[index]);
        let sealed_body = cipher.encrypt((&nonce).into(), Payload { msg: &body, aad: upload_id.as_bytes() }).expect("the body seals");
        let mut sealed = vec![1_u8, SEAL_KEY_ID.len() as u8];
        sealed.extend_from_slice(SEAL_KEY_ID.as_bytes());
        sealed.extend_from_slice(&nonce);
        sealed.extend_from_slice(&sealed_body);

        let received_at = Timestamp::from_epoch_millis(upload.received_at_millis);
        let path = self.raw_directory.join(raw_file_path(received_at, upload.upload_id, &body_sha256));
        fs::create_dir_all(path.parent().expect("a raw file has a folder")).expect("the raw folder can be made");
        fs::write(&path, sealed).expect("the raw file can be written");

        let client = self.store.database.pool.get().await.expect("a connection");
        client
            .execute(
                "INSERT INTO observations.uploads (id, device_id, encoding, seal_key_id, body_bytes, body_sha256, store, app_version_code, received_at)
                 VALUES ($1, $2, 'zstd', $3, $4, $5, 'disk', 140, $6)",
                &[&upload.upload_id, &upload.device_id, &SEAL_KEY_ID, &(body.len() as i32), &body_sha256, &received_at],
            )
            .await
            .expect("an upload row");
    }

    pub async fn delete_raw_file(&self, upload_id: Uuid) {
        let upload = self.upload(upload_id).await;
        let path = self.raw_directory.join(raw_file_path(upload.received_at, upload.id, &upload.body_sha256));
        fs::remove_file(path).expect("the raw file can be deleted");
    }

    pub async fn upload(&self, upload_id: Uuid) -> UploadRow {
        let client = self.store.database.pool.get().await.expect("a connection");
        queue::upload(&**client, upload_id).await.expect("the upload reads").expect("the upload exists")
    }

    pub async fn claim(&self, upload_id: Uuid) -> Claim {
        claim(&self.store, upload_id).await
    }

    pub async fn fold(&self, upload_id: Uuid) -> Outcome {
        fold(&self.store, upload_id).await
    }

    pub async fn fold_all(&self, uploads: &[GeneratedUpload]) {
        for upload in uploads {
            self.fold(upload.upload_id).await;
        }
    }

    pub async fn store_and_fold(&self, uploads: &[GeneratedUpload], modem_family: &str) {
        self.seed_phones(uploads, modem_family).await;
        for upload in uploads {
            self.store_upload(upload).await;
        }
        self.fold_all(uploads).await;
    }

    pub async fn status(&self, upload_id: Uuid) -> (String, Option<String>) {
        let client = self.store.database.pool.get().await.expect("a connection");
        let row = client
            .query_one("SELECT status::text, status_reason FROM observations.uploads WHERE id = $1", &[&upload_id])
            .await
            .expect("the upload's status reads");
        (row.get(0), row.get(1))
    }

    pub async fn set_status(&self, upload_id: Uuid, status: &str) {
        let client = self.store.database.pool.get().await.expect("a connection");
        client
            .execute(
                "UPDATE observations.uploads SET status = $2::text::upload_status, status_changed_at = now() WHERE id = $1",
                &[&upload_id, &status],
            )
            .await
            .expect("the status changes");
    }

    pub async fn count(&self, query: &str) -> i64 {
        let client = self.store.database.pool.get().await.expect("a connection");
        client.query_one(query, &[]).await.unwrap_or_else(|error| panic!("{query} failed: {error}")).get(0)
    }

    pub async fn digest(&self) -> Dump {
        let client = self.store.database.pool.get().await.expect("a connection");
        let mut rows = Vec::new();
        for query in DIGEST_DUMPS {
            for row in client.query(*query, &[]).await.unwrap_or_else(|error| panic!("{query} failed: {error}")) {
                rows.push((row.get::<_, String>(0), row.get::<_, Value>(1)));
            }
        }
        Dump(rows)
    }
}

pub async fn claim(store: &Store, upload_id: Uuid) -> Claim {
    let client = store.database.pool.get().await.expect("a connection");
    let row = client
        .query_one(
            "UPDATE observations.uploads SET status = 'processing', claimed_at = clock_timestamp(), attempts = attempts + 1
             WHERE id = $1 AND status = 'received'
             RETURNING claimed_at, attempts",
            &[&upload_id],
        )
        .await
        .expect("the upload can be claimed");
    let upload = queue::upload(&**client, upload_id).await.expect("the upload reads").expect("the upload exists");
    Claim { upload, claimed_at: row.get(0), attempts: row.get(1) }
}

pub async fn fold(store: &Store, upload_id: Uuid) -> Outcome {
    let claim = claim(store, upload_id).await;
    store.fold_upload(&claim.upload, Finish::Commit(&claim)).await.expect("the fold writes")
}

#[derive(Debug, Clone, PartialEq)]
pub struct Dump(pub Vec<(String, Value)>);

impl Dump {
    pub fn without(&self, columns: &[&str]) -> Vec<String> {
        let mut lines: Vec<String> = self
            .0
            .iter()
            .map(|(label, row)| {
                let mut row = row.clone();
                if let Some(columns_of_row) = row.as_object_mut() {
                    for column in columns {
                        columns_of_row.remove(*column);
                    }
                }
                format!("{label} {row}")
            })
            .collect();
        lines.sort();
        lines
    }

    pub fn lines(&self) -> Vec<String> {
        self.without(&[])
    }

    pub fn cell_tables(&self) -> Vec<String> {
        let by_cell = [
            "cell_bins",
            "cell_ta_bins",
            "cell_values",
            "cell_networks",
            "cell_contributors",
            "cell_readers",
            "handover_bins",
            "cell_transitions",
            "nsa_links",
            "same_reading_pairs",
        ];
        self.lines().into_iter().filter(|line| by_cell.iter().any(|table| line.starts_with(&format!("{table} ")))).collect()
    }
}

pub const DATES_AND_BITS: [&str; 3] = ["first_seen_on", "last_seen_on", "contributor_bits"];

const DIGEST_DUMPS: &[&str] = &[
    "SELECT 'cell_bins ' || concat_ws(' ', c.plmn, c.rat, c.cell_key), to_jsonb(t) - 'observed_cell_id'
     FROM observations.cell_bins t JOIN observations.observed_cells c ON c.id = t.observed_cell_id",
    "SELECT 'cell_ta_bins ' || concat_ws(' ', c.plmn, c.rat, c.cell_key, g.source, coalesce(g.modem_family::text, g.device_model_id::text)),
       to_jsonb(t) - 'observed_cell_id' - 'ta_group_id'
     FROM observations.cell_ta_bins t
     JOIN observations.observed_cells c ON c.id = t.observed_cell_id
     JOIN observations.ta_groups g ON g.id = t.ta_group_id",
    "SELECT 'cell_values ' || concat_ws(' ', c.plmn, c.rat, c.cell_key), to_jsonb(t) - 'observed_cell_id'
     FROM observations.cell_values t JOIN observations.observed_cells c ON c.id = t.observed_cell_id",
    "SELECT 'cell_networks ' || concat_ws(' ', c.plmn, c.rat, c.cell_key), to_jsonb(t) - 'observed_cell_id'
     FROM observations.cell_networks t JOIN observations.observed_cells c ON c.id = t.observed_cell_id",
    "SELECT 'cell_contributors ' || concat_ws(' ', c.plmn, c.rat, c.cell_key), to_jsonb(t) - 'observed_cell_id'
     FROM observations.cell_contributors t JOIN observations.observed_cells c ON c.id = t.observed_cell_id",
    "SELECT 'cell_readers ' || concat_ws(' ', c.plmn, c.rat, c.cell_key, v.reader_name, v.version), to_jsonb(t) - 'observed_cell_id' - 'reader_version_id'
     FROM observations.cell_readers t
     JOIN observations.observed_cells c ON c.id = t.observed_cell_id
     JOIN observations.reader_versions v ON v.id = t.reader_version_id",
    "SELECT 'handover_bins ' || concat_ws(' ', f.plmn, f.rat, f.cell_key, '->', o.plmn, o.rat, o.cell_key), to_jsonb(t) - 'from_cell_id' - 'to_cell_id'
     FROM observations.handover_bins t
     JOIN observations.observed_cells f ON f.id = t.from_cell_id
     JOIN observations.observed_cells o ON o.id = t.to_cell_id",
    "SELECT 'cell_transitions ' || concat_ws(' ', f.plmn, f.rat, f.cell_key, '->', o.plmn, o.rat, o.cell_key), to_jsonb(t) - 'from_cell_id' - 'to_cell_id'
     FROM observations.cell_transitions t
     JOIN observations.observed_cells f ON f.id = t.from_cell_id
     JOIN observations.observed_cells o ON o.id = t.to_cell_id",
    "SELECT 'neighbour_bins', to_jsonb(t) FROM observations.neighbour_bins t",
    "SELECT 'nsa_links ' || concat_ws(' ', c.plmn, c.rat, c.cell_key), to_jsonb(t) - 'anchor_cell_id'
     FROM observations.nsa_links t JOIN observations.observed_cells c ON c.id = t.anchor_cell_id",
    "SELECT 'same_reading_pairs ' || least(concat_ws(' ', a.plmn, a.rat, a.cell_key), concat_ws(' ', b.plmn, b.rat, b.cell_key))
       || ' & ' || greatest(concat_ws(' ', a.plmn, a.rat, a.cell_key), concat_ws(' ', b.plmn, b.rat, b.cell_key)),
       to_jsonb(t) - 'observed_cell_id' - 'other_observed_cell_id'
     FROM observations.same_reading_pairs t
     JOIN observations.observed_cells a ON a.id = t.observed_cell_id
     JOIN observations.observed_cells b ON b.id = t.other_observed_cell_id",
    "SELECT 'trail_squares', to_jsonb(t) FROM observations.trail_squares t",
    "SELECT 'trail_levels', to_jsonb(t) FROM observations.trail_levels t",
    "SELECT 'person_trail_bins', to_jsonb(t) FROM observations.person_trail_bins t",
    "SELECT 'contributor_months', to_jsonb(t) FROM observations.contributor_months t",
    "SELECT 'observed_cells ' || concat_ws(' ', c.plmn, c.rat, c.cell_key), jsonb_build_object('site', concat_ws(' ', s.plmn, s.rat, s.node_id))
     FROM observations.observed_cells c LEFT JOIN observations.observed_sites s ON s.id = c.observed_site_id",
    "SELECT 'observed_sites ' || concat_ws(' ', s.plmn, s.rat, s.node_id), '{}'::jsonb FROM observations.observed_sites s",
    "SELECT 'observed_cell_summaries ' || concat_ws(' ', c.plmn, c.rat, c.cell_key), to_jsonb(t) - 'observed_cell_id'
     FROM observations.observed_cell_summaries t JOIN observations.observed_cells c ON c.id = t.observed_cell_id",
];
