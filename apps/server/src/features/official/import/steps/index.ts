import type { AfterStep } from "../types.js";
import { kmz } from "./kmz.js";
import { links } from "./links.js";
import { orphans } from "./orphans.js";
import { prune } from "./prune.js";
import { publish } from "./publish.js";
import { push } from "./push.js";
import { siteNotifications } from "./siteNotifications.js";
import { stationNotifications } from "./stationNotifications.js";
import { statistics } from "./statistics.js";
import { unlistedPermits } from "./unlistedPermits.js";

export const afterSteps: readonly AfterStep[] = [
  unlistedPermits,
  siteNotifications,
  links,
  stationNotifications,
  orphans,
  statistics,
  push,
  kmz,
  publish,
  prune,
];
