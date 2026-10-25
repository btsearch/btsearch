pub mod body;
pub mod document;
mod dropped_values;
pub mod limits;
mod ranges;
mod rejection;
mod seal;
mod structure;

pub use body::Encoding;
pub use dropped_values::{DroppedValues, ValueField};
pub use rejection::Rejection;
pub use seal::{SealKeys, SealKeysFormatError};

use document::Batch;

pub struct StoredUpload<'a> {
    pub id: &'a str,
    pub device_id: &'a str,
    pub encoding: Encoding,
    pub body_bytes: usize,
    pub body_sha256: &'a [u8],
}

#[derive(Debug)]
pub struct Upload {
    pub batch: Batch,
    pub dropped_values: DroppedValues,
}

pub fn read_upload(sealed: &[u8], stored: &StoredUpload, keys: &SealKeys) -> Result<Upload, Rejection> {
    let compressed = keys.open(stored.id, sealed)?;
    body::check_body(&compressed, stored.body_bytes, stored.body_sha256)?;
    let document = body::decompress(&compressed, stored.encoding)?;
    read_document(&document, stored.id, stored.device_id)
}

pub fn read_document(document: &[u8], upload_id: &str, device_id: &str) -> Result<Upload, Rejection> {
    let mut batch = structure::parse(document)?;
    if !batch.upload_id.eq_ignore_ascii_case(upload_id) {
        return Err(Rejection::IdMismatch("uploadId"));
    }
    if !batch.device_id.eq_ignore_ascii_case(device_id) {
        return Err(Rejection::IdMismatch("deviceId"));
    }
    let dropped_values = ranges::drop_out_of_range(&mut batch);
    Ok(Upload { batch, dropped_values })
}
