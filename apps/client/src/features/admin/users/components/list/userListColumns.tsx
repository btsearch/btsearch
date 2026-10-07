import { type CellContext, type SortingState, createColumnHelper } from "@tanstack/react-table";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_USER_LIST_SORT } from "../../constants";
import type { UserSort } from "../../types";
import { UserAccessSummary, UserEmail, UserIdentity, UserStatusSummary } from "./userListCells";
import type { UserListRow } from "./useUserListRows";
import { DataTableSortButton } from "@/components/ui/data-table-sort-button";
import { CreatedDate } from "@/features/admin/reference/components/shared/values";
import type { AppTableFeatures } from "@/lib/tableFeatures";

type UserListSortControl = {
  sort: UserSort;
  onSortChange: (sort: UserSort) => void;
};

type UserListCellProps = Pick<CellContext<AppTableFeatures, UserListRow, unknown>, "row">;

const NAME_COLUMN_ID = "name";
const CREATED_COLUMN_ID = "createdAt";
const columnHelper = createColumnHelper<AppTableFeatures, UserListRow>();

export const UserListSortContext = createContext<UserListSortControl | null>(null);

function useUserListSort(): UserListSortControl {
  const sortControl = useContext(UserListSortContext);
  if (sortControl === null) throw new Error("The user list headers must render inside UserListSortContext");
  return sortControl;
}

function UserHeader() {
  const { t } = useTranslation("admin");
  const { sort, onSortChange } = useUserListSort();
  const isActive = sort === "name";

  return (
    <div className="pl-2">
      <DataTableSortButton
        label={t("admin:users.list.columns.user")}
        isActive={isActive}
        isAscending
        onClick={() => onSortChange(isActive ? DEFAULT_USER_LIST_SORT : "name")}
      />
    </div>
  );
}

function EmailHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.email");
}

function AccessHeader() {
  const { t } = useTranslation("admin");
  return t("admin:users.detail.roles.title");
}

function StatusHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.status");
}

function CreatedHeader() {
  const { t } = useTranslation("common");
  const { sort, onSortChange } = useUserListSort();

  return (
    <DataTableSortButton
      label={t("common:labels.created")}
      isActive={sort !== "name"}
      isAscending={sort === "createdAt"}
      onClick={() => onSortChange(sort === "-createdAt" ? "createdAt" : "-createdAt")}
    />
  );
}

function UserCell({ row }: UserListCellProps) {
  return (
    <div className="pl-2">
      <UserIdentity row={row.original} />
    </div>
  );
}

function EmailCell({ row }: UserListCellProps) {
  return <UserEmail account={row.original.user.account} />;
}

function AccessCell({ row }: UserListCellProps) {
  return <UserAccessSummary row={row.original} />;
}

function StatusCell({ row }: UserListCellProps) {
  return <UserStatusSummary account={row.original.user.account} />;
}

function CreatedCell({ row }: UserListCellProps) {
  return <CreatedDate createdAt={row.original.user.account.createdAt} />;
}

export const USER_LIST_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: NAME_COLUMN_ID, size: 250, header: UserHeader, cell: UserCell }),
  columnHelper.display({ id: "email", size: 260, header: EmailHeader, cell: EmailCell }),
  columnHelper.display({ id: "access", size: 320, header: AccessHeader, cell: AccessCell }),
  columnHelper.display({ id: "status", size: 220, header: StatusHeader, cell: StatusCell }),
  columnHelper.display({ id: CREATED_COLUMN_ID, size: 110, header: CreatedHeader, cell: CreatedCell }),
]);

export const USER_LIST_SORTING: Record<UserSort, SortingState> = {
  name: [{ id: NAME_COLUMN_ID, desc: false }],
  createdAt: [{ id: CREATED_COLUMN_ID, desc: false }],
  "-createdAt": [{ id: CREATED_COLUMN_ID, desc: true }],
};
