import { createFileRoute } from "@tanstack/react-router";

import { CreateStationPage } from "@/features/admin/observation-flags/create-station/createStationPage";
import { isRecordId } from "@/lib/apiValues";

type CreateStationSearch = {
  flag?: number;
  latitude?: number;
  longitude?: number;
};

const LATITUDE_LIMIT = 90;
const LONGITUDE_LIMIT = 180;

function readRecordId(value: unknown): number | undefined {
  const id = Number(value);
  return isRecordId(id) ? id : undefined;
}

function parseCoordinate(value: unknown, limit: number): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : undefined;
}

function parseCreateStationSearch(search: Record<string, unknown>): CreateStationSearch {
  const latitude = parseCoordinate(search.latitude, LATITUDE_LIMIT);
  const longitude = parseCoordinate(search.longitude, LONGITUDE_LIMIT);
  const hasPoint = latitude !== undefined && longitude !== undefined;

  return {
    flag: readRecordId(search.flag),
    latitude: hasPoint ? latitude : undefined,
    longitude: hasPoint ? longitude : undefined,
  };
}

function CreateStationRoute() {
  const { id } = Route.useParams();
  const { flag, latitude, longitude } = Route.useSearch();

  return (
    <CreateStationPage
      key={`${id}-${flag ?? "site"}-${latitude ?? ""}-${longitude ?? ""}`}
      observedSiteId={readRecordId(id) ?? null}
      flagId={flag ?? null}
      pickedPoint={latitude === undefined || longitude === undefined ? null : { latitude, longitude }}
    />
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/observation-flags/sites/$id/station")({
  validateSearch: parseCreateStationSearch,
  component: CreateStationRoute,
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "observationFlags.createStation.title",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "sections.admin", i18nNamespace: "nav" },
      { titleKey: "items.observationFlags", path: "/admin/observation-flags", i18nNamespace: "nav" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
