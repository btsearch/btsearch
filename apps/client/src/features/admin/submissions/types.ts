import type { Operator, Submission, SubmissionAction, SubmissionStatus } from "@openbts/shared/contract";

import type { BrandLook } from "@/components/cellular/brandMark";
import type { CellOperation } from "@/features/submissions/types";

export type SubmissionRowStatus = "pending" | "approved" | "rejected";
type SubmissionRowType = "new" | "update" | "delete";

type SubmissionUser = {
  id: string;
  name: string;
  image: string | null;
  username: string | null;
};

export type SubmissionListRow = Pick<Submission, "id" | "countryCode" | "createdAt" | "reviewedAt"> & {
  status: SubmissionRowStatus;
  type: SubmissionRowType;
  siteId: string | null;
  operatorId: number | null;
  submitter: SubmissionUser | null;
  cells: { operation: CellOperation }[];
};

export type SubmissionOperatorOption = Pick<Operator, "id" | "name"> & { brand: BrandLook | null };

export type SubmissionStatusFilter = "all" | SubmissionStatus;
export type SubmissionTypeFilter = "all" | SubmissionAction;

export type SubmissionListFilters = {
  status: SubmissionStatusFilter;
  type: SubmissionTypeFilter;
  submitterIds: string[];
  countryCodes: string[];
  operatorIds: number[];
  regionIds: number[];
};
