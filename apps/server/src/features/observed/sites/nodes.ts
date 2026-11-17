/* oxlint-disable no-await-in-loop */
import { observedSites } from "@openbts/drizzle";
import { type SQL, and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import { chunks, unique } from "../../../lib/collections.js";
import type { DbClient, DbTx } from "../../../types/global.js";
import { ROWS_PER_QUERY } from "./moves.js";

const nodeSiteSchema = createSelectSchema(observedSites).pick({ id: true, plmn: true, rat: true, nodeId: true, place: true });

export type NodeSite = z.infer<typeof nodeSiteSchema>;
export type Node = Pick<NodeSite, "plmn" | "rat" | "nodeId">;
export type NodePlace = Omit<NodeSite, "id">;

export const NODE_SITE_COLUMNS = {
  id: observedSites.id,
  plmn: observedSites.plmn,
  rat: observedSites.rat,
  nodeId: observedSites.nodeId,
  place: observedSites.place,
};

export const isLiveNodeSite = and(isNull(observedSites.retiredAt), isNull(observedSites.stationId), inArray(observedSites.rat, ["LTE", "NR"]));

export function nodeKey({ plmn, rat, nodeId }: Node): string {
  return `${plmn}/${rat}/${nodeId}`;
}

export function placeKey(site: NodePlace): string {
  return `${nodeKey(site)}/${site.place}`;
}

export function isOfNodes(nodes: readonly Node[]): SQL | undefined {
  const networks = Map.groupBy(nodes, ({ plmn, rat }) => `${plmn}/${rat}`);
  return or(
    ...[...networks.values()].flatMap((onNetwork) => {
      const [first] = onNetwork;
      if (first === undefined || first.rat === null) return [];
      const nodeIds = unique(onNetwork.map((node) => node.nodeId));
      return [and(eq(observedSites.plmn, first.plmn), eq(observedSites.rat, first.rat), inArray(observedSites.nodeId, nodeIds))];
    }),
  );
}

async function selectLiveSitesOfNodes(tx: DbClient, nodes: readonly Node[], where?: SQL): Promise<Map<string, NodeSite[]>> {
  const wanted = [...new Map(nodes.map((node) => [nodeKey(node), node])).values()];
  const found = await Promise.all(
    chunks(wanted, ROWS_PER_QUERY).flatMap((part) => {
      const ofNodes = isOfNodes(part);
      return ofNodes === undefined
        ? []
        : [
            tx
              .select(NODE_SITE_COLUMNS)
              .from(observedSites)
              .where(and(isLiveNodeSite, ofNodes, where)),
          ];
    }),
  );
  return Map.groupBy(
    found.flat().toSorted((a, b) => a.place - b.place || a.id - b.id),
    nodeKey,
  );
}

export function findLiveSitesOfNodes(tx: DbClient, nodes: readonly Node[]): Promise<Map<string, NodeSite[]>> {
  return selectLiveSitesOfNodes(tx, nodes);
}

export function findPlacesOfNodes(tx: DbTx, nodes: readonly Node[]): Promise<Map<string, NodeSite[]>> {
  return selectLiveSitesOfNodes(tx, nodes, gt(observedSites.place, 0));
}

export async function findOrCreateNodeSites(tx: DbTx, wanted: readonly NodePlace[]): Promise<Map<string, number>> {
  const places = [...new Map(wanted.map((place) => [placeKey(place), place])).values()];
  const siteIdOf = new Map<string, number>();
  for (const part of chunks(places, ROWS_PER_QUERY)) {
    await tx
      .insert(observedSites)
      .values(part.map(({ plmn, rat, nodeId, place }) => ({ plmn, rat, nodeId, place })))
      .onConflictDoNothing({
        target: [observedSites.plmn, observedSites.rat, observedSites.nodeId, observedSites.place],
        where: isNull(observedSites.retiredAt),
      });
    const sites = await findLiveSitesOfNodes(tx, part);
    for (const site of [...sites.values()].flat()) siteIdOf.set(placeKey(site), site.id);
  }
  return siteIdOf;
}
