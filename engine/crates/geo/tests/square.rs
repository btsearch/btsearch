use engine_geo::Point;
use engine_geo::square::{SQUARE_ZOOM, Tile, offset_centimetres, parent, square_at, square_centre};

const PALACE_OF_CULTURE: Point = Point { latitude: 52.2318, longitude: 21.0060 };
const APPENDIX_A_FIX: Point = Point { latitude: 52.229_712_3, longitude: 21.012_245_6 };
const WESTMINSTER: Point = Point { latitude: 51.5007, longitude: -0.1246 };
const SYDNEY_OPERA_HOUSE: Point = Point { latitude: -33.8568, longitude: 151.2153 };

#[test]
fn a_point_lies_in_the_tile_of_web_mercator() {
    let pinned = [
        (PALACE_OF_CULTURE, 585_472, 345_260, 422_860_654_752),
        (APPENDIX_A_FIX, 585_490, 345_270, 422_860_655_404),
        (WESTMINSTER, 523_925, 348_709, 238_225_738_035),
        (SYDNEY_OPERA_HOUSE, 964_734, 629_200, 922_474_428_244),
    ];
    for (point, x, y, square) in pinned {
        assert_eq!(Tile::at(point, SQUARE_ZOOM), Tile { zoom: SQUARE_ZOOM, x, y }, "{point:?}");
        assert_eq!(square_at(point), square, "{point:?}");
        assert_eq!(Tile::from_quadkey(square, SQUARE_ZOOM), Tile { zoom: SQUARE_ZOOM, x, y });
    }
}

#[test]
fn a_parent_is_the_square_shifted() {
    let square = square_at(APPENDIX_A_FIX);
    assert_eq!(parent(square, 12), 6_452_341);
    assert_eq!(parent(square, 12), Tile::at(APPENDIX_A_FIX, 12).quadkey());
    assert_eq!(parent(square_at(PALACE_OF_CULTURE), 12), parent(square, 12));
    assert_eq!(parent(square, SQUARE_ZOOM), square);
}

#[test]
fn a_sample_is_kept_as_its_offset_from_the_centre() {
    let square = square_at(APPENDIX_A_FIX);
    let centre = square_centre(square);
    assert!((centre.latitude - 52.229_797_160).abs() < 1e-9 && (centre.longitude - 21.012_210_846).abs() < 1e-9, "{centre:?}");
    assert_eq!(offset_centimetres(square, centre), (0, 0));
    let (east, north) = offset_centimetres(square, APPENDIX_A_FIX);
    assert!(east > 0 && north < 0, "the fix lies east and south of the centre: {east}, {north}");
    assert!(east.abs() < 1_300 && north.abs() < 1_300, "the fix lies inside its square of about 23 m: {east}, {north}");
}
