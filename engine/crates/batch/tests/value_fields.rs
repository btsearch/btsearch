mod common;

use std::fs;

use common::engine_directory;
use engine_batch::ValueField;

#[test]
fn value_fields_are_the_database_enum() {
    let schema_path = engine_directory().join("../packages/drizzle/schemas/observations.ts");
    let schema = fs::read_to_string(&schema_path).unwrap_or_else(|error| panic!("{} cannot be read: {error}", schema_path.display()));
    let declaration = schema.split("pgEnum(\"batch_value_field\", [").nth(1).expect("observations.ts declares batch_value_field");
    let list = declaration.split(']').next().expect("the enum's list ends");
    let in_database: Vec<&str> = list.split('"').skip(1).step_by(2).collect();

    let in_engine: Vec<&str> = ValueField::ALL.iter().map(|field| field.as_str()).collect();
    assert_eq!(in_engine, in_database);
}
