use std::time::Duration;

const FIRST_BACKOFF: Duration = Duration::from_secs(1);
const LONGEST_BACKOFF: Duration = Duration::from_secs(60);

pub struct Backoff {
    next: Duration,
}

impl Default for Backoff {
    fn default() -> Self {
        Self { next: FIRST_BACKOFF }
    }
}

impl Backoff {
    pub fn next(&mut self) -> Duration {
        let current = self.next;
        self.next = (self.next * 2).min(LONGEST_BACKOFF);
        current
    }

    pub fn reset(&mut self) {
        self.next = FIRST_BACKOFF;
    }
}
