#[path = "../tests/common/mod.rs"]
mod common;

use common::{context, ring_of_readings, site_from_readings, three_sectors};
use criterion::{Criterion, criterion_group, criterion_main};
use engine_estimate::estimate;
use engine_estimate::firmness::leave_out_shift_m;
use engine_estimate::grid::evidence_grid;

fn one_site(criterion: &mut Criterion) {
    let context = context();
    let site = site_from_readings(&three_sectors(), &ring_of_readings(300.0, 3_000.0, 300.0, 6.0), (0.0, 0.0), true);
    criterion.bench_function("a three-sector site with timing advance, 600 readings", |bench| {
        bench.iter(|| estimate(&site, &context))
    });
    let fit = estimate(&site, &context).expect("an estimate");
    criterion.bench_function("the leave-out refits of the same site", |bench| {
        bench.iter(|| leave_out_shift_m(&site, &fit, &context))
    });
    criterion.bench_function("the evidence grid of the same site", |bench| {
        bench.iter(|| evidence_grid(&site, &fit, &context))
    });
    let sparse = site_from_readings(&three_sectors(), &ring_of_readings(400.0, 2_000.0, 400.0, 30.0), (0.0, 0.0), true);
    criterion.bench_function("a three-sector site with timing advance, 60 readings", |bench| {
        bench.iter(|| estimate(&sparse, &context))
    });
    let without_timing_advance = site_from_readings(&three_sectors(), &ring_of_readings(300.0, 3_000.0, 300.0, 6.0), (0.0, 0.0), false);
    let levels_fit = estimate(&without_timing_advance, &context).expect("an estimate");
    criterion.bench_function("a three-sector site without timing advance, 600 readings", |bench| {
        bench.iter(|| estimate(&without_timing_advance, &context))
    });
    criterion.bench_function("the evidence grid of the site without timing advance", |bench| {
        bench.iter(|| evidence_grid(&without_timing_advance, &levels_fit, &context))
    });
}

criterion_group!(benches, one_site);
criterion_main!(benches);
