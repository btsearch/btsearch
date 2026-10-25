pub mod mcc;
pub mod outlines;
pub mod plane;
pub mod square;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point {
    pub latitude: f64,
    pub longitude: f64,
}

impl Point {
    pub fn new(latitude: f64, longitude: f64) -> Self {
        Self { latitude, longitude }
    }
}
