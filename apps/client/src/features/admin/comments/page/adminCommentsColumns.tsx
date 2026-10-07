import type { Comment } from "@openbts/shared/contract";
import { type CellContext, type SortingState, createColumnHelper } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { CommentStatusBadge } from "../components/commentStatusBadge";
import { useAdminCommentActions } from "./adminCommentActions";
import { CommentAttachments, CommentAuthor, CommentCreated, CommentRowActions, CommentStationLink, CommentTextPreview } from "./adminCommentsCells";
import type { AdminCommentsSort } from "./commentsSearch";
import { DataTableSortButton } from "@/components/ui/data-table-sort-button";
import type { AppTableFeatures } from "@/lib/tableFeatures";

type AdminCommentCellProps = Pick<CellContext<AppTableFeatures, Comment, unknown>, "row">;

const CREATED_COLUMN_ID = "createdAt";
const columnHelper = createColumnHelper<AppTableFeatures, Comment>();

function AuthorHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.author");
}

function StationHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.station");
}

function ContentHeader() {
  const { t } = useTranslation("admin");
  return t("admin:comments.table.content");
}

function AttachmentsHeader() {
  const { t } = useTranslation("admin");
  return t("admin:comments.table.attachments");
}

function StatusHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.status");
}

function CreatedHeader() {
  const { t } = useTranslation("common");
  const { sort, onSortChange } = useAdminCommentActions();

  return (
    <DataTableSortButton
      label={t("common:labels.created")}
      isActive
      isAscending={sort === "createdAt"}
      onClick={() => onSortChange(sort === "-createdAt" ? "createdAt" : "-createdAt")}
    />
  );
}

function AuthorCell({ row }: AdminCommentCellProps) {
  return <CommentAuthor author={row.original.author} />;
}

function StationCell({ row }: AdminCommentCellProps) {
  return <CommentStationLink comment={row.original} />;
}

function ContentCell({ row }: AdminCommentCellProps) {
  return <CommentTextPreview content={row.original.content} />;
}

function AttachmentsCell({ row }: AdminCommentCellProps) {
  return <CommentAttachments comment={row.original} />;
}

function StatusCell({ row }: AdminCommentCellProps) {
  return <CommentStatusBadge status={row.original.status} />;
}

function CreatedCell({ row }: AdminCommentCellProps) {
  return <CommentCreated createdAt={row.original.createdAt} />;
}

function ActionsCell({ row }: AdminCommentCellProps) {
  return <CommentRowActions comment={row.original} />;
}

export const ADMIN_COMMENTS_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: "author", size: 180, header: AuthorHeader, cell: AuthorCell }),
  columnHelper.display({ id: "station", size: 160, header: StationHeader, cell: StationCell }),
  columnHelper.display({ id: "content", size: 300, header: ContentHeader, cell: ContentCell }),
  columnHelper.display({ id: "attachments", size: 176, header: AttachmentsHeader, cell: AttachmentsCell }),
  columnHelper.display({ id: "status", size: 110, header: StatusHeader, cell: StatusCell }),
  columnHelper.display({ id: CREATED_COLUMN_ID, size: 120, header: CreatedHeader, cell: CreatedCell }),
  columnHelper.display({ id: "actions", size: 190, cell: ActionsCell }),
]);

export const ADMIN_COMMENTS_SORTING: Record<AdminCommentsSort, SortingState> = {
  createdAt: [{ id: CREATED_COLUMN_ID, desc: false }],
  "-createdAt": [{ id: CREATED_COLUMN_ID, desc: true }],
};
