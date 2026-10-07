import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  DetailedErrorResponse,
  type ErrorCode,
  ErrorResponse,
  MALFORMED_MULTIPART_MESSAGE,
  ValidationError,
  callerFaultResponse,
  errors,
  isStillReferenced,
} from "../src/errors.js";

function databaseError(code: string, query = "insert into records values (1)"): postgres.PostgresError {
  const Constructor = postgres.PostgresError as unknown as new (data: { code: string; message: string; query: string }) => postgres.PostgresError;
  return new Constructor({ code, message: "Database refused the request", query });
}

describe("ErrorResponse", () => {
  it.each(Object.keys(errors) as ErrorCode[])("preserves the documented %s status and message", (code) => {
    expect(new ErrorResponse(code)).toMatchObject({ code, ...errors[code], name: "ErrorResponse" });
  });
  it("preserves a caller-specific message and the original error cause", () => {
    const cause = new Error("database unavailable");
    expect(new ErrorResponse("FAILED_TO_CREATE", { message: "Creation failed", cause })).toMatchObject({
      code: "FAILED_TO_CREATE",
      statusCode: 500,
      message: "Creation failed",
      cause,
    });
  });
  it("uses the documented message for an empty override", () => {
    expect(new ErrorResponse("NOT_FOUND", { message: "" }).message).toBe(errors.NOT_FOUND.message);
  });
});

describe("ValidationError", () => {
  it("retains field errors in a 400 validation response", () => {
    const details = [{ field: "name", validationMessage: "Required" }];
    expect(new ValidationError(details)).toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400, details });
  });
  it("allows an empty details collection", () => {
    expect(new ValidationError([]).details).toEqual([]);
  });
});

describe("DetailedErrorResponse", () => {
  it("retains domain-specific missing-record details", () => {
    const details = [{ field: "stationIds", ids: [3, 7] }];
    expect(new DetailedErrorResponse("BAD_REQUEST", details, { message: "Missing items" })).toMatchObject({
      statusCode: 400,
      details,
      message: "Missing items",
    });
  });
});

describe("isStillReferenced", () => {
  it.each([
    ["23001", "insert into records values(1)", true],
    ["23503", "delete from records", true],
    ["23503", " \n DELETE from records", true],
    ["23503", "insert into records values(1)", false],
    ["23503", "update records set parent_id = 1", false],
    ["23505", "delete from records", false],
  ])("classifies constraint %s during %s", (code, query, expected) => {
    expect(isStillReferenced(databaseError(code, query))).toBe(expected);
  });
});

describe("callerFaultResponse", () => {
  it.each([
    ["22003", "BAD_REQUEST", 400, "out of range"],
    ["22008", "BAD_REQUEST", 400, "out of range"],
    ["22001", "BAD_REQUEST", 400, "too long"],
    ["22007", "BAD_REQUEST", 400, "not valid"],
    ["22021", "BAD_REQUEST", 400, "not valid"],
    ["22P02", "BAD_REQUEST", 400, "not valid"],
    ["23514", "BAD_REQUEST", 400, "not valid"],
    ["23503", "BAD_REQUEST", 400, "does not exist"],
    ["23505", "DUPLICATE_ENTRY", 409, "already exists"],
    ["23001", "CONFLICT", 409, "other records still use"],
  ])("translates database constraint %s into the documented caller error", (constraint, code, statusCode, message) => {
    const cause = new ErrorResponse("FAILED_TO_CREATE", { cause: new Error("query failed", { cause: databaseError(constraint) }) });
    const fault = callerFaultResponse(cause);
    expect(fault).toMatchObject({ code, statusCode, cause });
    expect(fault?.message).toContain(message);
  });
  it("reports a foreign key violation on deletion as a conflict", () => {
    expect(callerFaultResponse(databaseError("23503", "delete from stations"))).toMatchObject({ code: "CONFLICT", statusCode: 409 });
  });
  it.each(["40001", "40P01", "08006"])("leaves infrastructure failure %s as a server error", (code) => {
    expect(callerFaultResponse(databaseError(code))).toBeNull();
  });
  it("preserves explicit domain failures even when their cause is a constraint error", () => {
    expect(callerFaultResponse(new ErrorResponse("FORBIDDEN", { cause: databaseError("23505") }))).toBeNull();
    expect(
      callerFaultResponse(new ErrorResponse("FAILED_TO_CREATE", { message: "The remote service refused creation", cause: databaseError("23505") })),
    ).toBeNull();
  });
  it.each(["Multipart: Boundary not found", "Unexpected end of multipart data"])("classifies malformed upload error %s as bad input", (message) => {
    expect(callerFaultResponse(new Error("upload failed", { cause: new Error(message) }))).toMatchObject({
      code: "BAD_REQUEST",
      statusCode: 400,
      message: MALFORMED_MULTIPART_MESSAGE,
    });
  });
  it("preserves Fastify caller errors through wrapper causes", () => {
    const parserError = Object.assign(new Error("Payload is too large"), { name: "FastifyError", statusCode: 413 });
    expect(callerFaultResponse(new Error("wrapped", { cause: parserError }))).toBe(parserError);
  });
  it.each([null, undefined, "23505", {}, new Error("unrelated failure")])("does not infer a caller fault from %s", (error) => {
    expect(callerFaultResponse(error)).toBeNull();
  });
  it("bounds malformed recursive error causes", () => {
    const cyclic = new Error("cyclic");
    cyclic.cause = cyclic;
    expect(callerFaultResponse(cyclic)).toBeNull();
  });
});
