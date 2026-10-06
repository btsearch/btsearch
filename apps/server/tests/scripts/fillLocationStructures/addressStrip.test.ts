import { describe, expect, it } from "vitest";

import { planAddressStrip } from "../../../src/scripts/fillLocationStructures/addressStrip.js";

const plainAddress = "ul. Dworcowa 35 - dach budynku mieszkalnego";
const detailedAddress = `${plainAddress} - SLR - Stacja Linii Radiowych`;

describe("planAddressStrip", () => {
  it.each([null, "different note", "budynek Szkoły Podstawowej nr 10", "maszt na budynku Szkoły Podstawowej nr 10"])(
    "requires the complete building identity to be stored before stripping: %s",
    (note) => {
      const address = "ul. Dworcowa 35 - maszt na budynku Szkoły Podstawowej nr 10";
      const hasStoredNote = note === "budynek Szkoły Podstawowej nr 10" || note === "maszt na budynku Szkoły Podstawowej nr 10";
      expect(planAddressStrip({ id: 1, address }, { hasType: true, hasOwner: false, note })).toMatchObject({
        addressAfter: hasStoredNote ? "ul. Dworcowa 35" : address,
        keptBecause: hasStoredNote ? null : "note_not_stored",
      });
    },
  );

  it.each([null, "budynek kotłowni", "maszt na budynku kotłowni"])(
    "requires the boiler-house note to be stored before stripping: %s",
    (note) => {
      const address = "ul. Dworcowa 35 - maszt na budynku kotłowni";
      expect(planAddressStrip({ id: 1, address }, { hasType: true, hasOwner: false, note })).toMatchObject({
        addressAfter: note === null ? address : "ul. Dworcowa 35",
        keptBecause: note === null ? "note_not_stored" : null,
      });
    },
  );

  it("strips a plain description only after its type is stored", () => {
    expect(planAddressStrip({ id: 1, address: plainAddress }, { hasType: true, hasOwner: false, note: null })).toMatchObject({
      addressAfter: "ul. Dworcowa 35",
      keptBecause: null,
    });
    expect(planAddressStrip({ id: 1, address: plainAddress }, { hasType: false, hasOwner: false, note: null })).toMatchObject({
      addressAfter: plainAddress,
      keptBecause: "type_not_stored",
    });
  });

  it("strips a plain compound placement only after its type is stored", () => {
    const address = "ul. Dworcowa 35 - wieża kratowa na dachu budynku mieszkalno-usługowego";
    expect(planAddressStrip({ id: 1, address }, { hasType: true, hasOwner: false, note: null })).toMatchObject({
      addressAfter: "ul. Dworcowa 35",
      keptBecause: null,
    });
    expect(planAddressStrip({ id: 1, address }, { hasType: false, hasOwner: false, note: null })).toMatchObject({
      addressAfter: address,
      keptBecause: "type_not_stored",
    });
  });

  it("keeps a compound placement's additional information until it is stored", () => {
    const address = "ul. Dworcowa 35 - wieża kratowa na dachu budynku mieszkalno-usługowego - SLR - Stacja Linii Radiowych";
    expect(planAddressStrip({ id: 1, address }, { hasType: true, hasOwner: false, note: null })).toMatchObject({
      addressAfter: address,
      keptBecause: "note_not_stored",
    });
    expect(planAddressStrip({ id: 1, address }, { hasType: true, hasOwner: false, note: "SLR - Stacja Linii Radiowych" })).toMatchObject({
      addressAfter: "ul. Dworcowa 35",
      keptBecause: null,
    });
  });

  it.each([null, "biurowiec", "Dach budynku biurowego"])("requires the office note to be stored before stripping: %s", (note) => {
    const address = "ul. Dworcowa 35 - Dach budynku biurowego";
    expect(planAddressStrip({ id: 1, address }, { hasType: true, hasOwner: false, note })).toMatchObject({
      addressAfter: note === null ? address : "ul. Dworcowa 35",
      keptBecause: note === null ? "note_not_stored" : null,
    });
  });

  it.each(["SLR - Stacja Linii Radiowych", "dach budynku mieszkalnego - SLR - Stacja Linii Radiowych"])(
    "accepts stored extra information or the previous full description: %s",
    (note) => {
      expect(planAddressStrip({ id: 1, address: detailedAddress }, { hasType: true, hasOwner: false, note })).toMatchObject({
        addressAfter: "ul. Dworcowa 35",
        keptBecause: null,
      });
    },
  );

  it.each([null, "different note"])("preserves an address when its extra information is not stored: %s", (note) => {
    expect(planAddressStrip({ id: 1, address: detailedAddress }, { hasType: true, hasOwner: false, note })).toMatchObject({
      addressAfter: detailedAddress,
      keptBecause: "note_not_stored",
    });
  });

  it("keeps a radio-station name that does not identify a structure type or owner", () => {
    const address = "ul. Dworcowa 35 - SLR - Stacja Linii Radiowych";
    expect(planAddressStrip({ id: 1, address }, { hasType: false, hasOwner: false, note: "SLR - Stacja Linii Radiowych" })).toMatchObject({
      addressAfter: address,
      keptBecause: "unrecognised",
    });
  });
});
