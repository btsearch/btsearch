mod common;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use common::test_file;
use engine_batch::{Encoding, Rejection, SealKeys, StoredUpload, read_upload};
use serde_json::Value;

const KEY_ID_END: usize = 2 + "test".len();
const NONCE_BYTES: usize = 12;

struct Vector {
    upload_id: String,
    device_id: String,
    seal_keys: String,
    body_bytes: usize,
    body_sha256: Vec<u8>,
    sealed: Vec<u8>,
}

impl Vector {
    fn sealed_by_seal_ts() -> Self {
        let metadata: Value = serde_json::from_slice(&test_file("sealed/appendix-a.vector.json")).expect("the vector's metadata is JSON");
        let text = |name: &str| metadata[name].as_str().expect("the vector names its values").to_owned();
        Self {
            upload_id: text("uploadId"),
            device_id: text("deviceId"),
            seal_keys: text("sealKeys"),
            body_bytes: metadata["bodyBytes"].as_u64().and_then(|bytes| usize::try_from(bytes).ok()).expect("the vector has a size"),
            body_sha256: from_hex(&text("bodySha256")),
            sealed: test_file("sealed/appendix-a.sealed"),
        }
    }

    fn stored(&self) -> StoredUpload<'_> {
        StoredUpload {
            id: &self.upload_id,
            device_id: &self.device_id,
            encoding: Encoding::Zstd,
            body_bytes: self.body_bytes,
            body_sha256: &self.body_sha256,
        }
    }

    fn keys(&self) -> SealKeys {
        SealKeys::parse(&self.seal_keys).expect("the vector's keys parse")
    }
}

fn from_hex(hex: &str) -> Vec<u8> {
    (0..hex.len()).step_by(2).map(|index| u8::from_str_radix(&hex[index..index + 2], 16).expect("hexadecimal")).collect()
}

fn other_key() -> String {
    format!("test:{}", STANDARD.encode([0xff_u8; 32]))
}

#[test]
fn opens_an_upload_sealed_by_seal_ts() {
    let vector = Vector::sealed_by_seal_ts();
    let upload = read_upload(&vector.sealed, &vector.stored(), &vector.keys()).expect("the vector opens");
    assert_eq!(upload.batch.upload_id, vector.upload_id);
    assert_eq!(upload.batch.cells.len(), 3);
}

#[test]
fn opens_with_any_key_of_the_list() {
    let vector = Vector::sealed_by_seal_ts();
    let keys = SealKeys::parse(&format!("{},{}", other_key().replacen("test", "newer", 1), vector.seal_keys)).expect("two keys parse");
    assert!(read_upload(&vector.sealed, &vector.stored(), &keys).is_ok());
}

#[test]
fn does_not_open_with_another_key_of_the_same_id() {
    let vector = Vector::sealed_by_seal_ts();
    let keys = SealKeys::parse(&other_key()).expect("the other key parses");
    assert!(matches!(read_upload(&vector.sealed, &vector.stored(), &keys), Err(Rejection::SealFailed(_))));
}

#[test]
fn does_not_open_under_another_upload_id() {
    let vector = Vector::sealed_by_seal_ts();
    let mut stored = vector.stored();
    stored.id = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0f";
    assert!(matches!(read_upload(&vector.sealed, &stored, &vector.keys()), Err(Rejection::SealFailed(_))));
}

#[test]
fn does_not_open_with_one_byte_changed() {
    let vector = Vector::sealed_by_seal_ts();
    for position in [0, KEY_ID_END, KEY_ID_END + NONCE_BYTES, vector.sealed.len() - 1] {
        let mut sealed = vector.sealed.clone();
        sealed[position] ^= 1;
        let opened = read_upload(&sealed, &vector.stored(), &vector.keys());
        assert!(matches!(opened, Err(Rejection::SealFailed(_))), "a change at byte {position} gave {opened:?}");
    }
}

#[test]
fn refuses_a_body_its_row_does_not_describe() {
    let vector = Vector::sealed_by_seal_ts();
    let mut longer = vector.stored();
    longer.body_bytes += 1;
    assert!(matches!(read_upload(&vector.sealed, &longer, &vector.keys()), Err(Rejection::BodyMismatch(_))));

    let mut other_hash = vector.body_sha256.clone();
    other_hash[0] ^= 1;
    let mut stored = vector.stored();
    stored.body_sha256 = &other_hash;
    assert!(matches!(read_upload(&vector.sealed, &stored, &vector.keys()), Err(Rejection::BodyMismatch(_))));
}

#[test]
fn reads_the_key_list_as_seal_ts_does() {
    let key = STANDARD.encode([7_u8; 32]);
    assert!(SealKeys::parse(&format!(" a:{key} , b:{} ", key.trim_end_matches('='))).is_ok());
    for value in [String::new(), "a".to_owned(), format!(":{key}"), format!("a:{}", STANDARD.encode([7_u8; 16])), format!("{}:{key}", "k".repeat(17))]
    {
        assert!(SealKeys::parse(&value).is_err(), "{value:?} parses");
    }
}
