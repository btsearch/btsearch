mod common;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use common::{
    context, gsm_sectors, one_straight_road, ring_of_readings, second_place_sectors, site_from_readings, site_of, three_sectors, timing_advance_only,
    two_cells_4_km_apart,
};
use engine_estimate::calibration::{AreaClass, LevelModel};
use engine_estimate::error_model::ErrorTable;
use engine_estimate::group::combined;
use engine_estimate::input::{Cell, Context, EvidenceClass, Site, Technology, UNCALIBRATED_ERROR_MODELS};
use engine_estimate::split::find_split;
use engine_estimate::{ALGORITHM_VERSION, Estimate, estimate};
use engine_geo::Point;
use serde_json::{Value, json};

const TOLERANCE: f64 = 1e-7;
const ROUNDING_NOISE_ULPS: [f64; 2] = [-4.0, 4.0];
const BIN_COLUMNS: [&str; 14] = [
    "square",
    "sample_count",
    "weight_milli",
    "serving_weight_milli",
    "level_wsum",
    "offset_x_wsum",
    "offset_y_wsum",
    "quality_weight_milli",
    "quality_wsum",
    "sinr_weight_milli",
    "sinr_wsum",
    "stationary_count",
    "first_seen_on",
    "last_seen_on",
];
const TIMING_ADVANCE_COLUMNS: [&str; 6] = ["square", "distance_m", "sample_count", "weight_milli", "last_seen_on", "error_model"];
const HANDOVER_COLUMNS: [&str; 5] = ["from_cell", "to_cell", "square", "weight_milli", "last_seen_on"];

fn label_of(technology: Technology) -> &'static str {
    match technology {
        Technology::Gsm => "gsm",
        Technology::Umts => "umts",
        Technology::Lte => "lte",
        Technology::Nr => "nr",
    }
}

fn few_readings_around(at: (f64, f64)) -> Vec<(f64, f64)> {
    ring_of_readings(300.0, 3_000.0, 900.0, 24.0).into_iter().map(|(east, north)| (east + at.0, north + at.1)).collect()
}

fn table_json(columns: &[&str], rows: Vec<Value>) -> Value {
    json!({ "columns": columns, "rows": rows })
}

fn point_json(point: Point) -> Value {
    json!({ "latitude": point.latitude, "longitude": point.longitude })
}

fn context_json(context: &Context) -> Value {
    assert_eq!(
        context.error_tables.len(),
        UNCALIBRATED_ERROR_MODELS.len(),
        "each error table is listed under its technology in the uncalibrated context"
    );
    let error_models: Vec<Value> = UNCALIBRATED_ERROR_MODELS
        .iter()
        .zip(&context.error_tables)
        .map(|((technology, _), table)| {
            let model = table.model();
            json!({
                "technology": label_of(*technology),
                "sigma_m": model.sigma_m,
                "tail_mean_m": model.tail_mean_m,
                "outlier_share": model.outlier_share,
            })
        })
        .collect();
    let ellipse_scales: Vec<Value> = EvidenceClass::ALL
        .into_iter()
        .flat_map(|class| {
            [false, true].map(|is_surrounded| {
                json!({
                    "evidence_class": class.label(),
                    "is_surrounded": is_surrounded,
                    "scale": context.ellipse_scale(class, is_surrounded),
                })
            })
        })
        .collect();
    let level_models: Vec<Value> = context
        .level_models
        .iter()
        .map(|((technology, area_class), model)| {
            json!({
                "technology": label_of(*technology),
                "area_class": area_class.label(),
                "slope_db_per_decade": model.slope_db_per_decade,
                "scatter_db": model.scatter_db,
            })
        })
        .collect();
    json!({
        "error_models": error_models,
        "ellipse_scales": ellipse_scales,
        "level_models": level_models,
        "uncalibrated_level_model": {
            "slope_db_per_decade": LevelModel::UNCALIBRATED.slope_db_per_decade,
            "scatter_db": LevelModel::UNCALIBRATED.scatter_db,
        },
    })
}

fn cell_json(cell: &Cell) -> Value {
    let bins = cell
        .bins
        .iter()
        .map(|bin| {
            json!([
                bin.square,
                bin.sample_count,
                bin.weight_milli,
                bin.serving_weight_milli,
                bin.level_wsum,
                bin.offset_x_wsum,
                bin.offset_y_wsum,
                bin.quality_weight_milli,
                bin.quality_wsum,
                bin.sinr_weight_milli,
                bin.sinr_wsum,
                bin.stationary_count,
                bin.first_seen_on,
                bin.last_seen_on,
            ])
        })
        .collect();
    let timing_advance = cell
        .timing_advance
        .iter()
        .map(|row| json!([row.square, row.distance_m, row.sample_count, row.weight_milli, row.last_seen_on, row.error_model]))
        .collect();
    json!({
        "key": cell.key,
        "technology": label_of(cell.technology),
        "area_class": cell.area_class.label(),
        "channel": cell.channel,
        "bins": table_json(&BIN_COLUMNS, bins),
        "timing_advance": table_json(&TIMING_ADVANCE_COLUMNS, timing_advance),
    })
}

fn site_json(site: &Site) -> Value {
    let handovers = site
        .handovers
        .iter()
        .map(|handover| json!([handover.from_cell, handover.to_cell, handover.square, handover.weight_milli, handover.last_seen_on]))
        .collect();
    json!({
        "cells": site.cells.iter().map(cell_json).collect::<Vec<_>>(),
        "handovers": table_json(&HANDOVER_COLUMNS, handovers),
        "contributor_count": site.contributor_count,
        "person_count": site.person_count,
    })
}

fn estimate_json(estimate: &Estimate) -> Value {
    let evidence = &estimate.evidence;
    let cells: Vec<Value> =
        estimate.cells.iter().map(|fit| json!({ "key": fit.key, "azimuth_deg": fit.azimuth_deg, "power_db": fit.power_db })).collect();
    json!({
        "point": point_json(estimate.point),
        "cost": estimate.cost,
        "uncertainty_m": estimate.uncertainty_m,
        "ellipse_major_m": estimate.ellipse_major_m,
        "ellipse_minor_m": estimate.ellipse_minor_m,
        "ellipse_azimuth_deg": estimate.ellipse_azimuth_deg,
        "ellipse_scale": estimate.ellipse_scale,
        "alternative_point": estimate.alternative_point.map(point_json),
        "disagreeing_cells": estimate.disagreeing_cells,
        "cells": cells,
        "evidence": {
            "sample_count": evidence.sample_count,
            "contributor_count": evidence.contributor_count,
            "person_count": evidence.person_count,
            "bin_count": evidence.bin_count,
            "ta_sample_count": evidence.ta_sample_count,
            "gsm_ta_sample_count": evidence.gsm_ta_sample_count,
            "angular_coverage_deg": evidence.angular_coverage_deg,
            "distinct_days": evidence.distinct_days,
            "max_distance_m": evidence.max_distance_m,
            "class": evidence.class().label(),
            "is_surrounded": evidence.is_surrounded(),
        },
    })
}

fn calibrated_context() -> Context {
    let mut context = Context::uncalibrated();
    context.ellipse_scales = [[1.2, 1.35]; EvidenceClass::ALL.len()];
    context.level_models.insert((Technology::Lte, AreaClass::Town), LevelModel { slope_db_per_decade: 31.5, scatter_db: 7.25 });
    context
}

fn with_rounding_noise(context: &Context, ulps: f64) -> Context {
    let up = 1.0 + ulps * f64::EPSILON;
    let down = 1.0 - ulps * f64::EPSILON;
    let mut noisy = Context {
        error_tables: context
            .error_tables
            .iter()
            .map(|table| {
                let mut model = table.model();
                model.sigma_m *= up;
                model.tail_mean_m *= down;
                ErrorTable::new(model)
            })
            .collect(),
        ellipse_scales: context.ellipse_scales,
        level_models: BTreeMap::new(),
    };
    for technology in [Technology::Gsm, Technology::Umts, Technology::Lte, Technology::Nr] {
        for area_class in AreaClass::ALL {
            let model = context.level_models.get(&(technology, area_class)).copied().unwrap_or(LevelModel::UNCALIBRATED);
            noisy.level_models.insert(
                (technology, area_class),
                LevelModel { slope_db_per_decade: model.slope_db_per_decade * up, scatter_db: model.scatter_db * down },
            );
        }
    }
    noisy
}

struct Scenario {
    name: &'static str,
    site: Site,
    context: Context,
    pins_split: bool,
}

fn scenario(name: &'static str, site: Site) -> Scenario {
    Scenario { name, site, context: context(), pins_split: false }
}

fn vector_json(scenario: &Scenario, context: &Context) -> Value {
    let site = &scenario.site;
    let whole = estimate(site, context);
    let mut vector = json!({
        "algorithm_version": ALGORITHM_VERSION,
        "context": context_json(context),
        "site": site_json(site),
        "estimate": whole.as_ref().map(estimate_json),
    });
    if scenario.pins_split {
        let whole = whole.expect("an estimate of the whole node");
        let no_codes = vec![None; site.cells.len()];
        let split = find_split(site, &whole, &no_codes, &no_codes, context).map(
            |split| json!({ "parts": split.parts, "estimates": split.estimates.iter().map(estimate_json).collect::<Vec<_>>(), "gain": split.gain }),
        );
        vector["find_split"] = json!({ "pcis": no_codes, "area_codes": no_codes, "split": split });
    }
    vector
}

fn scenarios() -> Vec<Scenario> {
    let readings = few_readings_around((0.0, 0.0));
    let second_place_at = (8_000.0, 0.0);
    let two_places = combined(&[
        &site_from_readings(&three_sectors(), &readings, (0.0, 0.0), true),
        &site_from_readings(&second_place_sectors(), &few_readings_around(second_place_at), second_place_at, true),
    ]);
    let timing_advance_only_site =
        Site { cells: vec![timing_advance_only(1, &readings, (0.0, 0.0))], handovers: Vec::new(), contributor_count: 1, person_count: 1 };
    vec![
        scenario("three-sectors-with-timing-advance", site_from_readings(&three_sectors(), &readings, (0.0, 0.0), true)),
        scenario("sectors-alone", site_from_readings(&three_sectors(), &readings, (0.0, 0.0), false)),
        scenario("one-straight-road", one_straight_road()),
        scenario("two-cells-4-km-apart", two_cells_4_km_apart()),
        scenario("gsm-sectors", site_of(Technology::Gsm, &gsm_sectors(), &readings, (0.0, 0.0), true)),
        scenario("umts-levels-alone", site_of(Technology::Umts, &three_sectors(), &readings, (0.0, 0.0), false)),
        scenario("timing-advance-only", timing_advance_only_site),
        Scenario {
            context: calibrated_context(),
            ..scenario("three-sectors-calibrated", site_from_readings(&three_sectors(), &readings, (0.0, 0.0), true))
        },
        Scenario { pins_split: true, ..scenario("enb-in-two-places-split", two_places) },
    ]
}

fn agrees(pinned: &Value, computed: &Value) -> bool {
    match (pinned, computed) {
        (Value::Number(pinned), Value::Number(computed)) if pinned.is_f64() || computed.is_f64() => pinned
            .as_f64()
            .zip(computed.as_f64())
            .is_some_and(|(pinned, computed)| (pinned - computed).abs() <= TOLERANCE * pinned.abs().max(computed.abs()).max(1.0)),
        (Value::Array(pinned), Value::Array(computed)) => pinned.len() == computed.len() && pinned.iter().zip(computed).all(|(a, b)| agrees(a, b)),
        (Value::Object(pinned), Value::Object(computed)) => {
            pinned.len() == computed.len() && pinned.iter().all(|(key, value)| computed.get(key).is_some_and(|other| agrees(value, other)))
        }
        _ => pinned == computed,
    }
}

fn vector_directory() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../../fixtures/estimate-v{ALGORITHM_VERSION}"))
}

#[test]
fn every_scenario_estimates_as_its_pinned_vector() {
    let directory = vector_directory();
    fs::create_dir_all(&directory).expect("the vector directory can be made");

    let mut mismatches = Vec::new();
    for scenario in scenarios() {
        let path = directory.join(format!("{}.json", scenario.name));
        let vector = vector_json(&scenario, &scenario.context);
        match fs::read(&path) {
            Ok(pinned) => {
                if !agrees(&serde_json::from_slice(&pinned).expect("a vector is JSON"), &vector) {
                    mismatches.push(scenario.name);
                }
            }
            Err(_) => fs::write(&path, vector.to_string()).expect("a vector can be written"),
        }
    }
    assert!(mismatches.is_empty(), "these scenarios no longer estimate as pinned; a meant change is a new ALGORITHM_VERSION: {mismatches:?}");
}

#[test]
fn every_vector_has_a_scenario() {
    let Ok(entries) = fs::read_dir(vector_directory()) else {
        return;
    };
    let scenario_files: BTreeSet<String> = scenarios().iter().map(|scenario| format!("{}.json", scenario.name)).collect();
    let stale: Vec<String> =
        entries.filter_map(|entry| entry.ok()?.file_name().into_string().ok()).filter(|file| !scenario_files.contains(file)).collect();
    assert!(stale.is_empty(), "these vectors have no scenario; delete them only if no port relies on them: {stale:?}");
}

#[test]
fn every_scenario_estimates_alike_under_another_platforms_rounding() {
    let mut fragile = Vec::new();
    for scenario in scenarios() {
        let exact = vector_json(&scenario, &scenario.context);
        for ulps in ROUNDING_NOISE_ULPS {
            let rounded = vector_json(&scenario, &with_rounding_noise(&scenario.context, ulps));
            if !agrees(&exact["estimate"], &rounded["estimate"]) || !agrees(&exact["find_split"], &rounded["find_split"]) {
                fragile.push((scenario.name, ulps));
            }
        }
    }
    assert!(
        fragile.is_empty(),
        "these scenarios estimate differently once their models move by a few ulps, so a port cannot reproduce them: {fragile:?}"
    );
}
