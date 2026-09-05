import {
  AirportTowerIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  Location01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import { fetchLocationDetail } from "@/features/admin/locations/api";
import { LocationPhotosSection } from "@/features/admin/locations/components/LocationPhotosSection";
import { useDeleteLocationMutation, usePatchLocationMutation } from "@/features/admin/locations/mutations";
import { LocationPicker } from "@/features/submissions/components/locationPicker";
import type { ProposedLocationForm } from "@/features/submissions/types";
import { useIsMobile } from "@/hooks/useMobile";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import { useScrolled } from "@/hooks/useScrolled";
import { showApiError } from "@/lib/api";
import { getOperatorColor } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

function AdminLocationDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("admin");

  const locationId = Number(id);

  const { data: location, isLoading } = useQuery({
    queryKey: ["admin", "location", id],
    queryFn: () => fetchLocationDetail(locationId),
    enabled: !!id && !Number.isNaN(locationId),
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-background px-4 py-2.5 flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-7 w-40 rounded-md" />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="w-full lg:flex-1">
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
            <div className="w-full lg:flex-1 space-y-3">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-60 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{t("common:error.description")}</p>
          <Button variant="outline" onClick={() => navigate({ to: "/admin/locations" })}>
            {t("common:actions.back")}
          </Button>
        </div>
      </div>
    );
  }

  return <LocationDetailForm key={location.id} location={location} />;
}

function LocationDetailForm({ location }: { location: NonNullable<ReturnType<typeof fetchLocationDetail> extends Promise<infer T> ? T : never> }) {
  const { t } = useTranslation("stations");
  const navigate = useNavigate();
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const isFloatingActionTarget = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isFloatingDesktopActionTarget = isFloatingActionTarget && !isMobile;

  const [locationForm, setLocationForm] = useState<ProposedLocationForm>(() => ({
    region_id: location.region?.id ?? null,
    city: location.city ?? "",
    address: location.address ?? "",
    longitude: location.longitude ?? null,
    latitude: location.latitude ?? null,
  }));

  const patchMutation = usePatchLocationMutation(location.id);
  const deleteMutation = useDeleteLocationMutation();

  const { ref: headerRef, scrolled } = useScrolled();

  const handleLocationChange = useCallback((patch: Partial<ProposedLocationForm>) => {
    setLocationForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = () => {
    if (hasGenericAddressMarker(locationForm.address)) {
      toast.error(t("toast.addressOwnWordForbidden"));
      return;
    }

    patchMutation.mutate(
      {
        region_id: locationForm.region_id,
        city: locationForm.city || null,
        address: locationForm.address || null,
        longitude: locationForm.longitude,
        latitude: locationForm.latitude,
      },
      {
        onSuccess: () => toast.success(t("toast.locationSaved")),
        onError: (error) => showApiError(error),
      },
    );
  };

  const handleRevert = () => {
    setLocationForm({
      region_id: location.region?.id ?? null,
      city: location.city ?? "",
      address: location.address ?? "",
      longitude: location.longitude ?? null,
      latitude: location.latitude ?? null,
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate(location.id, {
      onSuccess: () => {
        toast.success(t("toast.locationDeleted"));
        void navigate({ to: "/admin/locations" });
      },
      onError: (error) => {
        showApiError(error);
      },
    });
  };

  const hasChanges = useMemo(() => {
    if (locationForm.region_id !== (location.region?.id ?? null)) return true;
    if (locationForm.city !== (location.city ?? "")) return true;
    if (locationForm.address !== (location.address ?? "")) return true;
    if (locationForm.longitude !== (location.longitude ?? null)) return true;
    if (locationForm.latitude !== (location.latitude ?? null)) return true;
    return false;
  }, [locationForm, location]);

  useSaveShortcut({
    canSave: hasChanges && !patchMutation.isPending,
    onSave: handleSave,
  });

  const stations = useMemo(() => location.stations ?? [], [location]);

  const operatorColors = useMemo(() => {
    const seen = new Set<number>();
    const colors: string[] = [];
    for (const s of stations) {
      if (s.operator && !seen.has(s.operator.mnc)) {
        seen.add(s.operator.mnc);
        colors.push(getOperatorColor(s.operator.mnc));
      }
    }
    return colors;
  }, [stations]);

  const headerTopStyle = useMemo(() => {
    if (operatorColors.length === 0) return undefined;
    if (operatorColors.length === 1) return { backgroundColor: operatorColors[0] };
    const stops = operatorColors.map((color, i) => {
      const start = (i / operatorColors.length) * 100;
      const end = ((i + 1) / operatorColors.length) * 100;
      return `${color} ${start}%, ${color} ${end}%`;
    });
    return { background: `linear-gradient(to right, ${stops.join(", ")})` };
  }, [operatorColors]);

  const canDeleteLocation = stations.length === 0;
  const showChangeActions = !isFloatingActionTarget || isFloatingDesktopActionTarget || hasChanges || patchMutation.isPending;
  const hasFloatingActions = canDeleteLocation || showChangeActions || deleteMutation.isPending;

  const actionBar = (
    <div className="flex items-center gap-1">
      {canDeleteLocation && (
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" />}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
            {t("header.deleteLocation")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("header.confirmDeleteLocation")}</AlertDialogTitle>
              <AlertDialogDescription>{t("header.confirmDeleteLocationDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <Spinner /> : t("header.deleteLocation")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {showChangeActions ? (
        <>
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevert}
                disabled={!hasChanges}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                {t("common:actions.revert")}
              </Button>
            </TooltipTrigger>
            {!hasChanges && <TooltipContent>{t("common:actions.noChanges")}</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || patchMutation.isPending}
                className={cn("shadow-sm font-medium", !isFloatingActionTarget && "min-w-25 px-4")}
              >
                {patchMutation.isPending ? <Spinner /> : <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />}
                {t("common:actions.saveChanges")}
              </Button>
            </TooltipTrigger>
            {!hasChanges && <TooltipContent>{t("common:actions.noChanges")}</TooltipContent>}
          </Tooltip>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {headerTopStyle && <div className="shrink-0 h-0.75" style={headerTopStyle} />}
      <div
        ref={headerRef}
        className={cn(
          "shrink-0 border-b px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20 transition-[background-color,border-color,box-shadow] duration-150",
          scrolled ? "bg-background shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "bg-transparent border-transparent shadow-none",
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.history.back()}
          className="text-muted-foreground hover:text-foreground gap-2 pl-1 pr-3 -ml-2"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          <span className="font-medium">{t("common:actions.back")}</span>
        </Button>

        <div className="flex items-center gap-2.5 px-3 py-1.5 bg-secondary/30 rounded-full border border-border/40 shadow-[0_1px_2px_rgba(0,0,0,0.05)] min-w-0 overflow-hidden">
          <HugeiconsIcon icon={Location01Icon} className="size-3.5 text-muted-foreground shrink-0" />
          <span className="font-bold text-sm tracking-tight truncate min-w-0">{location.city || location.address || `#${location.id}`}</span>
          <div className="w-px h-3.5 bg-border/60 shrink-0" />
          <span className="text-xs font-mono text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded border border-border/20 truncate min-w-0">
            {location.id}
          </span>
        </div>
        {!navActionTarget && actionBar}
      </div>

      {navActionTarget && hasFloatingActions ? createPortal(actionBar, navActionTarget) : null}

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row gap-3 p-3">
          <div className="w-full lg:flex-1 space-y-2">
            <LocationPicker location={locationForm} onLocationChange={handleLocationChange} />
          </div>

          <div className="w-full lg:flex-1 space-y-2">
            <LocationPhotosSection locationId={location.id} />
            <div className="border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={AirportTowerIcon} className="size-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{t("stations:stationsAtLocation")}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {t("stations:stationsCount", { count: stations.length })}
                </Badge>
              </div>

              {stations.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("main:popup.noStations")}</div>
              ) : (
                <div className="divide-y">
                  {stations.map((station) => (
                    <Link
                      key={station.id}
                      to={"/admin/stations/$id"}
                      params={{ id: String(station.id) }}
                      search={{ uke: undefined }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                    >
                      {station.operator && (
                        <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(station.operator.mnc) }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{station.operator?.name ?? "-"}</span>
                          <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{station.station_id}</span>
                        </div>
                        {station.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{station.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {station.is_confirmed && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            ✓
                          </Badge>
                        )}
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/locations/$id")({
  component: AdminLocationDetailPage,
  staticData: {
    titleKey: "breadcrumbs.editLocation",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "breadcrumbs.admin", path: "/admin/locations", i18nNamespace: "admin" },
      { titleKey: "breadcrumbs.locations", path: "/admin/locations", i18nNamespace: "admin" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
