import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import type { OGListRenderRequest } from "../../../src/features/ogImages/contract.js";
import { renderListImage } from "../../../src/features/ogImages/listImage.js";

const vectorLogoFile = "11111111-1111-4111-8111-111111111111.svg";
const missingLogoFile = "22222222-2222-4222-8222-222222222222.webp";
const list: OGListRenderRequest = {
  version: 1,
  kind: "list",
  id: "k3VQ8xZr1PmT2a",
  name: "Stacje z pasmem n78 w województwie zachodniopomorskim i lubuskim do sprawdzenia po wakacjach",
  ownerUsername: "antenowy",
  stationCount: 158,
  microwaveLinkCount: 6,
  operators: [
    { name: "Orange", count: 52, color: "#F59E0B", logoFile: vectorLogoFile },
    { name: "Play", count: 41, color: "#8549CE", logoFile: missingLogoFile },
    { name: "T-Mobile", count: 38, color: "#E2007A", logoFile: null },
    { name: "An operator whose name is far too long for one legend entry", count: 27, color: "#24B570", logoFile: null },
  ],
  otherOperators: { count: 3, stationCount: 22 },
};

let uploadsPath: string | undefined;

async function render(request: OGListRenderRequest) {
  uploadsPath = await mkdtemp(join(tmpdir(), "list-image-"));
  await writeFile(
    join(uploadsPath, vectorLogoFile),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90000 90000"><path d="M0 0h90000v90000H0z"/></svg>',
  );
  const siteLogo = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#ffffff" } })
    .png()
    .toBuffer();

  const image = await renderListImage(request, { siteLogo: { buffer: siteLogo, height: 64 }, uploadsPath, timeoutSeconds: () => 10 });
  return sharp(image).metadata();
}

afterEach(async () => {
  if (uploadsPath) await rm(uploadsPath, { recursive: true, force: true });
  uploadsPath = undefined;
});

describe("renderListImage", () => {
  it("draws a list with a long name, a huge vector logo and a missing logo file", async () => {
    const image = await render(list);

    expect(image).toMatchObject({ format: "png", width: 1200, height: 630 });
  });

  it("draws an empty list without an owner", async () => {
    const image = await render({
      ...list,
      name: "Do odwiedzenia",
      ownerUsername: null,
      stationCount: 0,
      microwaveLinkCount: 0,
      operators: [],
      otherOperators: null,
    });

    expect(image).toMatchObject({ format: "png", width: 1200, height: 630 });
  });
});
