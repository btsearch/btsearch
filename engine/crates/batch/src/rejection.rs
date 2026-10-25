use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum Rejection {
    #[error("the seal does not open: {0}")]
    SealFailed(String),
    #[error("the body is not the one its row describes: {0}")]
    BodyMismatch(String),
    #[error("not a valid document: {0}")]
    InvalidDocument(String),
    #[error("format version {0} is not read")]
    FormatVersion(String),
    #[error("`{0}` is not the upload's own")]
    IdMismatch(&'static str),
    #[error("{0}")]
    LimitExceeded(String),
}

impl Rejection {
    pub fn reason(&self) -> &'static str {
        match self {
            Self::SealFailed(_) => "sealFailed",
            Self::BodyMismatch(_) => "bodyMismatch",
            Self::InvalidDocument(_) => "invalidDocument",
            Self::FormatVersion(_) => "formatVersion",
            Self::IdMismatch(_) => "idMismatch",
            Self::LimitExceeded(_) => "limitExceeded",
        }
    }
}
