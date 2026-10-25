mod ellipse_scales;
mod error_model;
mod level_model;
mod snap_priors;
mod timing_advance;

pub use ellipse_scales::{EllipseMiss, fit_ellipse_scales};
pub use error_model::fit_error_model;
pub use level_model::{LevelModel, LevelSquare, fit_level_model};
pub use snap_priors::{SnapCase, fit_snap_priors};
pub use timing_advance::{TaFit, TaSample, fit_timing_advance};

pub const LEAST_GROUP_SAMPLES: f64 = 2_000.0;
pub const LEAST_GROUP_STATIONS: usize = 20;
pub const LEAST_MODEL_SAMPLES: f64 = 500.0;
pub const LEAST_MODEL_STATIONS: usize = 10;
const TOWN_LOCATIONS: i64 = 15;
const SUBURB_LOCATIONS: i64 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AreaClass {
    Town,
    Suburb,
    Country,
}

impl AreaClass {
    pub const ALL: [Self; 3] = [Self::Town, Self::Suburb, Self::Country];

    pub fn of(locations_within_2_km: i64) -> Self {
        if locations_within_2_km >= TOWN_LOCATIONS {
            Self::Town
        } else if locations_within_2_km >= SUBURB_LOCATIONS {
            Self::Suburb
        } else {
            Self::Country
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Town => "town",
            Self::Suburb => "suburb",
            Self::Country => "country",
        }
    }
}
