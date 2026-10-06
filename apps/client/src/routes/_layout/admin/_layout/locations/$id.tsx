import {
  AirportTowerIcon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Delete02Icon,
  Location01Icon,
  LocationRemove01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { hasGenericAddressMarker } from "@openbts/shared/addressValidation";
import type { Location, LocationUpdate } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ForbiddenState } from "@/components/auth/requireRole";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
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
import { PageErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import { fetchLocationDetail } from "@/features/admin/locations/api";
import { LocationPhotosSection } from "@/features/admin/locations/components/LocationPhotosSection";
import { useDeleteLocationMutation, usePatchLocationMutation } from "@/features/admin/locations/mutations";
import { structureOwnersQueryOptions } from "@/features/admin/reference/api/structureOwners";
import { LocationStructureFields } from "@/features/shared/location/structureFields";
import { buildStructureOwnerOptions } from "@/features/shared/location/structureOwners";
import type { StructureDraft } from "@/features/shared/location/types";
import { brandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import type { LocationRecord } from "@/features/station-details/station/types";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { LocationPicker } from "@/features/station-editing/components/location/locationPicker";
import type { LocationPickerValue } from "@/features/station-editing/components/location/locationPicker";
import { normalizeText } from "@/features/station-editing/model/changes";
import { LocationStationList } from "@/features/stations/components/LocationStationList";
import { canEditPlace, useEditorArea } from "@/features/stations/list/data/editorArea";
import type { EditorArea } from "@/features/stations/list/data/editorArea";
import { useIsMobile } from "@/hooks/useMobile";
import { useSaveShortcut } from "@/hooks/useSaveShortcut";
import { useScrolled } from "@/hooks/useScrolled";
import { useSettledSession } from "@/hooks/useSettledSession";
import { ApiResponseError, showApiError } from "@/lib/api";
import { getOperatorColor } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

type LocationFormValues = LocationPickerValue & { structure: StructureDraft };

function toLocationFormValues(location: Location): LocationFormValues {
  return {
    regionId: location.regionId,
    city: location.city ?? "",
    address: location.address ?? "",
    longitude: location.longitude,
    latitude: location.latitude,
    structure: {
      type: location.structure.type,
      owner: location.structure.owner === null ? { kind: "unknown" } : { kind: "listed", ownerId: location.structure.owner.id },
      note: location.structure.note ?? "",
    },
  };
}

function getStructureOwnerId(owner: StructureDraft["owner"]): number | null {
  return owner.kind === "listed" ? owner.ownerId : null;
}

function buildLocationUpdate(form: LocationFormValues, location: Location): LocationUpdate {
  const changes: LocationUpdate = {};
  if (form.regionId !== null && form.regionId !== location.regionId) changes.regionId = form.regionId;
  if (form.city !== (location.city ?? "")) changes.city = form.city || null;
  if (form.address !== (location.address ?? "")) changes.address = form.address || null;
  if (form.latitude !== null && form.longitude !== null && (form.latitude !== location.latitude || form.longitude !== location.longitude)) {
    changes.latitude = form.latitude;
    changes.longitude = form.longitude;
  }

  const structure: NonNullable<LocationUpdate["structure"]> = {};
  if (form.structure.type !== location.structure.type) structure.type = form.structure.type;
  const ownerId = getStructureOwnerId(form.structure.owner);
  if (ownerId !== (location.structure.owner?.id ?? null)) structure.ownerId = ownerId;
  const note = form.structure.note.trim() || null;
  if (note !== location.structure.note) structure.note = note;
  if (Object.keys(structure).length > 0) changes.structure = structure;
  return changes;
}

function AdminLocationDetailPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation("admin");

  const locationId = Number(id);
  const { data: session } = useSettledSession();

  const {
    data: location,
    error,
    isLoading,
    isPaused,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["admin", "location", id, "v2", session?.user.id],
    queryFn: ({ signal }) => fetchLocationDetail(locationId, signal),
    enabled: !!session?.user.id && Number.isInteger(locationId) && locationId > 0,
  });
  const { area, isError: hasAreaFailed, isRetrying: isRetryingArea, retry: retryArea } = useEditorArea();

  if (hasAreaFailed) return <PageErrorState onRetry={retryArea} isRetrying={isRetryingArea} />;

  if (area === undefined || isLoading || (isPaused && !location)) {
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
    const isNotFound = !error || (error instanceof ApiResponseError && error.status === 404);
    const backButton = (
      <Button variant={isNotFound ? "default" : "outline"} nativeButton={false} render={<Link to="/admin/locations" />}>
        <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
        {t("common:actions.back")}
      </Button>
    );

    return isNotFound ? (
      <PageErrorState
        tone="neutral"
        icon={LocationRemove01Icon}
        title={t("stationDetails:page.locationNotFoundTitle")}
        description={t("stationDetails:page.locationNotFoundDescription")}
        action={backButton}
      />
    ) : (
      <PageErrorState
        title={t("stationDetails:page.locationUnavailableTitle")}
        description={t("common:error.tryLater")}
        onRetry={() => refetch()}
        isRetrying={isFetching}
        action={backButton}
      />
    );
  }

  if (!canEditPlace(area, { countryCode: location.countryCode, regionId: location.regionId })) return <ForbiddenState />;

  return <LocationDetailForm key={location.id} location={location} area={area} />;
}

function LocationDetailForm({ location, area }: { location: LocationRecord; area: EditorArea }) {
  const { t } = useTranslation("stations");
  const navigate = useNavigate();
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const isFloatingActionTarget = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isFloatingDesktopActionTarget = isFloatingActionTarget && !isMobile;

  const [locationForm, setLocationForm] = useState<LocationFormValues>(() => toLocationFormValues(location));

  const patchMutation = usePatchLocationMutation(location.id, location);
  const deleteMutation = useDeleteLocationMutation();
  const { data: owners = [] } = useQuery(structureOwnersQueryOptions());
  const { data: brands = [] } = useQuery(brandsQueryOptions());
  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: regions = [] } = useQuery(regionsQueryOptions());
  const countryCode = regions.find((region) => region.id === locationForm.regionId)?.countryCode ?? location.countryCode;
  const ownerOptions = buildStructureOwnerOptions({ owners, brands, operators, value: locationForm.structure.owner, countryCode, area });
  const changes = useMemo(() => buildLocationUpdate(locationForm, location), [locationForm, location]);

  const { ref: headerRef, scrolled } = useScrolled();

  const handleLocationChange = useCallback((patch: Partial<LocationFormValues>) => {
    setLocationForm((prev) => ({ ...prev, ...patch }));
  }, []);
  const handleStructureChange = useCallback((patch: Partial<StructureDraft>) => {
    setLocationForm((prev) => ({ ...prev, structure: { ...prev.structure, ...patch } }));
  }, []);

  const handleSave = () => {
    if (hasGenericAddressMarker(locationForm.address)) {
      toast.error(t("common:validation.addressOwnWordForbidden"));
      return;
    }

    patchMutation.mutate(changes, {
      onSuccess: (updated) => {
        setLocationForm(toLocationFormValues(updated));
        toast.success(t("toast.locationSaved"));
      },
      onError: (error) => showApiError(error),
    });
  };

  const handleRevert = () => {
    setLocationForm(toLocationFormValues(location));
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
    const saved = toLocationFormValues(location);
    return (
      locationForm.regionId !== saved.regionId ||
      locationForm.city !== saved.city ||
      locationForm.address !== saved.address ||
      locationForm.longitude !== saved.longitude ||
      locationForm.latitude !== saved.latitude ||
      locationForm.structure.type !== saved.structure.type ||
      getStructureOwnerId(locationForm.structure.owner) !== getStructureOwnerId(saved.structure.owner) ||
      locationForm.structure.note !== saved.structure.note
    );
  }, [locationForm, location]);
  const coordinatesChanged = locationForm.latitude !== location.latitude || locationForm.longitude !== location.longitude;
  const hasIncompleteCoordinates = coordinatesChanged && (locationForm.latitude === null || locationForm.longitude === null);
  const hasMissingRegion = locationForm.regionId !== location.regionId && locationForm.regionId === null;
  const canSave = Object.keys(changes).length > 0 && !hasIncompleteCoordinates && !hasMissingRegion && !patchMutation.isPending;

  useSaveShortcut({
    canSave,
    onSave: handleSave,
  });

  const stations = useMemo(() => location.stations ?? [], [location]);

  const operatorColors = useMemo(() => {
    const seen = new Set<number>();
    const colors: string[] = [];
    for (const station of stations) {
      const mnc = toV1OperatorMnc(station.operator);
      if (mnc !== null && !seen.has(mnc)) {
        seen.add(mnc);
        colors.push(getOperatorColor(mnc));
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
                disabled={!hasChanges || patchMutation.isPending}
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
                disabled={!canSave}
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
            <LocationPicker
              value={locationForm}
              onChange={handleLocationChange}
              countryCode={countryCode}
              isDisabled={patchMutation.isPending}
              fieldLooks={{
                latitude: { tone: coordinatesChanged ? "changed" : "plain" },
                longitude: { tone: coordinatesChanged ? "changed" : "plain" },
                region: { tone: locationForm.regionId !== location.regionId ? "changed" : "plain" },
                city: { tone: normalizeText(locationForm.city) !== normalizeText(location.city ?? "") ? "changed" : "plain" },
                address: { tone: normalizeText(locationForm.address) !== normalizeText(location.address ?? "") ? "changed" : "plain" },
              }}
            >
              <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
                <LocationStructureFields
                  value={locationForm.structure}
                  onChange={handleStructureChange}
                  ownerOptions={ownerOptions}
                  isDisabled={patchMutation.isPending}
                  presentations={{
                    type: { tone: changes.structure?.type === undefined ? "plain" : "changed" },
                    owner: { tone: changes.structure?.ownerId === undefined ? "plain" : "changed" },
                    note: { tone: changes.structure?.note === undefined ? "plain" : "changed" },
                  }}
                />
              </div>
            </LocationPicker>
          </div>

          <div className="w-full lg:flex-1 space-y-2">
            <LocationPhotosSection locationId={location.id} />
            <div className="border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={AirportTowerIcon} className="size-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{t("stationDetails:page.stationsAtLocation")}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {t("common:labels.stations", { count: stations.length })}
                </Badge>
              </div>

              <LocationStationList
                stations={stations}
                renderLink={(station, linkProps) => (
                  <Link to="/admin/stations/$id" params={{ id: String(station.id) }} search={{ uke: undefined }} {...linkProps} />
                )}
              />
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
      { titleKey: "sections.admin", path: "/admin/locations", i18nNamespace: "nav" },
      { titleKey: "items.locations", path: "/admin/locations", i18nNamespace: "nav" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
