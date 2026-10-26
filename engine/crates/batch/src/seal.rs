use aes_gcm::Aes256Gcm;
use aes_gcm::aead::{Aead, KeyInit, Payload};
use base64::Engine;
use base64::alphabet;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use thiserror::Error;

use crate::rejection::Rejection;

const SEAL_FORMAT_VERSION: u8 = 1;
const KEY_BYTES: usize = 32;
const KEY_ID_MAX_LENGTH: usize = 16;
const NONCE_BYTES: usize = 12;
const TAG_BYTES: usize = 16;
const KEY_ENCODING: GeneralPurpose =
    GeneralPurpose::new(&alphabet::STANDARD, GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent));

#[derive(Debug, Error)]
#[error("OBSERVATIONS_SEAL_KEYS must list id:base64 pairs of 32-byte keys, newest first, separated by commas")]
pub struct SealKeysFormatError;

pub struct SealKeys {
    keys: Vec<SealKey>,
}

struct SealKey {
    id: String,
    cipher: Aes256Gcm,
}

impl SealKeys {
    pub fn parse(value: &str) -> Result<Self, SealKeysFormatError> {
        let keys = value.trim().split(',').map(parse_key).collect::<Result<Vec<_>, _>>()?;
        Ok(Self { keys })
    }

    pub fn open(&self, upload_id: &str, sealed: &[u8]) -> Result<Vec<u8>, Rejection> {
        let (&format, rest) = sealed.split_first().ok_or_else(|| failed("the file is empty"))?;
        if format != SEAL_FORMAT_VERSION {
            return Err(failed(format!("seal format {format} is not read")));
        }
        let (&key_id_length, rest) = rest.split_first().ok_or_else(|| failed("the file ends inside its header"))?;
        let key_id_length = usize::from(key_id_length);
        if rest.len() < key_id_length + NONCE_BYTES + TAG_BYTES {
            return Err(failed("the file ends inside its header"));
        }
        let (key_id, rest) = rest.split_at(key_id_length);
        let (nonce, encrypted) = rest.split_first_chunk::<NONCE_BYTES>().ok_or_else(|| failed("the file ends inside its header"))?;
        let key_id = std::str::from_utf8(key_id).map_err(|_| failed("the key id is not text"))?;
        let key = self.keys.iter().find(|key| key.id == key_id).ok_or_else(|| failed(format!("key {key_id} is not in OBSERVATIONS_SEAL_KEYS")))?;
        key.cipher
            .decrypt(nonce.into(), Payload { msg: encrypted, aad: upload_id.as_bytes() })
            .map_err(|_| failed("the body does not authenticate under this upload id"))
    }
}

fn parse_key(entry: &str) -> Result<SealKey, SealKeysFormatError> {
    let (id, encoded) = entry.trim().split_once(':').ok_or(SealKeysFormatError)?;
    let key = KEY_ENCODING.decode(encoded).map_err(|_| SealKeysFormatError)?;
    if id.is_empty() || id.len() > KEY_ID_MAX_LENGTH || key.len() != KEY_BYTES {
        return Err(SealKeysFormatError);
    }
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| SealKeysFormatError)?;
    Ok(SealKey { id: id.to_owned(), cipher })
}

fn failed(why: impl Into<String>) -> Rejection {
    Rejection::SealFailed(why.into())
}
