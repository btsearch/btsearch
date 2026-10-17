import { adminRole, editorRole } from "../../src/plugins/auth/permissions.js";
import { authBoundary, dbMock, userSession } from "./boundaries.js";

type RunDatasetPart = { runId: string; datasetId: number; datasetKey: string; error: string | null };
type RunChangePart = { runId: string; datasetId: number | null; slice: string | null; kind: string; changes: number };
type RemapPart = { runId: string; licenseeId: number; fromOperatorId: number | null; toOperatorId: number | null };
type RunParts = { datasets?: RunDatasetPart[]; heldRunIds?: string[]; changes?: RunChangePart[]; remaps?: RemapPart[] };

const ROLES = { admin: adminRole, editor: editorRole };
const queuedAt = new Date("2026-10-12T08:00:00.000Z");

export const STAFF_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const RUN_ID = "0199d000-0000-7000-8000-000000000001";
export const OTHER_RUN_ID = "0199d000-0000-7000-8000-000000000002";
export const RELEASE_SHA256 = "ab".repeat(32);

const requesterRow = { id: STAFF_ID, username: "staff", name: "Staff Member", image: null };

export const sourceRow = {
  id: 1,
  key: "test-register",
  countryCode: "PL",
  shortName: "REG",
  authority: "Test Register Authority",
  homepageUrl: "https://register.invalid",
  licence: "CC BY 4.0",
  attribution: "Source: Test Register Authority",
  coverageNote: null,
  isRedistributable: true,
  isEnabled: true,
  isVisible: true,
  createdAt: queuedAt,
  updatedAt: queuedAt,
};

export const datasetRow = {
  id: 11,
  sourceId: 1,
  key: "permits",
  layer: "sites",
  isEnabled: true,
  checkEveryHours: 6,
  nextCheckAt: new Date("2026-10-12T12:00:00.000Z"),
  holdShrinkPercent: null,
  createdAt: queuedAt,
  updatedAt: queuedAt,
};

export const runRow = {
  id: RUN_ID,
  sourceId: 1,
  kind: "import",
  trigger: "manual",
  isDryRun: false,
  state: "queued",
  error: null,
  claimToken: null,
  attempt: 0,
  requestedById: STAFF_ID,
  claimedAt: null,
  heartbeatAt: null,
  startedAt: null,
  finishedAt: null,
  createdAt: queuedAt,
};

export const licenseeRow = { id: 5, name: "Example Mobile", full_name: "Example Mobile S.A.", brandId: null, sourceId: 1, operatorId: null };

export function signInAs(role: keyof typeof ROLES) {
  const session = userSession(STAFF_ID, role);
  authBoundary.getCurrentUser.mockResolvedValue(session);
  authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => {
    const { permissions } = (input as { body: { permissions: Parameters<typeof adminRole.authorize>[0] } }).body;
    return ROLES[role].authorize(permissions);
  });

  return { session, runAuth: true };
}

export function scriptRunParts(run: Pick<typeof runRow, "id" | "kind" | "requestedById">, parts: RunParts = {}) {
  dbMock.enqueueFor("select", "official.import_run_datasets", parts.datasets ?? []);
  dbMock.enqueueFor(
    "select",
    "official.import_run_slices",
    (parts.heldRunIds ?? []).map((runId) => ({ runId })),
  );
  dbMock.enqueueFor("select", "official.import_changes", parts.changes ?? []);
  if (run.requestedById !== null) dbMock.enqueueFor("select", "users", [requesterRow]);
  if (run.kind === "remap") dbMock.enqueueFor("select", "official.remap_runs", parts.remaps ?? []);
}

export function scriptStoredRun(run: typeof runRow = runRow, parts: RunParts = {}) {
  dbMock.enqueueFor("select", "official.import_runs", [{ run, sourceKey: sourceRow.key }]);
  scriptRunParts(run, parts);
}
