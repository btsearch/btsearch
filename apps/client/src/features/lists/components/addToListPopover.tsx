import { Add01Icon, AirportTowerIcon, SignalFull02Icon, TaskDaily01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserListSummary } from "@/features/lists/api";
import { updateList } from "@/features/lists/api";
import { useUserLists } from "@/features/lists/hooks/useUserLists";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/authClient";
import { cn } from "@/lib/utils";

const CreateListDialog = lazy(() => import("./createListDialog").then((m) => ({ default: m.CreateListDialog })));

type ListContentProps = {
  isLoading: boolean;
  lists: UserListSummary[];
  isPending: boolean;
  pendingUuid: string | undefined;
  handleToggle: (list: UserListSummary) => void;
  isChecked: (list: UserListSummary) => boolean;
};

function ListContent({ isLoading, lists, isPending, pendingUuid, handleToggle, isChecked }: ListContentProps) {
  const { t } = useTranslation("lists");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-5">
        <Spinner className="size-4" />
      </div>
    );
  }
  if (lists.length === 0) {
    return <p className="px-3 py-3 text-xs text-muted-foreground text-center">{t("noLists")}</p>;
  }
  return lists.map((list) => {
    const checked = isChecked(list);
    const isToggling = isPending && pendingUuid === list.uuid;
    return (
      <button
        key={list.uuid}
        type="button"
        onClick={() => handleToggle(list)}
        disabled={isPending}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
          "hover:bg-muted/60 disabled:opacity-60",
          checked && "bg-primary/5",
        )}
      >
        {isToggling ? <Spinner className="size-4 shrink-0" /> : <Checkbox checked={checked} tabIndex={-1} className="shrink-0 pointer-events-none" />}
        <span className={cn("text-xs truncate leading-none", checked ? "font-medium text-foreground" : "text-foreground/80")}>{list.name}</span>
      </button>
    );
  });
}

type AddToListPopoverProps = {
  stationId?: number;
  radiolineIds?: number[];
  ukeLocationId?: number;
  size?: "sm" | "md";
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
  showTooltip?: boolean;
};

export function AddToListPopover(props: AddToListPopoverProps) {
  const { data: session } = authClient.useSession();
  const { data: settings } = useSettings();

  if (!session?.user || !settings?.enableUserLists) return null;

  return <AddToListPopoverInner {...props} />;
}

function AddToListPopoverInner({
  stationId,
  radiolineIds,
  ukeLocationId,
  size = "sm",
  className,
  showLabel = false,
  labelClassName,
  showTooltip = true,
}: AddToListPopoverProps) {
  const { t } = useTranslation(["lists", "common"]);
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { data, isLoading } = useUserLists();
  const [createOpen, setCreateOpen] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: ({ uuid, data }: { uuid: string; data: { stations?: { internal: number[]; uke: number[] }; radiolines?: number[] } }) =>
      updateList(uuid, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-lists"] });
      toast.success(t("lists:updated"));
    },
    onError: () => {
      toast.error(t("common:errors.generic", "Something went wrong"));
    },
  });

  function handleToggle(list: UserListSummary) {
    if (stationId) {
      const inList = list.stations.internal.includes(stationId);
      const internal = inList ? list.stations.internal.filter((id) => id !== stationId) : [...list.stations.internal, stationId];
      toggleMutation.mutate({ uuid: list.uuid, data: { stations: { internal, uke: list.stations.uke } } });
    } else if (ukeLocationId) {
      const inList = list.stations.uke.includes(ukeLocationId);
      const uke = inList ? list.stations.uke.filter((id) => id !== ukeLocationId) : [...list.stations.uke, ukeLocationId];
      toggleMutation.mutate({ uuid: list.uuid, data: { stations: { internal: list.stations.internal, uke } } });
    } else if (radiolineIds) {
      const radiolineSet = new Set(radiolineIds);
      const allInList = radiolineIds.every((id) => list.radiolines.includes(id));
      const radiolines = allInList ? list.radiolines.filter((id) => !radiolineSet.has(id)) : [...new Set([...list.radiolines, ...radiolineIds])];
      toggleMutation.mutate({ uuid: list.uuid, data: { radiolines } });
    }
  }

  function isChecked(list: UserListSummary) {
    if (stationId) return list.stations.internal.includes(stationId);
    if (ukeLocationId) return list.stations.uke.includes(ukeLocationId);
    if (radiolineIds) return radiolineIds.every((id) => list.radiolines.includes(id));
    return false;
  }

  const lists = useMemo(
    () => data?.pages.flatMap((p) => p.data).filter((l) => l.createdBy.uuid === session?.user?.id) ?? [],
    [data, session?.user?.id],
  );

  const icon = stationId || ukeLocationId ? AirportTowerIcon : SignalFull02Icon;
  const iconSize = size === "sm" ? "size-3" : "size-4";
  const buttonPadding = size === "sm" ? "p-0.5" : "p-1.5";
  const label = t("lists:addToList");
  const triggerButton = (
    <button
      type="button"
      className={cn(buttonPadding, "hover:bg-muted rounded transition-colors cursor-pointer shrink-0", className)}
      aria-label={label}
    />
  );
  const triggerContent = (
    <>
      <HugeiconsIcon icon={TaskDaily01Icon} className={cn(iconSize, "text-muted-foreground")} />
      {showLabel ? <span className={labelClassName}>{label}</span> : null}
    </>
  );

  return (
    <>
      <Popover>
        {showTooltip ? (
          <Tooltip>
            <TooltipTrigger render={<PopoverTrigger render={triggerButton} onClick={(event: React.MouseEvent) => event.stopPropagation()} />}>
              {triggerContent}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger render={triggerButton} onClick={(event: React.MouseEvent) => event.stopPropagation()}>
            {triggerContent}
          </PopoverTrigger>
        )}

        <PopoverContent align="end" className="w-60 p-0 gap-0 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-muted/30">
            <HugeiconsIcon icon={icon} className="size-3 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-foreground leading-none">{label}</span>
          </div>

          <div>
            <ListContent
              isLoading={isLoading}
              lists={lists}
              isPending={toggleMutation.isPending}
              pendingUuid={toggleMutation.variables?.uuid}
              handleToggle={handleToggle}
              isChecked={isChecked}
            />
          </div>

          <div className="border-t border-border/60">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-3 shrink-0" />
              {t("lists:createNew")}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {createOpen ? (
        <Suspense>
          <CreateListDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            initialStationId={stationId}
            initialRadiolineIds={radiolineIds}
            initialUkeLocationId={ukeLocationId}
          />
        </Suspense>
      ) : null}
    </>
  );
}
