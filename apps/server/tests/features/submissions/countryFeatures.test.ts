import type { CountryFeatures, SubmissionCreate } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { toSingleSubmission, toSubmissionUpdateInput } from "../../../src/features/submissions/translate.js";
import { dbMock } from "../../helpers/boundaries.js";

const ownerCountry: CountryFeatures = { structureOwnerProposals: true, psc: true, bsic: false };
const closedCountry: CountryFeatures = { structureOwnerProposals: false, psc: false, bsic: true };

function submission(ownerName?: string): SubmissionCreate {
  return {
    action: "create",
    station: { siteId: "site-1", operatorId: 1 },
    location: { regionId: 2, latitude: 52, longitude: 21, structure: ownerName === undefined ? undefined : { ownerName } },
  };
}

function enqueueNewPlacement(features: CountryFeatures, withBand = false) {
  dbMock.enqueueFor("select", "operators", [{ id: 1 }]);
  dbMock.enqueueFor("select", "regions", [{ id: 2 }]);
  if (withBand) dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
  dbMock.enqueueCountryFeatures("countries", [{ ...features }]);
}

function enqueueOwner(existing?: { id: number }) {
  dbMock.enqueueFor("select", "regions", [{ countryCode: "DE" }]);
  dbMock.enqueueFor("select", "structure_owners", existing === undefined ? [] : [existing]);
}

describe("toSingleSubmission", () => {
  it("accepts a new owner name in the destination country", async () => {
    enqueueNewPlacement(ownerCountry);
    enqueueOwner();

    const translated = await toSingleSubmission(submission("New owner"));

    expect(translated.location).toMatchObject({ region_id: 2, structure_owner_id: null, structure_owner_name: "New owner" });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("rejects a new owner name when that country disables proposals", async () => {
    enqueueNewPlacement(closedCountry);
    enqueueOwner();

    await expect(toSingleSubmission(submission("New owner"))).rejects.toThrow("Structure owner proposals are disabled");
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("allows selecting an existing owner while new proposals are disabled", async () => {
    enqueueNewPlacement(closedCountry);
    enqueueOwner({ id: 7 });

    const translated = await toSingleSubmission(submission("Existing owner"));

    expect(translated.location).toMatchObject({ structure_owner_id: 7 });
    expect(translated.location?.structure_owner_name).toBeUndefined();
  });

  it("accepts PSC in its enabled country independently of BSIC", async () => {
    enqueueNewPlacement(ownerCountry, true);
    const body: SubmissionCreate = {
      ...submission(),
      cells: [{ action: "create", rat: "umts", bandId: 1, lac: 100, rnc: 1, cid: 1, uarfcn: 10564, psc: 73 }],
    };

    expect((await toSingleSubmission(body)).cells?.[0]?.details).toMatchObject({ psc: 73 });
  });

  it("rejects PSC in its disabled country independently of BSIC", async () => {
    enqueueNewPlacement(closedCountry, true);
    const body: SubmissionCreate = {
      ...submission(),
      cells: [{ action: "create", rat: "umts", bandId: 1, lac: 100, rnc: 1, cid: 1, uarfcn: 10564, psc: 73 }],
    };

    await expect(toSingleSubmission(body)).rejects.toThrow("psc is not kept in this country");
  });
});

describe("toSubmissionUpdateInput", () => {
  it("uses the pending station placement when a partial update omits its country fields", async () => {
    dbMock.enqueueSubmissionPlacement([{ regionId: 2, operatorId: 1 }]);
    dbMock.enqueueCountryFeatures("countries", [{ ...ownerCountry }]);
    enqueueOwner();

    const translated = await toSubmissionUpdateInput(
      null,
      { location: { structure: { ownerName: "New owner" } } },
      { submissionId: "11111111-1111-4111-8111-111111111111" },
    );

    expect(translated.location).toMatchObject({ region_id: 2, structure_owner_name: "New owner" });
    expect(dbMock.pendingResults()).toBe(0);
  });
});
