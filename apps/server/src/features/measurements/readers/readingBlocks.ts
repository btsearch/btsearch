import { deviceModels, readerVersions, readingBlocks, socs, users } from "@openbts/drizzle";
import type { MeasurementReadingBlock, MeasurementReadingBlockCreate, MeasurementReadingBlockUpdate } from "@openbts/shared/contract";
import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../../database/psql.js";
import { ErrorResponse, ValidationError } from "../../../errors.js";
import { actorIdFromRequest } from "../../access/access.js";
import { runAuditedOperation, standaloneAuditContext } from "../../audit/index.js";
import { CONTRACT_RATS, DATABASE_RATS } from "../../stations/serialize.js";
import { toUserRef } from "../../users/userRef.js";
import { queueRefold } from "../engineRuns.js";

const readingBlockSelectSchema = createSelectSchema(readingBlocks);
type ReadingBlockRow = z.infer<typeof readingBlockSelectSchema>;
type Phones = MeasurementReadingBlockCreate["phones"];

function phonesOf(row: ReadingBlockRow): Phones {
  if (row.modemFamily !== null) return { modemFamily: row.modemFamily };
  if (row.socId !== null) return { socId: row.socId };
  if (row.deviceModelId !== null) return { deviceModelId: row.deviceModelId };
  if (row.readerVersionId !== null) return { readerVersionId: row.readerVersionId };
  throw new Error(`reading block ${row.id} names no phones`);
}

function selectReadingBlocks() {
  const disabler = alias(users, "disabler");
  return db
    .select({
      block: readingBlocks,
      creator: { id: users.id, username: users.username, name: users.name, image: users.image },
      disabler: { id: disabler.id, username: disabler.username, name: disabler.name, image: disabler.image },
    })
    .from(readingBlocks)
    .leftJoin(users, eq(users.id, readingBlocks.createdById))
    .leftJoin(disabler, eq(disabler.id, readingBlocks.disabledById));
}

function toReadingBlock({ block, creator, disabler }: Awaited<ReturnType<typeof selectReadingBlocks>>[number]): MeasurementReadingBlock {
  return {
    id: block.id,
    phones: phonesOf(block),
    technologies: block.rats === null ? null : block.rats.flatMap((rat) => CONTRACT_RATS[rat] ?? []),
    roles: block.roles,
    sdkIntMin: block.sdkIntMin,
    sdkIntMax: block.sdkIntMax,
    radioVersionPrefix: block.radioVersionPrefix,
    fields: block.fields,
    mode: block.mode,
    reason: block.reason,
    createdBy: creator === null ? null : toUserRef(creator),
    createdAt: block.createdAt.toISOString(),
    isEnabled: block.disabledAt === null,
    disabledBy: disabler === null ? null : toUserRef(disabler),
    disabledAt: block.disabledAt?.toISOString() ?? null,
  };
}

export async function listReadingBlocks(): Promise<MeasurementReadingBlock[]> {
  const rows = await selectReadingBlocks().orderBy(asc(readingBlocks.id));
  return rows.map(toReadingBlock);
}

async function findReadingBlock(id: number): Promise<MeasurementReadingBlock> {
  const [row] = await selectReadingBlocks().where(eq(readingBlocks.id, id)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  return toReadingBlock(row);
}

async function phonesExist(phones: Phones): Promise<boolean> {
  if ("socId" in phones) return (await db.$count(socs, eq(socs.id, phones.socId))) > 0;
  if ("deviceModelId" in phones) return (await db.$count(deviceModels, eq(deviceModels.id, phones.deviceModelId))) > 0;
  if ("readerVersionId" in phones) return (await db.$count(readerVersions, eq(readerVersions.id, phones.readerVersionId))) > 0;
  return true;
}

export async function createReadingBlock(req: FastifyRequest, body: MeasurementReadingBlockCreate): Promise<MeasurementReadingBlock> {
  if (!(await phonesExist(body.phones))) throw new ValidationError([{ field: "phones", validationMessage: "Nothing has this id" }]);
  const id = await runAuditedOperation(standaloneAuditContext(req), { kind: "observations.reading_block_create" }, async (tx, audit) => {
    const [created] = await tx
      .insert(readingBlocks)
      .values({
        ...body.phones,
        rats: body.technologies?.map((technology) => DATABASE_RATS[technology]) ?? null,
        roles: body.roles ?? null,
        sdkIntMin: body.sdkIntMin ?? null,
        sdkIntMax: body.sdkIntMax ?? null,
        radioVersionPrefix: body.radioVersionPrefix ?? null,
        fields: body.fields ?? null,
        mode: body.mode,
        reason: body.reason,
        createdById: actorIdFromRequest(req),
      })
      .returning();
    if (!created) throw new ErrorResponse("FAILED_TO_CREATE");
    await audit.log({ entity: "reading_blocks", op: "create", recordId: created.id, new: created });
    if (body.refold) await queueRefold(tx, { readingBlockId: created.id });
    return created.id;
  });
  return findReadingBlock(id);
}

export async function updateReadingBlock(req: FastifyRequest, id: number, change: MeasurementReadingBlockUpdate): Promise<MeasurementReadingBlock> {
  const spec = { kind: "observations.reading_block_update", allowEmpty: change.refold === true } as const;
  await runAuditedOperation(standaloneAuditContext(req), spec, async (tx, audit) => {
    const [existing] = await tx.select().from(readingBlocks).where(eq(readingBlocks.id, id)).limit(1).for("update");
    if (!existing) throw new ErrorResponse("NOT_FOUND");

    const isEnabledChanged = change.isEnabled !== undefined && change.isEnabled !== (existing.disabledAt === null);
    const isReasonChanged = change.reason !== undefined && change.reason !== existing.reason;
    if (isEnabledChanged || isReasonChanged) {
      const disabled = change.isEnabled
        ? { disabledAt: null, disabledById: null }
        : { disabledAt: sql`now()`, disabledById: actorIdFromRequest(req) };
      const [updated] = await tx
        .update(readingBlocks)
        .set({ ...(isReasonChanged ? { reason: change.reason } : {}), ...(isEnabledChanged ? disabled : {}) })
        .where(eq(readingBlocks.id, id))
        .returning();
      await audit.log({ entity: "reading_blocks", op: "update", recordId: id, old: existing, new: updated });
    }
    if (change.refold === true) await queueRefold(tx, { readingBlockId: id });
  });
  return findReadingBlock(id);
}
