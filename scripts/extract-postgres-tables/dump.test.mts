import assert from "node:assert/strict";
import test from "node:test";

import { findIdentitySequences, findOwningTable, findReferencedTables, parseObjectHeader, parseSimpleQualifiedName } from "./dump.mjs";

void test("parses pg_dump object headers", () => {
  assert.deepEqual(parseObjectHeader("-- Name: stations; Type: TABLE; Schema: official; Owner: btsearch"), {
    name: "stations",
    type: "TABLE",
    schema: "official",
  });
  assert.deepEqual(parseObjectHeader("-- Data for Name: stations; Type: TABLE DATA; Schema: official; Owner: btsearch"), {
    name: "stations",
    type: "TABLE DATA",
    schema: "official",
  });
  assert.equal(parseObjectHeader("-- ordinary comment"), undefined);
});

void test("parses CLI table names", () => {
  assert.deepEqual(parseSimpleQualifiedName("stations", "official"), { schema: "official", name: "stations" });
  assert.deepEqual(parseSimpleQualifiedName("public.stations"), { schema: "public", name: "stations" });
  assert.throws(() => parseSimpleQualifiedName("stations"), /Expected schema\.name/);
});

void test("finds owning and referenced tables with quoted identifiers", () => {
  const sql = `ALTER TABLE ONLY "official"."child"\n  ADD CONSTRAINT child_parent_fkey FOREIGN KEY (parent_id) REFERENCES "official"."parent"(id);`;

  assert.deepEqual(findOwningTable(sql), { schema: "official", name: "child" });
  assert.deepEqual(findReferencedTables(sql), [{ schema: "official", name: "parent" }]);
});

void test("finds identity and serial sequences", () => {
  const sql = `
ALTER TABLE ONLY official.identity_table ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
  SEQUENCE NAME official.identity_table_id_seq
);
ALTER TABLE ONLY official.serial_table ALTER COLUMN id SET DEFAULT nextval('official.serial_table_id_seq'::regclass);
SELECT nextval('invalid.sequence.extra'::regclass);`;

  assert.deepEqual(findIdentitySequences(sql), [
    { schema: "official", name: "identity_table_id_seq" },
    { schema: "official", name: "serial_table_id_seq" },
  ]);
});
