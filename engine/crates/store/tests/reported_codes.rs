mod common;

use common::Harness;
use engine_store::reported_codes::REPORTED_CODES;

const LISTED_NETWORKS: &str = "
    WITH network AS (
      INSERT INTO public.operators (name, full_name) SELECT code, 'engine-test' FROM unnest('{99901,999001,99902,999003}'::text[]) AS listed(code)
      RETURNING id, name
    )
    INSERT INTO public.plmns (mcc, mnc, operator_id) SELECT left(name, 3), substr(name, 4), id FROM network";

async fn networks_of(harness: &Harness, reported: &[&str]) -> Vec<String> {
    let client = harness.store.database.pool.get().await.expect("a connection");
    let statement = format!(
        "SELECT o.name FROM unnest($1::text[]) WITH ORDINALITY AS r(code, position)
         JOIN {REPORTED_CODES} p ON p.reported_code = r.code
         JOIN public.operators o ON o.id = p.operator_id
         ORDER BY r.position"
    );
    let rows = client.query(&statement, &[&reported]).await.expect("the reported codes resolve");
    rows.iter().map(|row| row.get(0)).collect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_code_reported_with_its_mnc_in_the_other_length_finds_its_network() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.execute(LISTED_NETWORKS).await;
    assert_eq!(networks_of(&harness, &["999002", "99903"]).await, ["99902", "999003"]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_exact_code_wins_over_another_networks_code_in_the_other_length() {
    let Some(harness) = Harness::start().await else {
        return;
    };
    harness.execute(LISTED_NETWORKS).await;
    assert_eq!(networks_of(&harness, &["99901", "999001"]).await, ["99901", "999001"], "a 2-digit and a 3-digit MNC can be two networks");
}
