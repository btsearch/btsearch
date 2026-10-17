import { describe, expect, it } from "vitest";

import getCellFromStation from "../../../../src/routes/v1/(get)/stations/[station_id]/cells/[id].js";
import { dbMock } from "../../../helpers/boundaries.js";
import { readCell, readDate, readStation } from "../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../helpers/routeHarness.js";

const band = { id: 3, rat: "LTE", code: "B3", name: "1800", value: 1800, duplex: "FDD", variant: "commercial" };
const { band_id: _bandId, ...cell } = readCell.cell;
const lte = { cell_id: cell.id, ...readCell.lte, createdAt: readDate, updatedAt: readDate };

describe("GET /stations/:station_id/cells/:cell_id", () => {
  it("answers with the cell, its band and its details", async () => {
    dbMock.query.stations.findFirst.mockResolvedValue(readStation);
    dbMock.query.cells.findFirst.mockResolvedValue({ ...cell, band, gsm: null, umts: null, lte, nr: null });
    const app = await createRouteHarness(getCellFromStation);

    const response = await app.inject({ method: "GET", url: "/stations/1/cells/1" });

    const timestamps = { createdAt: readDate.toISOString(), updatedAt: readDate.toISOString() };
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { ...cell, ...timestamps, band, details: { ...readCell.lte, ...timestamps } } });
  });
});
