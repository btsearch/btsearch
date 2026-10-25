import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { type FlagRow, serializeFlags } from "../../../../src/features/observed/flags/serialize.js";
import { toObservedSite } from "../../../../src/features/observed/sites/serialize.js";
import { logger } from "../../../../src/utils/logger.js";
import { bandFlagRow, listedFlag, pciFlagRow } from "../../../helpers/flagFixtures.js";
import { siteRecord } from "../../../helpers/siteRecordFixtures.js";

const loader = vi.hoisted(() => ({ loadSitesSeenBy: vi.fn() }));
vi.mock("../../../../src/features/observed/sites/read.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadSitesSeenBy: loader.loadSitesSeenBy,
}));

const req = {} as FastifyRequest;

describe("include=observedSite on flags", () => {
  it("answers a flag's site as you may see it, leaves it out when you may not, and is null for a flag without a site", async () => {
    loader.loadSitesSeenBy.mockResolvedValue(new Map([[9205, toObservedSite(siteRecord({ id: 9205 }))]]));
    const rows = [listedFlag(pciFlagRow), listedFlag({ ...pciFlagRow, id: 4102, observedSiteId: 9206 }), listedFlag(bandFlagRow)];

    const flags = await serializeFlags(req, rows as unknown as FlagRow[], ["observedSite"]);

    expect(flags.map((flag) => ("observedSite" in flag ? (flag.observedSite?.id ?? null) : "left out"))).toEqual([9205, "left out", null]);
    expect(loader.loadSitesSeenBy).toHaveBeenCalledWith(req, [9205, 9206]);
  });
});

describe("an untrustedContributor flag", () => {
  it("names the person at the top and expands them in its evidence", async () => {
    const person = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "kacper.w", name: "Kacper", image: null };
    const contributorRow = {
      ...pciFlagRow,
      id: 4401,
      kind: "untrustedContributor",
      subjectKey: `user:${person.id}`,
      observedSiteId: null,
      observedCellId: null,
      stationId: null,
      cellId: null,
      userId: person.id,
      evidence: { agreement: 0.52, everyoneAgreement: 0.91, readings: 412 },
      suggestion: null,
      measure: { deviceIds: [] },
    };
    const flags = await serializeFlags(req, [listedFlag(contributorRow, { person })] as unknown as FlagRow[]);

    expect(flags).toMatchObject([{ id: 4401, userId: person.id, evidence: { user: person, agreement: 0.52, readings: 412 } }]);
  });
});

describe("a stored flag that no longer reads", () => {
  function warningsAbout(id: number) {
    return vi.mocked(logger.warn).mock.calls.filter(([, details]) => (details as { id?: number } | undefined)?.id === id);
  }

  it("is answered without its suggestion when only the suggestion no longer reads, and logged once", async () => {
    const stale = { ...pciFlagRow, id: 4301, suggestion: { values: { pci: 301 } } };
    const flags = await serializeFlags(req, [listedFlag(stale), listedFlag(stale)] as unknown as FlagRow[]);

    expect(flags).toMatchObject([
      { id: 4301, evidence: { observed: 301 }, suggestion: null },
      { id: 4301, suggestion: null },
    ]);
    expect(warningsAbout(4301).map(([event]) => event)).toEqual(["observations.flags.unreadable_suggestion"]);
  });

  it("is left out when its evidence no longer reads either, and the rest of the list is answered", async () => {
    const unreadable = { ...pciFlagRow, id: 4302, evidence: { pci: 301 } };
    const flags = await serializeFlags(req, [listedFlag(unreadable), listedFlag(pciFlagRow)] as unknown as FlagRow[]);

    expect(flags.map((flag) => flag.id)).toEqual([4101]);
    expect(warningsAbout(4302).map(([event]) => event)).toEqual(["observations.flags.unreadable_evidence"]);
  });
});
