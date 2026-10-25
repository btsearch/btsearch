use std::io::Read;

use flate2::read::MultiGzDecoder;
use sha2::{Digest, Sha256};

use crate::limits::DOCUMENT_BYTES;
use crate::rejection::Rejection;

const READ_LIMIT: u64 = DOCUMENT_BYTES as u64 + 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Encoding {
    Zstd,
    Gzip,
}

pub fn check_body(body: &[u8], expected_bytes: usize, expected_sha256: &[u8]) -> Result<(), Rejection> {
    if body.len() != expected_bytes {
        return Err(Rejection::BodyMismatch(format!("{} bytes, where the row says {expected_bytes}", body.len())));
    }
    if Sha256::digest(body).as_slice() != expected_sha256 {
        return Err(Rejection::BodyMismatch("its SHA-256 is not the row's".to_owned()));
    }
    Ok(())
}

pub fn decompress(body: &[u8], encoding: Encoding) -> Result<Vec<u8>, Rejection> {
    let mut document = Vec::new();
    let read = match encoding {
        Encoding::Zstd => zstd::stream::read::Decoder::new(body).and_then(|decoder| decoder.take(READ_LIMIT).read_to_end(&mut document)),
        Encoding::Gzip => MultiGzDecoder::new(body).take(READ_LIMIT).read_to_end(&mut document),
    };
    read.map_err(|error| Rejection::InvalidDocument(format!("the body does not decompress as {encoding:?}: {error}")))?;
    if document.len() > DOCUMENT_BYTES {
        return Err(Rejection::LimitExceeded(format!("the document is larger than {DOCUMENT_BYTES} bytes once decompressed")));
    }
    Ok(document)
}
