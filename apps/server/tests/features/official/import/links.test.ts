import type { MicrowaveLinkRecord } from "@openbts/country-packs/sources";
import { describe, expect, it } from "vitest";

import { decideLinks } from "../../../../src/features/official/import/links/decide.js";
import { collectEquipment } from "../../../../src/features/official/import/links/equipment.js";
import { type LinkValues, type StoredLink, toLinkValues } from "../../../../src/features/official/import/links/values.js";

const FILE_DATE = new Date("2026-10-01T14:15:16.789Z");
const EQUIPMENT = { transmitterTypeIds: new Map([["RTN 950", 31]]), antennaTypeIds: new Map([["A23", 21]]) };

function record(overrides: Partial<MicrowaveLinkRecord> = {}): MicrowaveLinkRecord {
  return {
    slice: "",
    licensee: "Orange Polska S.A.",
    permitNumber: "RL/1",
    decisionType: "permit",
    issuedOn: "2025-01-01",
    expiresOn: "2030-01-01",
    tx: {
      longitude: 21.01,
      latitude: 52.22,
      groundHeight: 110,
      antennaHeight: 30,
      city: "Warszawa",
      province: "mazowieckie",
      street: "Testowa 1",
      locationDescription: null,
    },
    rx: {
      longitude: 21.05,
      latitude: 52.25,
      groundHeight: 120,
      antennaHeight: 25,
      city: "Marki",
      province: "mazowieckie",
      street: null,
      locationDescription: "maszt",
    },
    freqMhz: 23000,
    channelNumber: 5,
    channelWidthMhz: 28,
    polarization: "V",
    planSymbol: "23A28",
    eirpDbm: 30.5,
    technical: {
      modulationType: "128QAM",
      bandwidth: "200",
      txAntennaAttenuation: 1,
      transmitter: { type: "RTN 950", manufacturer: "Huawei" },
      txAntenna: { type: "A23", manufacturer: "Huawei" },
      txAntennaGain: 35,
      rxAntenna: { type: "A23", manufacturer: "Andrew" },
      rxAntennaGain: 35,
      rxNoiseFigure: 5,
      rxAtpcAttenuation: 10,
    },
    publishesEveryTechnicalColumn: true,
    ...overrides,
  };
}

function values(overrides: Partial<MicrowaveLinkRecord> = {}, licenseeId: number | null = 8): LinkValues {
  return toLinkValues(record(overrides), licenseeId, EQUIPMENT);
}

function stored(id: number, published: LinkValues, overrides: Partial<StoredLink> = {}): StoredLink {
  return {
    plan_symbol: null,
    modulation_type: null,
    bandwidth: null,
    tx_antenna_attenuation: null,
    tx_transmitter_type_id: null,
    tx_antenna_type_id: null,
    tx_antenna_gain: null,
    rx_antenna_type_id: null,
    rx_antenna_gain: null,
    rx_noise_figure: null,
    rx_atpc_attenuation: null,
    ...published,
    id,
    dataset_id: 3,
    source_ref: null,
    specs_date: FILE_DATE,
    updatedAt: FILE_DATE,
    createdAt: FILE_DATE,
    ...overrides,
  };
}

describe("a link record as columns", () => {
  it("leaves out what the release does not publish", () => {
    const published = toLinkValues(record({ planSymbol: undefined, technical: { bandwidth: null } }), null, EQUIPMENT);

    expect(published).not.toHaveProperty("plan_symbol");
    expect(published).not.toHaveProperty("modulation_type");
    expect(published).not.toHaveProperty("tx_transmitter_type_id");
    expect(published).toMatchObject({ bandwidth: null, operator_id: null });
  });

  it("stores no type for equipment the release names without one", () => {
    const published = values({
      technical: { transmitter: { type: null, manufacturer: "Huawei" }, txAntenna: { type: "Unknown dish", manufacturer: null } },
    });

    expect(published).toMatchObject({ tx_transmitter_type_id: null, tx_antenna_type_id: null });
  });
});

describe("the equipment a release names", () => {
  it("keeps the manufacturer of the first record that names a type", () => {
    const published = collectEquipment([
      record(),
      record({ technical: { txAntenna: { type: "A23", manufacturer: "Ericsson" }, transmitter: { type: "MINI-LINK", manufacturer: null } } }),
      record({ technical: {} }),
    ]);

    expect([...published.manufacturers]).toEqual(["Huawei", "Andrew", "Ericsson"]);
    expect([...published.antennaTypes]).toEqual([["A23", "Huawei"]]);
    expect([...published.transmitterTypes]).toEqual([
      ["RTN 950", "Huawei"],
      ["MINI-LINK", null],
    ]);
  });
});

describe("the decision over a links release", () => {
  it("leaves a link alone when the release publishes it as stored", () => {
    const decision = decideLinks([stored(801, values())], [values()]);

    expect(decision).toEqual({ inserts: [], updates: [], renewals: [], archivedIds: [], duplicateRecords: 0 });
  });

  it("updates a link whose values changed under the same key", () => {
    const published = values({ eirpDbm: 31 });

    expect(decideLinks([stored(801, values())], [published])).toMatchObject({
      updates: [{ id: 801, values: published }],
      inserts: [],
      archivedIds: [],
    });
  });

  it("compares days as they are written", () => {
    const sameDay = values({ expiresOn: "2030-01-01" });
    const laterDay = values({ expiresOn: "2031-01-01" });
    const otherIssueDay = values({ issuedOn: "2025-01-02" });

    expect(decideLinks([stored(801, values())], [sameDay]).updates).toEqual([]);
    expect(decideLinks([stored(801, values())], [laterDay]).updates).toHaveLength(1);
    expect(decideLinks([stored(801, values())], [otherIssueDay]).updates).toHaveLength(1);
  });

  it("does not compare what the release does not publish", () => {
    const partial = values({ planSymbol: undefined, technical: {} });

    expect(decideLinks([stored(801, values())], [partial]).updates).toEqual([]);
  });

  it("matches a missing licensee, polarization and channel number as values", () => {
    const published = values({ polarization: null, channelNumber: null }, null);
    const decision = decideLinks([stored(801, published)], [published]);

    expect(decision).toMatchObject({ inserts: [], updates: [], archivedIds: [] });
  });

  it("inserts a link the dataset does not have and archives one the release lacks", () => {
    const added = values({ permitNumber: "RL/9", freqMhz: 38000 });
    const decision = decideLinks([stored(801, values()), stored(802, values({ permitNumber: "RL/2", freqMhz: 11000 }))], [values(), added]);

    expect(decision).toMatchObject({ inserts: [added], updates: [], renewals: [], archivedIds: [802] });
  });

  it("renews the one stored link that differs from the one new record by its permit number only", () => {
    const renewed = values({ permitNumber: "RL/1-2026" });
    const decision = decideLinks([stored(801, values())], [renewed]);

    expect(decision).toMatchObject({ inserts: [], renewals: [{ id: 801, values: renewed }], archivedIds: [] });
  });

  it("does not renew when the channel width differs", () => {
    const wider = values({ permitNumber: "RL/1-2026", channelWidthMhz: 56 });

    expect(decideLinks([stored(801, values())], [wider])).toMatchObject({ inserts: [wider], renewals: [], archivedIds: [801] });
  });

  it("does not renew when two records or two stored links share the rest of the key", () => {
    const first = values({ permitNumber: "RL/1-a" });
    const second = values({ permitNumber: "RL/1-b" });

    expect(decideLinks([stored(801, values())], [first, second])).toMatchObject({ inserts: [first, second], renewals: [], archivedIds: [801] });
    expect(decideLinks([stored(801, values()), stored(802, values({ permitNumber: "RL/0" }))], [first])).toMatchObject({
      inserts: [first],
      renewals: [],
      archivedIds: [801, 802],
    });
  });

  it("does not renew across licensees", () => {
    const otherLicensee = values({ permitNumber: "RL/1-2026" }, 9);

    expect(decideLinks([stored(801, values())], [otherLicensee])).toMatchObject({ inserts: [otherLicensee], renewals: [], archivedIds: [801] });
  });

  it("keeps the last of two records with one key and counts the other", () => {
    const first = values({ eirpDbm: 31 });
    const last = values({ eirpDbm: 32 });

    expect(decideLinks([], [first, last])).toMatchObject({ inserts: [last], duplicateRecords: 1 });
    expect(decideLinks([stored(801, values())], [first, last])).toMatchObject({ updates: [{ id: 801, values: last }], duplicateRecords: 1 });
  });
});
