import { z } from "zod/v4";

import { ErrorResponse } from "../errors.js";

const offsetCursorSchema = z.object({ offset: z.number().int().min(0) });

function invalidCursor(): ErrorResponse {
  return new ErrorResponse("INVALID_QUERY", { message: "Invalid cursor" });
}

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw invalidCursor();
  }
}

export function resolveOffset(query: { cursor?: string; offset?: number }, deepestOffset = Number.POSITIVE_INFINITY): number {
  if (query.cursor === undefined) return query.offset ?? 0;

  const { offset } = decodeCursor(query.cursor, offsetCursorSchema);
  if (offset > deepestOffset) throw invalidCursor();
  return offset;
}
