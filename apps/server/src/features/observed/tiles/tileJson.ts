import { CELL_RATS, UNKNOWN_BAND } from "@openbts/shared/contract";
import type { CoverageTileQuery, MyTrailTileQuery, TileJson, TrailTileQuery } from "@openbts/shared/contract";

import { baseUrl } from "../../../config.js";
import { APP_NAME } from "../../../constants.js";
import { COVERAGE_MIN_ZOOM, PERSON_TRAIL_MAX_ZOOM, TILE_JSON_MAX_ZOOM, TRAIL_MIN_ZOOM } from "./vectorTiles.js";

export type TileAudience = "public" | "staff";

type TileQuery = [name: string, values: readonly (string | number)[] | undefined][];

const ATTRIBUTION = `© ${APP_NAME} contributors, ODbL`;
const RAT_FIELD = "String: gsm, umts, lte or nr";
const SAMPLES_FIELD = "Number: capped at 100";
const LAST_SEEN_FIELD = "String: the last day it was measured, as YYYY-MM-DD";

const TRAIL_FIELDS = {
  operatorId: "Number: the operator whose network served",
  rat: RAT_FIELD,
  bandId: "Number: the band of the country's band plan that holds the channel. Missing when no single band of the plan holds it",
  level: "Number: 0 to 7, the 10-dB bucket that 90 % of the samples reach or beat. 0 is below -120 dBm and 7 is -60 dBm and above",
  samples: SAMPLES_FIELD,
  lastSeenOn: LAST_SEEN_FIELD,
};

const MY_TRAIL_FIELDS = {
  plmn: "String: the network code your phone read",
  operatorId: "Number: the operator of that network. Missing when the database does not know the network",
  rat: RAT_FIELD,
  samples: SAMPLES_FIELD,
  lastSeenOn: LAST_SEEN_FIELD,
};

const COVERAGE_FIELDS = {
  observedCellId: "Number: the cell that served most here, or with the most samples where none served. Also the feature id",
  level: "Number: 0 to 7, the 10-dB bucket that 90 % of that cell's samples reach or beat, from their mean and spread",
  sinr: "Number: 0 to 5, that cell's SINR in 5-dB buckets worked out the same way, from below 0 dB to 20 dB and above. Missing where no reading had one",
  servingShare: "Number: 0 to 1, that cell's share of the requested cells' serving weight here",
  samples: "Number: that cell's samples here, capped at 100",
  cellCount: "Number: how many of the requested cells were measured here",
  lastSeenOn: "String: the last day that cell was measured here, as YYYY-MM-DD",
};

function sortedIds(ids: readonly number[]): number[] {
  return [...new Set(ids)].toSorted((a, b) => a - b);
}

function sortedRats(rats: TrailTileQuery["rats"]): string[] | undefined {
  return rats ? CELL_RATS.filter((rat) => rats.includes(rat)) : undefined;
}

function tileAddress(path: string, query: TileQuery): string {
  const parts = query.flatMap(([name, values]) => (values === undefined ? [] : [`${name}=${values.join(",")}`]));
  return `${baseUrl}/api/v2/${path}/{z}/{x}/{y}?${parts.join("&")}`;
}

function tileJsonOf(
  name: string,
  path: string,
  query: TileQuery,
  zooms: Pick<TileJson, "minzoom" | "maxzoom">,
  layer: TileJson["vector_layers"][number],
): TileJson {
  return { tilejson: "3.0.0", name, attribution: ATTRIBUTION, tiles: [tileAddress(path, query)], ...zooms, vector_layers: [layer] };
}

export function trailTileJson(query: TrailTileQuery, audience: TileAudience): TileJson {
  const bandIds = query.bandIds
    ? [
        ...sortedIds(query.bandIds.filter((band): band is number => band !== UNKNOWN_BAND)),
        ...(query.bandIds.includes(UNKNOWN_BAND) ? [UNKNOWN_BAND] : []),
      ]
    : undefined;
  return tileJsonOf(
    audience === "public" ? "Trails" : "Trails with every country",
    audience === "public" ? "observed/trails" : "observed/trails/staff",
    [
      ["operatorIds", sortedIds(query.operatorIds)],
      ["rats", sortedRats(query.rats)],
      ["bandIds", bandIds],
    ],
    { minzoom: TRAIL_MIN_ZOOM, maxzoom: TILE_JSON_MAX_ZOOM },
    { id: "trails", fields: TRAIL_FIELDS },
  );
}

export function myTrailTileJson(query: MyTrailTileQuery): TileJson {
  return tileJsonOf(
    "Your trails",
    "observed/trails/mine",
    [
      ["operatorIds", query.operatorIds ? sortedIds(query.operatorIds) : undefined],
      ["rats", sortedRats(query.rats)],
    ],
    { minzoom: TRAIL_MIN_ZOOM, maxzoom: PERSON_TRAIL_MAX_ZOOM },
    { id: "trails", fields: MY_TRAIL_FIELDS },
  );
}

export function coverageTileJson(query: CoverageTileQuery, audience: TileAudience): TileJson {
  return tileJsonOf(
    audience === "public" ? "Coverage" : "Coverage for editors",
    audience === "public" ? "observed/coverage" : "observed/coverage/staff",
    [["observedCellIds", sortedIds(query.observedCellIds)]],
    { minzoom: COVERAGE_MIN_ZOOM, maxzoom: TILE_JSON_MAX_ZOOM },
    { id: "coverage", fields: COVERAGE_FIELDS },
  );
}
