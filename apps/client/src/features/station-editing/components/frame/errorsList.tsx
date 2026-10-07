import { type StationDraftApi, useEditText } from "../../hooks/useStationDraft";
import { describeTarget } from "../../model/changes";
import type { EditError } from "../../model/types";
import { useEditPage } from "./editPage";
import { toEditTargetId } from "./editTargets";
import { cn } from "@/lib/utils";

type ErrorsListProps = {
  edit: StationDraftApi;
  errors: readonly EditError[];
  onPick: () => void;
  className?: string;
};

export type ErrorRowItem = {
  id: string;
  where: string;
  message: string;
  onPick?: () => void;
};

type ErrorRowsProps = {
  items: readonly ErrorRowItem[];
  className?: string;
};

const ROW_CLASS = "flex w-full gap-2.5 rounded-md px-2 py-1.5 text-left";
const ROW_BUTTON_CLASS = cn(
  "cursor-pointer outline-none transition-colors hover:bg-muted",
  "focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
);
const WHERE_CLASS = "w-[150px] shrink-0 text-xs leading-[18px] text-muted-foreground";
const MESSAGE_CLASS = "min-w-0 flex-1 text-[13px] leading-[18px] text-destructive wrap-anywhere";

export function ErrorRows({ items, className }: ErrorRowsProps) {
  return (
    <ul className={className}>
      {items.map((item) => {
        const row = (
          <>
            <span className={WHERE_CLASS}>{item.where}</span>
            <span className={MESSAGE_CLASS}>{item.message}</span>
          </>
        );

        return (
          <li key={item.id} className="border-t border-border/60 py-px">
            {item.onPick === undefined ? (
              <div className={ROW_CLASS}>{row}</div>
            ) : (
              <button type="button" onClick={item.onPick} className={cn(ROW_CLASS, ROW_BUTTON_CLASS)}>
                {row}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ErrorsList({ edit, errors, onPick, className }: ErrorsListProps) {
  const text = useEditText();
  const page = useEditPage();

  function pickError(error: EditError) {
    page.reveal(error.target);
    onPick();
  }

  const items = errors.map((error, position) => {
    const item: ErrorRowItem = {
      id: `${toEditTargetId(error.target)}:${error.messageKey}:${position}`,
      where: text.formatParts(describeTarget(error.target, edit.session.draft, edit.context)),
      message: text.formatError(error),
    };
    if (error.target.scope !== "general") item.onPick = () => pickError(error);
    return item;
  });

  return <ErrorRows items={items} className={className} />;
}
