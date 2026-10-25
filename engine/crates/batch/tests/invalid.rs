mod common;

use std::io::{self, Read};

use common::{APPENDIX_A_DEVICE_ID, APPENDIX_A_UPLOAD_ID, read_appendix_a_changed, test_file};
use engine_batch::body::decompress;
use engine_batch::limits::{CELLS, DOCUMENT_BYTES};
use engine_batch::{Encoding, Rejection, read_document};
use flate2::Compression;
use flate2::write::GzEncoder;
use serde_json::Value;

fn zeros(bytes: usize) -> impl Read {
    io::repeat(0).take(u64::try_from(bytes).expect("a size fits u64"))
}

fn zstd_of_zeros(bytes: usize) -> Vec<u8> {
    zstd::encode_all(zeros(bytes), 3).expect("zeros compress")
}

fn gzip_of_zeros(bytes: usize) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    io::copy(&mut zeros(bytes), &mut encoder).expect("zeros compress");
    encoder.finish().expect("the encoder finishes")
}

fn read_invalid(name: &str) -> Result<engine_batch::Upload, Rejection> {
    read_document(&test_file(&format!("invalid/{name}")), APPENDIX_A_UPLOAD_ID, APPENDIX_A_DEVICE_ID)
}

#[test]
fn stops_decompressing_past_64_mib() {
    assert!(matches!(decompress(&zstd_of_zeros(DOCUMENT_BYTES + 1), Encoding::Zstd), Err(Rejection::LimitExceeded(_))));
    assert!(matches!(decompress(&gzip_of_zeros(DOCUMENT_BYTES + 1), Encoding::Gzip), Err(Rejection::LimitExceeded(_))));
    assert_eq!(decompress(&zstd_of_zeros(DOCUMENT_BYTES), Encoding::Zstd).map(|document| document.len()), Ok(DOCUMENT_BYTES));
}

#[test]
fn refuses_a_body_that_is_not_its_encoding() {
    assert!(matches!(decompress(b"not compressed", Encoding::Zstd), Err(Rejection::InvalidDocument(_))));
    assert!(matches!(decompress(b"not compressed", Encoding::Gzip), Err(Rejection::InvalidDocument(_))));
}

#[test]
fn refuses_what_is_not_a_document() {
    for document in [&b"not json"[..], &b"[]"[..], &b"{}"[..], &b"{\"formatVersion\": 1}"[..]] {
        let read = read_document(document, APPENDIX_A_UPLOAD_ID, APPENDIX_A_DEVICE_ID);
        assert!(matches!(read, Err(Rejection::InvalidDocument(_))), "{} gave {read:?}", String::from_utf8_lossy(document));
    }
}

#[test]
fn refuses_another_format_version() {
    assert_eq!(read_invalid("format-version-2.json").err(), Some(Rejection::FormatVersion("2".to_owned())));
}

#[test]
fn refuses_ids_that_are_not_the_upload_row_s() {
    let document = serde_json::to_vec(&common::appendix_a()).expect("a JSON value serializes");
    let other = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0f";
    assert_eq!(read_document(&document, other, APPENDIX_A_DEVICE_ID).err(), Some(Rejection::IdMismatch("uploadId")));
    assert_eq!(read_document(&document, APPENDIX_A_UPLOAD_ID, other).err(), Some(Rejection::IdMismatch("deviceId")));
    assert!(read_document(&document, &APPENDIX_A_UPLOAD_ID.to_uppercase(), APPENDIX_A_DEVICE_ID).is_ok());
}

#[test]
fn refuses_an_upload_that_spans_more_than_a_day() {
    assert!(matches!(read_invalid("span-over-a-day.json"), Err(Rejection::LimitExceeded(problem)) if problem.starts_with("it spans")));
}

#[test]
fn refuses_more_cells_than_the_limit() {
    let read = read_appendix_a_changed(|document| {
        let cell = document["cells"][1].clone();
        let cells = document["cells"].as_array_mut().expect("cells is a list");
        cells.resize(CELLS + 1, cell);
    });
    assert_eq!(read.err(), Some(Rejection::LimitExceeded(format!("{} cells, more than {CELLS}", CELLS + 1))));
}

#[test]
fn refuses_a_measurement_of_a_cell_that_is_not_in_cells() {
    let read = read_invalid("cell-not-in-cells.json");
    assert_eq!(read.err(), Some(Rejection::InvalidDocument("`snapshots[0]`: a measurement points at a cell that is not in `cells`".to_owned())));
}

#[test]
fn refuses_what_the_zod_schema_refuses() {
    let changes: [(&str, fn(&mut Value)); 6] = [
        ("`uploadId` must be a UUID v7", |document| document["uploadId"] = "01a12096-8da0-4c1d-9b2e-5f6a7b8c9d0e".into()),
        ("`cells[0]`: `plmn` must be a network code", |document| document["cells"][0]["plmn"] = "2600".into()),
        ("`snapshots[0]` points at a reader that is not in `readers`", |document| document["snapshots"][0]["reader"] = 1.into()),
        ("`os.securityPatch` must be a date", |document| document["os"]["securityPatch"] = "2026-02-30".into()),
        ("`fixes[0]` has a negative accuracy", |document| document["fixes"][0]["accuracyMeters"] = (-1.0).into()),
        ("unknown variant `cdma`", |document| document["cells"][2]["rat"] = "cdma".into()),
    ];
    for (problem, change) in changes {
        let read = read_appendix_a_changed(change);
        assert!(matches!(&read, Err(Rejection::InvalidDocument(found)) if found.contains(problem)), "{problem}: {read:?}");
    }
}
