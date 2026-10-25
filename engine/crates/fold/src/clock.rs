use engine_batch::document::Batch;

pub struct ClockMap {
    elapsed_to_epoch_millis: i64,
    pub wall_clock_error_millis: Option<i64>,
}

impl ClockMap {
    pub fn of(batch: &Batch) -> Self {
        let wall_clock_offset = batch.clock.epoch_millis as i64 - batch.clock.elapsed_realtime_millis as i64;
        let mut satellite_offsets: Vec<i64> = batch.fixes.iter().filter(|fix| !fix.is_mock).map(|fix| fix.gnss_time_millis - fix.t as i64).collect();
        if satellite_offsets.is_empty() {
            return Self { elapsed_to_epoch_millis: wall_clock_offset, wall_clock_error_millis: None };
        }
        satellite_offsets.sort_unstable();
        let median = satellite_offsets[(satellite_offsets.len() - 1) / 2];
        Self { elapsed_to_epoch_millis: median, wall_clock_error_millis: Some(wall_clock_offset - median) }
    }

    pub fn epoch_millis(&self, elapsed_millis: u64) -> i64 {
        elapsed_millis as i64 + self.elapsed_to_epoch_millis
    }
}
