use engine_geo::Point;
use engine_geo::mcc::countries_of_plmn;
use engine_geo::outlines::{CountryOutline, CountryOutlines};

const WEST_OF_THE_BORDER: &str = r#"{"type":"MultiPolygon","coordinates":[[[[14.0,50.0],[15.0,50.0],[15.0,51.0],[14.0,51.0],[14.0,50.0]]]]}"#;
const EAST_OF_THE_BORDER: &str = r#"{"type":"MultiPolygon","coordinates":[[[[15.0,50.0],[16.0,50.0],[16.0,51.0],[15.0,51.0],[15.0,50.0]],[[15.4,50.4],[15.6,50.4],[15.6,50.6],[15.4,50.6],[15.4,50.4]]]]}"#;

fn two_countries() -> CountryOutlines {
    CountryOutlines::new(vec![
        CountryOutline::from_geojson("PL", EAST_OF_THE_BORDER).expect("the outline parses"),
        CountryOutline::from_geojson("DE", WEST_OF_THE_BORDER).expect("the outline parses"),
    ])
}

#[test]
fn a_point_lies_in_the_country_on_its_side_of_the_border() {
    let outlines = two_countries();
    assert_eq!(outlines.country_at(Point::new(50.5, 14.99)), Some("DE"));
    assert_eq!(outlines.country_at(Point::new(50.5, 15.01)), Some("PL"));
    assert_eq!(outlines.country_at(Point::new(50.5, 15.5)), None, "the hole is no country");
    assert_eq!(outlines.country_at(Point::new(52.0, 15.5)), None);
    assert!(outlines.has("PL") && !outlines.has("CZ"));
}

#[test]
fn a_point_is_within_a_distance_of_a_country() {
    let outlines = two_countries();
    let in_germany_near_the_border = Point::new(50.5, 14.9);
    assert!(outlines.is_within("PL", in_germany_near_the_border, 30_000.0), "about 7 km from Poland");
    assert!(!outlines.is_within("PL", Point::new(50.5, 14.3), 30_000.0), "about 50 km from Poland");
    assert!(outlines.is_within("PL", Point::new(50.5, 15.8), 0.0), "inside Poland");
    assert!(!outlines.is_within("CZ", Point::new(50.5, 15.8), 30_000.0), "a country without an outline");
}

#[test]
fn a_network_belongs_to_the_countries_of_its_mcc() {
    assert_eq!(countries_of_plmn("26006"), ["PL"]);
    assert_eq!(countries_of_plmn("23420"), ["GB", "GG", "IM", "JE"]);
    assert_eq!(countries_of_plmn("310260"), ["US"]);
    assert!(countries_of_plmn("99999").is_empty());
    assert!(countries_of_plmn("26").is_empty());
}
