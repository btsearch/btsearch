import { z } from "zod/v4";

import {
  AT_LEAST_ONE_FIELD_ISSUE,
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  booleanQuerySchema,
  csvEnumSchema,
  csvIdsSchema,
  csvUuidsSchema,
  cursorSchema,
  hasAnyField,
  idSchema,
  limitSchema,
  offsetSchema,
  pagingSchema,
  userRefSchema,
  usesCursorOrOffset,
} from "./common.ts";

export const LIST_INCLUDES = ["owner", "operatorCounts", "items"] as const;
export type ListInclude = (typeof LIST_INCLUDES)[number];

export const LIST_OWNERS = ["mine", "all"] as const;
export type ListOwners = (typeof LIST_OWNERS)[number];

const listNameSchema = z.string().trim().min(1).max(100);
const listDescriptionSchema = z.string().trim().max(1000);
const itemIdsSchema = z.array(idSchema).max(1000);

const LIST_PUBLIC_NOTE =
  "A public list can be read and used as a `listId` filter by anyone who has its id, a private one only by its owner and administrators";
const LIST_NOTIFICATIONS_NOTE =
  "Whether the owner is notified about changes to the stations and official sites on the list, as if watching each of them";

export const listItemsSchema = z.object({
  stationIds: z.array(z.number().int()).describe("Ids of the stations on the list. Stations in countries you cannot access are omitted"),
  officialSiteIds: z.array(z.number().int()).describe("Ids of the sites in the official register that are on the list"),
  microwaveLinkIds: z.array(z.number().int()).describe("Ids of the microwave links in the official register that are on the list"),
});
export type ListItems = z.infer<typeof listItemsSchema>;

export const listItemCountsSchema = z.object({
  stations: z.number().int(),
  officialSites: z.number().int(),
  microwaveLinks: z.number().int(),
});

export const listOperatorCountSchema = z.object({
  operatorId: z.number().int(),
  count: z.number().int().describe("The number of stations and official sites on the list that belong to the operator"),
});
export type ListOperatorCount = z.infer<typeof listOperatorCountSchema>;

export const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isPublic: z.boolean().describe(LIST_PUBLIC_NOTE),
  isOwner: z.boolean().describe("Whether the list is yours"),
  notificationsEnabled: z.boolean().nullable().describe(`${LIST_NOTIFICATIONS_NOTE}. \`null\` unless the list is yours`),
  itemCounts: listItemCountsSchema.describe("The number of items of each kind on the list"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  owner: userRefSchema.optional().describe("Only returned with `include=owner`"),
  operatorCounts: z.array(listOperatorCountSchema).optional().describe("Only returned with `include=operatorCounts`"),
  items: listItemsSchema.optional().describe("Only returned with `include=items`"),
});
export type List = z.infer<typeof listSchema>;

export const listParamsSchema = z.object({ id: z.string().min(1).max(64) });

const listIncludeSchema = csvEnumSchema(LIST_INCLUDES);

export const listQuerySchema = z.object({ include: listIncludeSchema.optional() }).strict();
export type ListQuery = z.infer<typeof listQuerySchema>;

export const listListQuerySchema = z
  .object({
    owners: z
      .enum(LIST_OWNERS)
      .default("mine")
      .describe("`mine` returns your own lists. `all` returns the lists of all users and requires an administrator"),
    ownerIds: csvUuidsSchema
      .optional()
      .describe(
        "Filters by owner. Requires an administrator, like `owners=all`, and anyone else who sends it gets a 403. " +
          "Only allowed with `owners=all`. Comma-separated UUIDs",
      ),
    isPublic: booleanQuerySchema.optional().describe("`true` matches public lists, `false` matches private ones"),
    q: z.string().trim().min(1).max(100).optional().describe("Matches part of the list's name"),
    stationIds: csvIdsSchema.optional().describe("Only lists that contain at least one of these stations. Comma-separated ids"),
    officialSiteIds: csvIdsSchema
      .optional()
      .describe("Only lists that contain at least one of these sites in the official register. Comma-separated ids"),
    microwaveLinkIds: csvIdsSchema
      .optional()
      .describe("Only lists that contain at least one of these microwave links in the official register. Comma-separated ids"),
    include: listIncludeSchema.optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type ListListQuery = z.infer<typeof listListQuerySchema>;

export const listListSchema = z.object({
  data: z.array(listSchema),
  paging: pagingSchema,
});
export type ListList = z.infer<typeof listListSchema>;

const listItemsInputSchema = z
  .object({
    stationIds: itemIdsSchema.optional(),
    officialSiteIds: itemIdsSchema.optional().describe("Ids of sites in the official register"),
    microwaveLinkIds: itemIdsSchema.optional().describe("Ids of microwave links in the official register"),
  })
  .strict();
export type ListItemsInput = z.infer<typeof listItemsInputSchema>;

export const listCreateSchema = z
  .object({
    name: listNameSchema.describe("Must be unique among your lists"),
    description: listDescriptionSchema.nullable().optional(),
    isPublic: z.boolean().optional().describe(`${LIST_PUBLIC_NOTE}. Defaults to \`false\``),
    notificationsEnabled: z.boolean().optional().describe(`${LIST_NOTIFICATIONS_NOTE}. Defaults to \`false\``),
    items: listItemsInputSchema.optional().describe("The items to put on the list. Every id must exist"),
  })
  .strict();
export type ListCreate = z.infer<typeof listCreateSchema>;

const LIST_ITEM_KINDS = ["stationIds", "officialSiteIds", "microwaveLinkIds"] as const;

function addsAndRemovesSameItem(addItems: ListItemsInput | undefined, removeItems: ListItemsInput | undefined): boolean {
  if (!addItems || !removeItems) return false;

  return LIST_ITEM_KINDS.some((kind) => {
    const removed = new Set(removeItems[kind]);
    return (addItems[kind] ?? []).some((id) => removed.has(id));
  });
}

export const listUpdateSchema = z
  .object({
    name: listNameSchema.optional().describe("Must be unique among the owner's lists"),
    description: listDescriptionSchema.nullable().optional(),
    isPublic: z.boolean().optional().describe(LIST_PUBLIC_NOTE),
    notificationsEnabled: z.boolean().optional().describe(LIST_NOTIFICATIONS_NOTE),
    items: listItemsInputSchema
      .optional()
      .describe("Each list of ids you send replaces the stored one. Cannot be combined with `addItems` or `removeItems`"),
    addItems: listItemsInputSchema.optional().describe("Items to add to the list. Every id must exist. Cannot be combined with `items`"),
    removeItems: listItemsInputSchema
      .optional()
      .describe("Items to remove from the list. Ids that are not on the list are ignored. Cannot be combined with `items`"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine((patch) => patch.items === undefined || (patch.addItems === undefined && patch.removeItems === undefined), {
    path: ["items"],
    message: "items cannot be sent together with addItems or removeItems",
  })
  .refine((patch) => !addsAndRemovesSameItem(patch.addItems, patch.removeItems), {
    path: ["removeItems"],
    message: "An item cannot be added and removed in the same request",
  });
export type ListUpdate = z.infer<typeof listUpdateSchema>;
