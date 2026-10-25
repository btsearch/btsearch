pub(crate) fn weighted_quantile(mut values: Vec<(f64, f64)>, share: f64) -> Option<f64> {
    values.sort_by(|a, b| a.0.total_cmp(&b.0));
    let total: f64 = values.iter().map(|(_, weight)| weight).sum();
    let mut seen = 0.0;
    values
        .into_iter()
        .find(|(_, weight)| {
            seen += weight;
            seen >= total * share
        })
        .map(|(value, _)| value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_weighted_median_takes_the_middle_of_the_weight() {
        assert_eq!(weighted_quantile(vec![(10.0, 1.0), (-500.0, 5.0), (3.0, 1.0)], 0.5), Some(-500.0));
    }
}
