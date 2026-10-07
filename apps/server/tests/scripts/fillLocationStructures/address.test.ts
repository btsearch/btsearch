import { describe, expect, it } from "vitest";

import { parseAddress } from "../../../src/scripts/fillLocationStructures/address.js";

describe("parseAddress", () => {
  it.each([
    ["maszt na budynku kotłowni", "budynek kotłowni"],
    ["MASZT NA BUDYNKU KOTŁOWNI", "budynek KOTŁOWNI"],
  ])("retains a boiler-house building identity: %s", (description, note) => {
    expect(parseAddress(description)).toMatchObject({ type: "mast", owner: null, note });
  });

  it.each([
    ["maszt na budynku kotłowni - SLR - Stacja Linii Radiowych", "budynek kotłowni - SLR - Stacja Linii Radiowych"],
    ["maszt na budynku kotłowni DPS", "budynek kotłowni DPS"],
    ["maszt na budynku kotłowni SAM", "budynek kotłowni SAM"],
    ["maszt na budynku kotłowni, 30 m, BT123", "budynek kotłowni, 30 m, BT123"],
    ["maszt na budynku kotłowni PEC (dawniej ZNTK)", "budynek kotłowni PEC (dawniej ZNTK)"],
    ["maszt na budynku kotłowni (dawniej TP S.A.)", "budynek kotłowni (dawniej TP S.A.)"],
  ])("preserves additional information after the boiler-house identity: %s", (description, note) => {
    expect(parseAddress(description)).toMatchObject({ type: "mast", note });
  });

  it("keeps an office noun as boiler-house detail rather than replacing the identity", () => {
    expect(parseAddress("maszt na dachu budynku kotłowni biurowca Elrow")).toMatchObject({
      type: "rooftop_mast",
      note: "budynek kotłowni biurowca Elrow",
    });
  });

  it.each(["maszt - na budynku kotłowni", "maszt na budynku dawnej kotłowni", "maszt na budynku kotłowni - komin"])(
    "keeps a boiler-house alternative or historical description conservative: %s",
    (description) => {
      expect(parseAddress(description).note).toBe(description);
    },
  );

  it("does not normalize a boiler-house identity outside its attached building context", () => {
    expect(parseAddress("ul. Dworcowa 35 - kotłownia").note).toBe("kotłownia");
    expect(parseAddress("maszt na kotłowni").note).toBe("na kotłowni");
    expect(parseAddress("maszt na budynku kotłowni-ABC").note).toBe("budynek kotłowni-ABC");
    expect(parseAddress("maszt na dachu bloku kotłowni").note).toBe("kotłowni");
  });

  it.each([
    ["maszt na budynku szkoły podstawowej", "mast", "budynek szkoły podstawowej"],
    [
      "maszt na budynku Szkoły Podstawowej z Oddziałami Integracyjnymi nr 154",
      "mast",
      "budynek Szkoły Podstawowej z Oddziałami Integracyjnymi nr 154",
    ],
    ["maszt na dachu budynku szpitala SZPZOZ", "rooftop_mast", "budynek szpitala SZPZOZ"],
    ["wieża kratowa na dachu budynku Poczty Polskiej", "lattice_tower", "budynek Poczty Polskiej"],
    ["maszt na budynku PPH Marc-TH", "mast", "budynek PPH Marc-TH"],
    ["maszt na budynku Fitness Platinium", "mast", "budynek Fitness Platinium"],
    ["maszt na budynku Stoen Operator", "mast", "budynek Stoen Operator"],
    ["maszt na budynku serwisu AutoAdamski", "mast", "budynek serwisu AutoAdamski"],
    ["maszt na budynku klubu sportowego", "mast", "budynek klubu sportowego"],
    ["maszt na budynku prywatnym", "mast", "budynek prywatnym"],
    ['wieża kratowa na dachu budynku "Wieża Babel"', "lattice_tower", 'budynek "Wieża Babel"'],
    ["wieża kratowa na dachu budynku Fitness / Platinium", "lattice_tower", "budynek Fitness / Platinium"],
    ["wieża kratowa na dachu budynku Fitness: Platinium", "lattice_tower", "budynek Fitness: Platinium"],
    ["maszt na budynku mieszkalnym Altus-Nowy", "mast", "budynek Altus-Nowy"],
  ])("retains the complete directly attached building object: %s", (description, type, note) => {
    expect(parseAddress(description)).toMatchObject({ type, note });
  });

  it("keeps an owner word inside the complete building name", () => {
    expect(parseAddress("wieża kratowa na dachu budynku Orange Polska (dawniej TP S.A.)")).toMatchObject({
      type: "lattice_tower",
      owner: "orange",
      note: "budynek Orange Polska (dawniej TP S.A.)",
    });
  });

  it.each(["SLR", "Stacja Linii Radiowych", "RTCN Gołańcz", "30 m", "BT123", "ID 123", "na wysokości 30 m"])(
    "does not invent a building identity for directly attached technical information: %s",
    (note) => {
      expect(parseAddress(`maszt na budynku ${note}`).note).toBe(note);
    },
  );

  it.each([" - ", ", ", "; ", ": ", " / "])("does not invent a building identity after a delimiter: %s", (separator) => {
    expect(parseAddress(`maszt na budynku${separator}SLR - Stacja Linii Radiowych`).note).toBe("SLR - Stacja Linii Radiowych");
  });

  it.each([" - ", ", ", "; ", ": ", " / "])("keeps every note separator outside the attached identity mask: %s", (separator) => {
    const description = `wieża kratowa na dachu budynku szkoły${separator}komin`;
    expect(parseAddress(description).note).toBe(description);
  });

  it.each([
    "wieża kratowa na dachu budynku szkoły, dach hotelu",
    "wieża kratowa na dachu budynku szkoły i komin",
    "wieża kratowa na dachu budynku Wieża Babel",
    "wieża kratowa na dachu budynku szkoły i przedszkola",
    "wieża kratowa na dachu budynku albo komin",
    "maszt - na budynku szkoły",
    "maszt na budynku dawnego szpitala SZPZOZ",
  ])("preserves separate structures and historical building wording: %s", (description) => {
    expect(parseAddress(description).note).toBe(description);
  });

  it.each(["dach budynku mieszkalnego", "dach bloku mieszkalnego", "maszt na dachu budynku mieszkalnego", "maszt na dachu kamienicy"])(
    "does not duplicate a plain structure description in the note: %s",
    (description) => {
      expect(parseAddress(`ul. Dworcowa 35 - ${description}`)).toMatchObject({
        street: "ul. Dworcowa 35",
        type: description.startsWith("maszt") ? "rooftop_mast" : "rooftop",
        owner: null,
        note: null,
      });
    },
  );

  it.each([
    ["wieża kratowa na dachu budynku mieszkalno-usługowego", "lattice_tower"],
    ["wieża na dachu budynku mieszkalnego", "tower"],
    ["wieża rurowa na dachu kamienicy", "tubular_tower"],
    ["maszt kratowy na dachu budynku mieszkalno-usługowego", "rooftop_mast"],
    ["dach budynku mieszkalno-usługowego", "rooftop"],
  ])("recognizes a connected rooftop placement without duplicating it in the note: %s", (description, type) => {
    expect(parseAddress(description)).toMatchObject({ street: null, type, owner: null, note: null });
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`)).toMatchObject({ street: "ul. Dworcowa 35", type, note: null });
  });

  it.each([
    "mieszkalno-usługowego",
    "usługowo-mieszkalnego",
    "handlowo-usługowego",
    "usługowo-handlowego",
    "biurowo-usługowego",
    "usługowo-biurowego",
    "handlowo-biurowego",
    "biurowo-handlowego",
    "biurowo-mieszkalnego",
    "mieszkalno-biurowego",
    "mieszkalno-handlowego",
    "handlowo-mieszkalnego",
    "handlowo-usługowo-biurowego",
    "biurowo-usługowo-handlowy",
    "mieszkalno-biurowo-usługowy",
    "magazynowo-biurowym",
    "biurowo-magazynowym",
  ])("consumes only known building-use combinations in a structural building context: %s", (modifier) => {
    const description = `wieża kratowa na dachu budynku ${modifier}`;
    expect(parseAddress(description)).toMatchObject({ type: "lattice_tower", note: null });
    expect(parseAddress(`${description} - SLR - Stacja Linii Radiowych`).note).toBe("SLR - Stacja Linii Radiowych");
    expect(parseAddress(`${description} Altus-Nowy`).note).toBe("budynek Altus-Nowy");
    expect(parseAddress(`wieża ${modifier}`).note).toContain(modifier);
  });

  it.each(["handlowo-usługowym", "biurowo-usługowym", "magazynowo-biurowym", "biurowo-magazynowym", "przemysłowym"])(
    "recognizes a directly attached building placement: %s",
    (modifier) => {
      const description = `maszt na budynku ${modifier}`;
      expect(parseAddress(description)).toMatchObject({ type: "mast", note: null });
      expect(parseAddress(`${description} - SLR - Stacja Linii Radiowych`).note).toBe("SLR - Stacja Linii Radiowych");
      expect(parseAddress(`${description}, 30 m, BT123`).note).toBe("30 m, BT123");
      expect(parseAddress(`${description} Altus-Nowy`).note).toBe("budynek Altus-Nowy");
    },
  );

  it.each([
    ["Dach budynku biurowego", "rooftop"],
    ["dach budynku biurowego", "rooftop"],
    ["DACH BUDYNKU BIUROWEGO", "rooftop"],
    ["wieża kratowa na dachu budynku biurowego", "lattice_tower"],
    ["maszt na budynku biurowym", "mast"],
  ])("normalizes a plain office-building use to its canonical note: %s", (description, type) => {
    expect(parseAddress(description)).toMatchObject({ type, note: "biurowiec" });
  });

  it.each([
    ["Dach budynku biurowego - SLR - Stacja Linii Radiowych", "biurowiec - SLR - Stacja Linii Radiowych"],
    ["Dach budynku biurowego Orange Polska", "biurowiec - Orange Polska"],
    ["wieża kratowa na dachu budynku biurowego Orange Polska", "biurowiec - Orange Polska"],
    ["dach budynku biurowego Altus", "biurowiec - Altus"],
    ["dach budynku biurowego, 30 m, BT123", "biurowiec - 30 m, BT123"],
    ["dach budynku biurowego (dawniej szkoła)", "biurowiec - dawniej szkoła"],
    ["dach biurowca Elrow", "biurowiec - Elrow"],
    ["dach biurowca Wektra Holding", "biurowiec - Wektra Holding"],
    ["dach biurowiec Wasko S.A.", "biurowiec - Wasko S.A."],
    ["wieża kratowa na dachu biurowca Elrow", "biurowiec - Elrow"],
  ])("retains meaningful information after the canonical office-building note: %s", (description, note) => {
    expect(parseAddress(description).note).toBe(note);
  });

  it.each([" - ", ", ", "; ", ": ", " / "])("retains an office property's complete owner-like name after a delimiter: %s", (separator) => {
    expect(parseAddress(`Dach budynku biurowego${separator}Orange Polska`)).toMatchObject({
      type: "rooftop",
      owner: "orange",
      note: "biurowiec - Orange Polska",
    });
  });

  it.each([
    "mieszkalno-usługowo-XYZ",
    "mieszkalno-usługowego-artystycznego",
    "biurowo-mieszkalno-handlowo-usługowy",
    "magazynowo-biurowego-XYZ",
    "przemysłowo-magazynowego",
  ])("retains an unsupported compound adjective as a whole: %s", (modifier) => {
    const note = parseAddress(`wieża kratowa na dachu budynku ${modifier}`).note;
    expect(note).toContain(modifier);
  });

  it("keeps an industrial adjective outside a building context", () => {
    expect(parseAddress("wieża przemysłowa").note).toBe("przemysłowa");
  });

  it.each([
    ["wieża kratowa na dachu budynku mieszkalno-usługowego - SLR - Stacja Linii Radiowych", "SLR - Stacja Linii Radiowych"],
    ["wieża kratowa na dachu budynku mieszkalno-usługowego, SLR Mława / Szydłówek", "SLR Mława / Szydłówek"],
    ["wieża kratowa na dachu budynku mieszkalno-usługowego, 30 m, BT123", "30 m, BT123"],
    ["wieża kratowa na dachu budynku mieszkalno-usługowego - SLR (dawniej TP S.A.)", "SLR (dawniej TP S.A.)"],
    ["wieża kratowa na dachu budynku Szkoły Podstawowej nr 10", "budynek Szkoły Podstawowej nr 10"],
    ["wieża kratowa na dachu budynku nieznanego obiektu Łączność-Zachód", "budynek nieznanego obiektu Łączność-Zachód"],
  ])("retains only meaningful information after a connected rooftop placement: %s", (description, note) => {
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`)).toMatchObject({ type: "lattice_tower", note });
  });

  it.each([
    "wieża kratowa i dach budynku",
    "wieża kratowa - dach budynku",
    "wieża kratowa albo na dachu budynku",
    "wieża kratowa - na dachu budynku",
    "wieża kratowa na dachu budynku i komin",
    "wieża kratowa na dachu budynku - dach hotelu",
    "wieża kratowa na dachu budynku i szkoła",
    "maszt kratowy na dachu budynku - wieża kratowa",
    "wieża kratowa na dachu dawnego budynku mieszkalnego",
    "maszt - na budynku handlowo-usługowym",
    "maszt na budynku handlowo-usługowym - dach hotelu",
  ])("retains ambiguity or history rather than treating it as a plain placement: %s", (description) => {
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`).note).toBe(description);
  });

  it("preserves a former remark after a connected rooftop placement", () => {
    const description = "wieża kratowa na dachu budynku mieszkalno-usługowego (dawniej komin)";
    expect(parseAddress(description)).toMatchObject({ type: "lattice_tower", note: "dawniej komin" });
  });

  it.each([
    ["dach budynku mieszkalnego - SLR - Stacja Linii Radiowych", "SLR - Stacja Linii Radiowych"],
    ["dach budynku mieszkalnego, 30 m, BT123", "30 m, BT123"],
    ["dach budynku mieszkalnego - nazwa: Łączność-Zachód", "nazwa: Łączność-Zachód"],
    ["dach budynku mieszkalnego - na wysokości 30 m", "na wysokości 30 m"],
    ["dach budynku mieszkalnego - (instalacja awaryjna)", "(instalacja awaryjna)"],
    ["dach budynku mieszkalnego - stalowy element mocowania", "stalowy element mocowania"],
  ])("keeps only the untouched additional information: %s", (description, note) => {
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`)).toMatchObject({ street: "ul. Dworcowa 35", type: "rooftop", note });
  });

  it.each(["SLR - Stacja Linii Radiowych", "Stacja Linii Radiowych"])("preserves the complete radio-station name: %s", (description) => {
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`)).toMatchObject({
      street: "ul. Dworcowa 35",
      type: null,
      owner: null,
      note: description,
    });
    expect(parseAddress(description)).toMatchObject({ street: null, type: null, owner: null, note: description });
  });

  it.each([
    ["wieża Cellnex / Play - SLR - Stacja Linii Radiowych", "on_tower"],
    ["wieża Cellnex / Plus - obiekt BT123", "towerlink"],
    ["wieża Emitel - SLR - Stacja Linii Radiowych", "emitel"],
  ])("preserves owner precedence while extracting the note: %s", (description, owner) => {
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`)).toMatchObject({
      type: "tower",
      owner,
      note: description.slice(description.indexOf(" - ") + 3),
    });
  });

  it.each(["dach wieży", "wieża Orange i Play", "była wieża Orange", "stalowy dawny komin", "stalowy były maszt"])(
    "retains descriptions with ambiguity or history: %s",
    (description) => {
      expect(parseAddress(`ul. Dworcowa 35 - ${description}`).note).toBe(description);
    },
  );

  it("preserves former remarks after a plain structural description", () => {
    expect(parseAddress("ul. Dworcowa 35 - wieża (dawniej komin)")).toMatchObject({ type: "tower", note: "dawniej komin" });
  });

  it.each([
    ["wieża - szczegóły (dawniej komin)", "szczegóły (dawniej komin)"],
    ["wieża kratowa Emitel - SLR (dawniej TP S.A.)", "SLR (dawniej TP S.A.)"],
  ])("preserves history within the untouched additional information: %s", (description, note) => {
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`).note).toBe(note);
  });

  it.each(["wieża własna", "kratowa własna wieża"])("does not duplicate a plain ownership description: %s", (description) => {
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`)).toMatchObject({ owner: "station_operator", note: null });
  });

  it.each([
    ["wieża żelbetowa Emitel - SLR Mława / Szydłówek", "concrete_tower", "SLR Mława / Szydłówek"],
    ["wieża Emitela - RTCN Gołańcz / Chojna", "tower", "RTCN Gołańcz / Chojna"],
    ["maszt kratowy Emitel (RTCN Białystok / Krynice)", "lattice_tower", "(RTCN Białystok / Krynice)"],
    ["wieża SLR Emitel", "tower", "SLR Emitel"],
    ["wieża Emitel, SLR Zamość / Partyzantów", "tower", "SLR Zamość / Partyzantów"],
    ["wieża kratowa Emitel, Stacja Linii Radiowych", "lattice_tower", "Stacja Linii Radiowych"],
  ])("preserves the real radio-site name: %s", (description, type, note) => {
    expect(parseAddress(`ul. Dworcowa 35 - ${description}`)).toMatchObject({ type, owner: "emitel", note });
  });

  it("retains a school's name and number after the structural description", () => {
    expect(parseAddress("ul. W.Reymonta 36 - maszt na dachu budynku Szkoły Podstawowej nr 10")).toMatchObject({
      type: "rooftop_mast",
      note: "budynek Szkoły Podstawowej nr 10",
    });
  });

  it("does not remove structure words from a street name or unknown additional text", () => {
    expect(parseAddress("ul. Masztowa 35")).toMatchObject({ street: "ul. Masztowa 35", type: null, note: null });
    expect(parseAddress("ul. Masztowa 35 - dach budynku mieszkalnego - budynkowy system zasilania")).toMatchObject({
      street: "ul. Masztowa 35",
      note: "budynkowy system zasilania",
    });
  });

  it.each([null, "", "  "])("handles an empty address: %s", (address) => {
    expect(parseAddress(address)).toEqual({ street: null, description: null, placeHint: null, type: null, owner: null, note: null });
  });
});
