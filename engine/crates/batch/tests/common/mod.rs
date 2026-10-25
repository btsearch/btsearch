#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};

use engine_batch::{Rejection, Upload, read_document};
use serde_json::Value;

pub const APPENDIX_A_UPLOAD_ID: &str = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e";
pub const APPENDIX_A_DEVICE_ID: &str = "01a0bdd4-4400-7d2e-8f30-415263748596";

pub fn engine_directory() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

pub fn fixtures_directory() -> PathBuf {
    engine_directory().join("fixtures/v1")
}

pub fn test_file(relative: &str) -> Vec<u8> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join(relative);
    fs::read(&path).unwrap_or_else(|error| panic!("{} cannot be read: {error}", path.display()))
}

pub fn appendix_a() -> Value {
    let document = fs::read(fixtures_directory().join("appendix-a.json")).expect("the Appendix A fixture is readable");
    serde_json::from_slice(&document).expect("the Appendix A fixture is JSON")
}

pub fn read_appendix_a_changed(change: impl FnOnce(&mut Value)) -> Result<Upload, Rejection> {
    let mut document = appendix_a();
    change(&mut document);
    let bytes = serde_json::to_vec(&document).expect("a JSON value serializes");
    read_document(&bytes, APPENDIX_A_UPLOAD_ID, APPENDIX_A_DEVICE_ID)
}
