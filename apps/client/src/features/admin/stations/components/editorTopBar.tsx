import { Add01Icon, Cancel01Icon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChangesChip } from "@/features/station-editing/components/frame/changesChip";
import { useEditPage } from "@/features/station-editing/components/frame/editPage";
import { ErrorsChip } from "@/features/station-editing/components/frame/errorsChip";
import {
  FLOATING_PRIMARY_CLASS,
  FLOATING_SURFACE_CLASS,
  TopBarActions,
  type TopBarPlacement,
  useTopBarPlacement,
} from "@/features/station-editing/components/frame/topBarActions";
import type { StationDraftApi } from "@/features/station-editing/hooks/useStationDraft";
import type { ChangeItem, FieldTarget } from "@/features/station-editing/model/types";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import { cn } from "@/lib/utils";

export type RevealField = (target: FieldTarget) => void;

type EditorTopBarProps = {
  edit: StationDraftApi;
  changes: readonly ChangeItem[];
  blockedSaves: number;
  isNewStation: boolean;
  isSaving: boolean;
  isLocked: boolean;
  onSave: (reveal: RevealField) => void;
  onRevert: () => void;
  onDeleteRequest?: () => void;
};

type ActionLabelProps = {
  placement: TopBarPlacement;
  text: string;
  phoneText?: string;
};

const PHONE_ICON_ONLY_CLASS = "max-md:sr-only";
const FLOATING_REVERT_CLASS = cn(FLOATING_SURFACE_CLASS, "max-md:disabled:opacity-100 max-md:disabled:text-muted-foreground/50");

function ActionLabel({ placement, text, phoneText }: ActionLabelProps) {
  if (placement === "header") return <span className={PHONE_ICON_ONLY_CLASS}>{text}</span>;
  if (placement !== "floating" || phoneText === undefined) return <span>{text}</span>;

  return (
    <>
      <span className="max-md:hidden">{text}</span>
      <span className="md:hidden">{phoneText}</span>
    </>
  );
}

export function EditorTopBar({
  edit,
  changes,
  blockedSaves,
  isNewStation,
  isSaving,
  isLocked,
  onSave,
  onRevert,
  onDeleteRequest,
}: EditorTopBarProps) {
  const { t } = useTranslation(["stations", "common"]);
  const placement = useTopBarPlacement();
  const { reveal } = useEditPage();
  const isFloating = placement === "floating";
  const hasChanges = changes.length > 0;
  const canSave = !isLocked && (isNewStation || hasChanges);
  const canRevert = !isLocked && hasChanges;

  useSaveShortcut({ canSave, onSave: () => onSave(reveal) });

  return (
    <TopBarActions>
      <ErrorsChip edit={edit} openRequest={blockedSaves} />
      <ChangesChip changes={changes} />
      {onDeleteRequest === undefined ? null : (
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDeleteRequest}
              disabled={isLocked || hasChanges}
              className={cn(
                "cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive",
                isFloating ? FLOATING_SURFACE_CLASS : null,
              )}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              <span className={placement === "inline" ? undefined : PHONE_ICON_ONLY_CLASS}>{t("header.deleteStation")}</span>
            </Button>
          </TooltipTrigger>
          {hasChanges ? <TooltipContent>{t("edit.editor.saveFirst")}</TooltipContent> : null}
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRevert}
            disabled={!canRevert}
            className={cn(
              "cursor-pointer text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
              isFloating ? FLOATING_REVERT_CLASS : null,
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            {isNewStation ? (
              <ActionLabel placement={placement} text={t("common:actions.clear")} />
            ) : (
              <ActionLabel placement={placement} text={t("common:actions.revert")} phoneText={t("edit.editor.revertShort")} />
            )}
          </Button>
        </TooltipTrigger>
        {hasChanges ? null : <TooltipContent>{t("common:actions.noChanges")}</TooltipContent>}
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Button
            type="button"
            size="sm"
            onClick={() => onSave(reveal)}
            disabled={!canSave}
            className={cn("cursor-pointer font-medium shadow-sm", isFloating ? FLOATING_PRIMARY_CLASS : "md:min-w-25 md:px-4")}
          >
            {isSaving ? <Spinner /> : <HugeiconsIcon icon={isNewStation ? Add01Icon : Tick02Icon} className="size-3.5" />}
            {isNewStation ? (
              <span className={cn(isFloating ? "hidden sm:inline" : null, placement === "header" ? PHONE_ICON_ONLY_CLASS : null)}>
                {t("common:actions.createStation")}
              </span>
            ) : (
              <ActionLabel placement={placement} text={t("common:actions.saveChanges")} phoneText={t("common:actions.save")} />
            )}
          </Button>
        </TooltipTrigger>
        {isNewStation || hasChanges ? null : <TooltipContent>{t("common:actions.noChanges")}</TooltipContent>}
      </Tooltip>
    </TopBarActions>
  );
}
