import { auditOperationListQuerySchema, auditOperationListSchema } from "@openbts/shared/contract";
import type { AuditOperationList, AuditOperationListQuery, Paging } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { assertAuditReach, countriesWithinReach, redactForReach } from "../../../../features/audit/access.js";
import { fetchAuditOperationPage, fetchReadableStations } from "../../../../features/audit/read.js";
import { toAuditOperation } from "../../../../features/audit/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { unique } from "../../../../lib/collections.js";

const schemaRoute = {
  summary: "List audit operations",
  description:
    "Returns audit operations, newest first by default. " +
    "The entries of each operation are not included, so get a single operation to see them.\n\n" +
    "Administrators get all operations. Maintainers only get operations whose `countryCode` is a country they maintain, " +
    "so operations without a `countryCode` are never returned to them. " +
    "For maintainers, `countryCodes` only narrows the list down, and a country they do not maintain returns nothing instead of an error.\n\n" +
    "`entities`, `actions`, `stationIds` and `q` are matched against the same entry, " +
    "so an operation is returned when one of its entries matches all of them. " +
    "Use either `cursor` or `offset`, not both.\n\n" +
    "With `include=stations`, each operation also has `stations`: the id, site id and operator of the stations in its `stationIds`, " +
    "as they are now. Stations that no longer exist and stations in countries you cannot access are left out, " +
    "and maintainers only get stations in the countries they maintain, so `stations` can be shorter than `stationIds`.",
  querystring: auditOperationListQuerySchema,
  response: {
    200: auditOperationListSchema,
  },
};
type ReqQuery = { Querystring: AuditOperationListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<AuditOperationList>>) {
  const reach = await assertAuditReach(req, "read");
  const { kinds, entities, actions, userIds, stationIds, createdAfter, createdBefore, q, sort, limit, cursor, offset, includeTotal } = req.query;

  const countryCodes = countriesWithinReach(reach, req.query.countryCodes);
  if (countryCodes?.length === 0) {
    if (includeTotal) return res.send({ data: [], paging: { limit, nextCursor: null, total: 0 } });
    return res.send({ data: [], paging: { limit, nextCursor: null } });
  }

  const page = await fetchAuditOperationPage(
    {
      kinds: kinds ?? [],
      entities: entities ?? [],
      ops: actions ?? [],
      userIds: userIds ?? [],
      stationIds: stationIds ?? [],
      from: createdAfter === undefined ? undefined : new Date(createdAfter),
      to: createdBefore === undefined ? undefined : new Date(createdBefore),
      query: q,
      countryCodes,
    },
    { sort, limit, cursor, offset, includeTotal },
  );

  const paging: Paging = { limit, nextCursor: page.nextCursor };
  if (page.total !== undefined) paging.total = page.total;

  const operations = page.data.map((operation) => toAuditOperation(redactForReach(reach, operation)));
  if (req.query.include?.includes("stations")) {
    const stationsById = await fetchReadableStations(req, reach, unique(operations.flatMap((operation) => operation.stationIds)));
    for (const operation of operations) operation.stations = operation.stationIds.flatMap((id) => stationsById.get(id) ?? []);
  }

  return res.send({ data: operations, paging });
}

const getAuditOperations: Route<ReqQuery, AuditOperationList> = {
  url: "/audit-operations",
  method: "GET",
  config: {
    permissionsCheckedByHandler: ["read:audit_operations"],
    errorReasons: { 403: "You are neither an administrator nor a maintainer." },
  },
  schema: schemaRoute,
  handler,
};

export default getAuditOperations;
