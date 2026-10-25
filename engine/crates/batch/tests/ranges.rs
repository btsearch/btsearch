mod common;

use common::read_appendix_a_changed;
use engine_batch::ValueField;
use engine_batch::document::Cell;

#[test]
fn drops_a_value_out_of_range_and_keeps_its_reading() {
    let upload = read_appendix_a_changed(|document| document["snapshots"][0]["measurements"][0]["rsrpDbm"] = 2_147_483_647.into()).expect("the upload reads");
    let serving = &upload.batch.snapshots[0].measurements[0];
    assert_eq!((serving.rsrp_dbm, serving.rsrq_db, serving.timing_advance), (None, Some(-11), Some(12)));
    assert_eq!(upload.dropped_values.get(ValueField::RsrpDbm), 1);
}

#[test]
fn reads_a_value_by_its_cell_s_technology() {
    let upload = read_appendix_a_changed(|document| {
        document["snapshots"][0]["measurements"][0]["timingAdvance"] = 1_283.into();
        document["snapshots"][0]["measurements"][0]["ssRsrpDbm"] = (-90).into();
        document["snapshots"][0]["measurements"][2]["timingAdvance"] = 1_283.into();
    })
    .expect("the upload reads");
    let [lte, _, nr] = &upload.batch.snapshots[0].measurements[..] else { panic!("three measurements") };
    assert_eq!((lte.timing_advance, lte.ss_rsrp_dbm), (None, None));
    assert_eq!(nr.timing_advance, Some(1_283));
    assert_eq!((upload.dropped_values.get(ValueField::TimingAdvance), upload.dropped_values.get(ValueField::SsRsrpDbm)), (1, 1));
}

#[test]
fn drops_cell_values_out_of_range() {
    let upload = read_appendix_a_changed(|document| {
        document["cells"][2]["pci"] = 1_008.into();
        document["cells"][0]["bands"] = vec![3, 300].into();
    })
    .expect("the upload reads");
    let (Cell::Lte(lte), Cell::Nr(nr)) = (&upload.batch.cells[0], &upload.batch.cells[2]) else { panic!("an LTE and an NR cell") };
    assert_eq!((nr.pci, nr.arfcn), (None, Some(636_666)));
    assert_eq!(lte.common.bands.as_deref(), Some(&[3][..]));
    assert_eq!((upload.dropped_values.get(ValueField::Pci), upload.dropped_values.get(ValueField::Bands)), (1, 1));
}

#[test]
fn drops_a_fix_that_is_not_on_earth() {
    let upload = read_appendix_a_changed(|document| {
        document["fixes"][0]["latitude"] = 91.0.into();
        document["fixes"][1]["bearingDegrees"] = 400.0.into();
    })
    .expect("the upload reads");
    assert_eq!(upload.batch.fixes.len(), 1);
    assert_eq!(upload.batch.fixes[0].bearing_degrees, None);
    assert_eq!((upload.dropped_values.get(ValueField::Latitude), upload.dropped_values.get(ValueField::BearingDegrees)), (1, 1));
}
