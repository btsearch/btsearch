import assert from "node:assert/strict";
import test from "node:test";

import { findIdentitySequences, findOwningTable, findReferencedTables, parseObjectHeader, parseSimpleQualifiedName } from "./dump.mjs";

void test("parses pg_dump object headers", () => {
  assert.deepEqual(parseObjectHeader("-- Name: stations; Type: TABLE; Schema: uke; Owner: btsearch"), {
    name: "stations",
    type: "TABLE",
    schema: "uke",
  });
  assert.deepEqual(parseObjectHeader("-- Data for Name: stations; Type: TABLE DATA; Schema: uke; Owner: btsearch"), {
    name: "stations",
    type: "TABLE DATA",
    schema: "uke",
  });
  assert.equal(parseObjectHeader("-- ordinary comment"), undefined);
});

void test("parses CLI table names", () => {
  assert.deepEqual(parseSimpleQualifiedName("stations", "uke"), { schema: "uke", name: "stations" });
  assert.deepEqual(parseSimpleQualifiedName("public.stations"), { schema: "public", name: "stations" });
  assert.throws(() => parseSimpleQualifiedName("stations"), /Expected schema\.name/);
});

void test("finds owning and referenced tables with quoted identifiers", () => {
  const sql = `ALTER TABLE ONLY "uke"."child"\n  ADD CONSTRAINT child_parent_fkey FOREIGN KEY (parent_id) REFERENCES "uke"."parent"(id);`;

  assert.deepEqual(findOwningTable(sql), { schema: "uke", name: "child" });
  assert.deepEqual(findReferencedTables(sql), [{ schema: "uke", name: "parent" }]);
});

void test("finds identity and serial sequences", () => {
  const sql = `
ALTER TABLE ONLY uke.identity_table ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
  SEQUENCE NAME uke.identity_table_id_seq
);
ALTER TABLE ONLY uke.serial_table ALTER COLUMN id SET DEFAULT nextval('uke.serial_table_id_seq'::regclass);
SELECT nextval('invalid.sequence.extra'::regclass);`;

  assert.deepEqual(findIdentitySequences(sql), [
    { schema: "uke", name: "identity_table_id_seq" },
    { schema: "uke", name: "serial_table_id_seq" },
  ]);
});
