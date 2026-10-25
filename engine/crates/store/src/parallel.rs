use std::sync::atomic::{AtomicUsize, Ordering};

pub(crate) fn on_every_core<I: Sync, T: Send>(items: &[I], work: impl Fn(&I) -> T + Sync) -> Option<Vec<T>> {
    let threads = std::thread::available_parallelism().map_or(1, usize::from).min(items.len().max(1));
    let next_item = AtomicUsize::new(0);
    let (next_item, work) = (&next_item, &work);
    let mut results: Vec<(usize, T)> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..threads)
            .map(|_| {
                scope.spawn(move || {
                    let mut done = Vec::new();
                    loop {
                        let index = next_item.fetch_add(1, Ordering::Relaxed);
                        let Some(item) = items.get(index) else {
                            return done;
                        };
                        done.push((index, work(item)));
                    }
                })
            })
            .collect();
        handles.into_iter().flat_map(|handle| handle.join().unwrap_or_default()).collect()
    });
    if results.len() != items.len() {
        return None;
    }
    results.sort_unstable_by_key(|(index, _)| *index);
    Some(results.into_iter().map(|(_, result)| result).collect())
}
