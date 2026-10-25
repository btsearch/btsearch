use bytes::Bytes;
use engine_fold::calendar::Day;
use object_store::ObjectStoreExt;
use object_store::local::LocalFileSystem;
use object_store::path::Path;
use uuid::Uuid;

use crate::StoreError;
use crate::sql_types::Timestamp;

const NAMED_SHA256_BYTES: usize = 8;

pub struct RawFiles {
    disk: LocalFileSystem,
}

impl RawFiles {
    pub fn on_disk(directory: &str) -> Result<Self, StoreError> {
        Ok(Self { disk: LocalFileSystem::new_with_prefix(directory)? })
    }

    pub(crate) async fn read(&self, store: &str, path: &str) -> Result<Option<Bytes>, StoreError> {
        if store != "disk" {
            return Err(StoreError::data(format!("raw files in the store `{store}` cannot be read yet")));
        }
        match self.disk.get(&Path::from(path)).await {
            Ok(file) => Ok(Some(file.bytes().await?)),
            Err(object_store::Error::NotFound { .. }) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }
}

pub fn raw_file_path(received_at: Timestamp, upload_id: Uuid, body_sha256: &[u8]) -> String {
    let (year, month, day) = Day::of_epoch_millis(received_at.epoch_millis()).civil();
    let named: String = body_sha256.iter().take(NAMED_SHA256_BYTES).map(|byte| format!("{byte:02x}")).collect();
    format!("raw/{year:04}/{month:02}/{day:02}/{}.{named}", upload_id.hyphenated())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_raw_file_is_named_as_raw_store_ts_names_it() {
        let received_at = Timestamp { micros_since_1970: 1_791_554_400_000_000 };
        let upload_id = Uuid::parse_str("01A12096-8DA0-7C1D-9B2E-5F6A7B8C9D0E").expect("a uuid");
        let sha256 = [0xab_u8, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0xff, 0xff];
        assert_eq!(raw_file_path(received_at, upload_id, &sha256), "raw/2026/10/09/01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e.ab01020304050607");
    }
}
