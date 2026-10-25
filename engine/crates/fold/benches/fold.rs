#[path = "../tests/common/mod.rs"]
mod common;

use common::{Leg, drive_document, inputs, launch_block, no_outlines, read_batch};
use criterion::{Criterion, Throughput, criterion_group, criterion_main};
use engine_batch::document::Batch;
use engine_fold::fold;
use serde_json::{Value, json};

const SECONDS: u64 = 30 * 60;
const CELLS: i64 = 40;
const CELLS_A_READING: i64 = 4;

fn half_hour_drive() -> Batch {
    let mut document = drive_document("01a12096-8da0-7c1d-9b2e-5f6a7b8c9f01", &[Leg { seconds: SECONDS, meters_per_second: 12.0 }], None, (Some(true), Some(true)));
    document["cells"] = (0..CELLS)
        .map(|index| json!({ "rat": "lte", "plmn": "26006", "eci": 31_604_736 + index, "tac": 58_140, "earfcn": 1_300 + 100 * (index % 3), "pci": 300 + index }))
        .collect();
    let snapshots = document["snapshots"].as_array_mut().expect("the drive has snapshots");
    for (second, snapshot) in snapshots.iter_mut().enumerate() {
        let serving = (second as i64 / 60) % CELLS;
        snapshot["measurements"] = (0..CELLS_A_READING)
            .map(|offset| {
                let role = if offset == 0 { "serving" } else { "neighbour" };
                json!({ "cell": (serving + offset) % CELLS, "role": role, "rsrpDbm": -80 - 5 * offset, "rsrqDb": -10, "rssnrDb": 8, "timingAdvance": 5 })
            })
            .collect::<Value>();
    }
    read_batch(&document)
}

fn fold_a_drive(criterion: &mut Criterion) {
    let batch = half_hour_drive();
    let samples: usize = batch.snapshots.iter().map(|snapshot| snapshot.measurements.len()).sum();
    let outlines = no_outlines();
    let mut inputs = inputs(&outlines);
    inputs.reading_blocks = vec![launch_block()];

    let mut group = criterion.benchmark_group("fold");
    group.throughput(Throughput::Elements(samples as u64));
    group.bench_function("a half-hour drive, four cells a reading", |bencher| bencher.iter(|| fold(&batch, &inputs)));
    group.finish();
}

criterion_group!(benches, fold_a_drive);
criterion_main!(benches);
