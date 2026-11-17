import { describe, expect, it, vi } from "vitest";

import { matchCellsNow } from "../../../../src/features/observed/cells/matching.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { scriptMatcherLocks } from "../../../helpers/observedFixtures.js";

const PLUS = "26001";
const NCI = 0x123456 * 4096 + 5;

const mocked = vi.hoisted(() => ({ runCellPass: vi.fn(), splitSitesByStations: vi.fn(), matchCellsAsSystem: vi.fn() }));
vi.mock("../../../../src/features/observed/flags/cells/pass.js", () => ({
  runCellPass: mocked.runCellPass,
  passEditedCells: vi.fn(),
  passFlagsOfGoneObservations: vi.fn(),
}));
vi.mock("../../../../src/features/observed/sites/splits/stations.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  splitSitesByStations: mocked.splitSitesByStations,
}));
vi.mock("../../../../src/features/analyzer/match.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  matchCellsAsSystem: mocked.matchCellsAsSystem,
  findNetworkOperators: vi.fn(async () => new Map()),
}));

function nrCell(id: number, observedSiteId: number) {
  return { id, plmn: PLUS, rat: "NR", cellKey: NCI + id, observedSiteId };
}

function scriptBatch(locked: unknown[], estimates: unknown[]): void {
  scriptMatcherLocks(2);
  dbMock.enqueueFor("select", "observed_cells", locked);
  dbMock.enqueueFor("delete", "match_queue", []);
  dbMock.enqueueFor("select", "observed_cell_values", []);
  dbMock.enqueueFor("select", "site_estimates", estimates, []);
  dbMock.enqueueFor("select", "cell_matches", [], []);
  dbMock.enqueueFor("select", "site_links", [], []);
}

describe("a matched batch", () => {
  it("gives the matcher the point of a cell's site only while the site's estimate is consistent", async () => {
    mocked.matchCellsAsSystem.mockResolvedValue([]);
    mocked.splitSitesByStations.mockResolvedValue([]);
    scriptBatch(
      [nrCell(1, 5), nrCell(2, 6), nrCell(3, 7)],
      [
        { observedSiteId: 5, point: { x: 19.93, y: 50.06 }, isConsistent: false },
        { observedSiteId: 6, point: { x: 20.01, y: 50.07 }, isConsistent: true },
      ],
    );

    await matchCellsNow([1, 2, 3]);

    expect(mocked.matchCellsAsSystem).toHaveBeenCalledWith(expect.any(Array), [null, { latitude: 50.07, longitude: 20.01 }, null]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("runs the cell pass over the sites the split by our stations created or moved cells to, as well as its own", async () => {
    mocked.matchCellsAsSystem.mockResolvedValue([]);
    mocked.splitSitesByStations.mockResolvedValue([5, 903, 904]);
    scriptBatch([nrCell(1, 5)], []);
    dbMock.enqueueFor("select", "cell_matches", []);
    dbMock.enqueueFor("select", "observed_cells", []);

    await matchCellsNow([1]);

    expect(mocked.splitSitesByStations).toHaveBeenCalledWith(dbMock, [5]);
    expect(mocked.runCellPass).toHaveBeenCalledWith({ cellIds: [], observedSiteIds: [5, 903, 904] });
    expect(dbMock.pendingResults()).toBe(0);
  });
});
