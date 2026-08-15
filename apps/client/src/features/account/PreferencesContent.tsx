import { AppleIcon, GoogleMapsIcon, InformationCircleIcon, ShieldUserIcon, WazeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSX } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type PushPreferences, fetchPushPreferences, updatePushPreferences } from "@/features/notifications/api";
import { usePushSubscription } from "@/features/notifications/usePushSubscription";
import { OpenStreetMapIcon, OrganicMapsIcon, OsmAndIcon } from "@/features/station-details/components/navLinks";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { type PreferenceProfile, type UserPreferences, usePreferences } from "@/hooks/usePreferences";
import { authClient } from "@/lib/authClient";
import { cn, toggleValue } from "@/lib/utils";

const PRIVILEGED_ROLES = new Set(["admin", "editor"]);

type RadioOption = { value: string; labelKey: string; descKey?: string; example?: string };
type NavIconComponent = (props: { className?: string }) => JSX.Element;
const hugeIcon = (icon: typeof GoogleMapsIcon): NavIconComponent =>
  function NavHugeIcon({ className }) {
    return <HugeiconsIcon icon={icon} className={className} />;
  };

type CheckboxGroupOption = { value: string; labelKey: string; icon?: NavIconComponent };

type RadioPref = {
  type: "radio";
  key: keyof UserPreferences;
  labelKey: string;
  hintKey: string;
  options: RadioOption[];
};

type CheckboxGroupPref = {
  type: "checkbox-group";
  key: keyof UserPreferences;
  labelKey: string;
  hintKey: string;
  options: CheckboxGroupOption[];
};

type CheckboxPref = {
  type: "checkbox";
  key: keyof UserPreferences;
  labelKey: string;
  hintKey: string;
  itemLabelKey: string;
};

type SliderPref = {
  type: "slider";
  key: keyof UserPreferences;
  labelKey: string;
  hintKey: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
};

type PreferenceItem = RadioPref | CheckboxGroupPref | CheckboxPref | SliderPref;

type PreferenceCard = { items: PreferenceItem[]; noteKey?: string; desktopOnly?: boolean };

type PreferenceGroup = {
  titleKey: string;
  cards: PreferenceCard[];
};

type CloudPreferencesControls = ReturnType<typeof usePreferences>["cloud"];

function getVisiblePreferenceCards(group: PreferenceGroup, profile: PreferenceProfile): PreferenceCard[] {
  return group.cards.filter((card) => profile === "desktop" || card.desktopOnly !== true);
}

function isPreferenceProfile(value: string): value is PreferenceProfile {
  return value === "desktop" || value === "mobile";
}

const GROUPS: PreferenceGroup[] = [
  {
    titleKey: "preferences.groupNavigation",
    cards: [
      {
        items: [
          {
            type: "radio",
            key: "navMode",
            labelKey: "preferences.navMode",
            hintKey: "preferences.navModeHint",
            options: [
              { value: "sidebar", labelKey: "preferences.navModeSidebar", descKey: "preferences.navModeSidebarDesc" },
              { value: "floating", labelKey: "preferences.navModeFloating", descKey: "preferences.navModeFloatingDesc" },
            ],
          },
        ],
      },
      {
        items: [
          {
            type: "radio",
            key: "gpsFormat",
            labelKey: "preferences.gpsFormat",
            hintKey: "preferences.gpsFormatHint",
            options: [
              { value: "decimal", labelKey: "preferences.gpsDecimal", example: "52.23157, 21.00672" },
              { value: "dms", labelKey: "preferences.gpsDms", example: "52°13'53.7\"N 21°00'24.2\"E" },
            ],
          },
        ],
      },
      {
        items: [
          {
            type: "checkbox-group",
            key: "navigationApps",
            labelKey: "preferences.navigationApps",
            hintKey: "preferences.navigationAppsHint",
            options: [
              { value: "google-maps", labelKey: "preferences.navGoogleMaps", icon: hugeIcon(GoogleMapsIcon) },
              { value: "apple-maps", labelKey: "preferences.navAppleMaps", icon: hugeIcon(AppleIcon) },
              { value: "waze", labelKey: "preferences.navWaze", icon: hugeIcon(WazeIcon) },
              { value: "osmand", labelKey: "preferences.navOsmAnd", icon: OsmAndIcon },
              { value: "organic-maps", labelKey: "preferences.navOrganicMaps", icon: OrganicMapsIcon },
              { value: "openstreetmap", labelKey: "preferences.navOpenStreetMap", icon: OpenStreetMapIcon },
            ],
          },
        ],
      },
      {
        items: [
          {
            type: "radio",
            key: "navLinksDisplay",
            labelKey: "preferences.navDisplayMode",
            hintKey: "preferences.navDisplayModeHint",
            options: [
              { value: "inline", labelKey: "preferences.navDisplayInline", descKey: "preferences.navDisplayInlineDesc" },
              { value: "buttons", labelKey: "preferences.navDisplayButtons", descKey: "preferences.navDisplayButtonsDesc" },
            ],
          },
        ],
      },
      {
        items: [
          {
            type: "checkbox",
            key: "showStationPhotoPanel",
            labelKey: "preferences.stationPhotoPanel",
            hintKey: "preferences.stationPhotoPanelHint",
            itemLabelKey: "preferences.stationPhotoPanelLabel",
          },
        ],
      },
      {
        items: [
          {
            type: "checkbox",
            key: "showElevation",
            labelKey: "preferences.showElevation",
            hintKey: "preferences.showElevationHint",
            itemLabelKey: "preferences.showElevationLabel",
          },
        ],
      },
    ],
  },
  {
    titleKey: "preferences.groupMap",
    cards: [
      {
        items: [
          {
            type: "slider",
            key: "mapStationsLimit",
            labelKey: "preferences.mapStationsLimit",
            hintKey: "preferences.mapStationsLimitHint",
            min: 10,
            max: 1000,
            step: 10,
          },
        ],
      },
      {
        items: [
          {
            type: "slider",
            key: "radiolinesMinZoom",
            labelKey: "preferences.radiolinesMinZoom",
            hintKey: "preferences.radiolinesMinZoomHint",
            min: 7,
            max: 11,
            step: 0.1,
            format: (v) => v.toFixed(1),
          },
          {
            type: "slider",
            key: "mapRadiolinesLimit",
            labelKey: "preferences.mapRadiolinesLimit",
            hintKey: "preferences.mapRadiolinesLimitHint",
            min: 10,
            max: 1000,
            step: 10,
          },
        ],
      },
      {
        items: [
          {
            type: "checkbox",
            key: "showMapHoverTooltip",
            labelKey: "preferences.mapHoverTooltip",
            hintKey: "preferences.mapHoverTooltipHint",
            itemLabelKey: "preferences.mapHoverTooltipLabel",
          },
        ],
      },
      {
        items: [
          {
            type: "checkbox",
            key: "allowMultipleMapPopups",
            labelKey: "preferences.allowMultipleMapPopups",
            hintKey: "preferences.allowMultipleMapPopupsHint",
            itemLabelKey: "preferences.allowMultipleMapPopupsLabel",
          },
          {
            type: "checkbox",
            key: "closeMapPopupsOnMapClick",
            labelKey: "preferences.closeMapPopupsOnMapClick",
            hintKey: "preferences.closeMapPopupsOnMapClickHint",
            itemLabelKey: "preferences.closeMapPopupsOnMapClickLabel",
          },
        ],
      },
      {
        desktopOnly: true,
        items: [
          {
            type: "checkbox",
            key: "hideFiltersOnMapClick",
            labelKey: "preferences.hideFiltersOnMapClick",
            hintKey: "preferences.hideFiltersOnMapClickHint",
            itemLabelKey: "preferences.hideFiltersOnMapClickLabel",
          },
        ],
      },
      {
        items: [
          {
            type: "radio",
            key: "mapPointStyle",
            labelKey: "preferences.mapPointStyle",
            hintKey: "preferences.mapPointStyleHint",
            options: [
              { value: "dots", labelKey: "preferences.mapPointStyleDots", descKey: "preferences.mapPointStyleDotsDesc" },
              { value: "markers", labelKey: "preferences.mapPointStyleMarkers", descKey: "preferences.mapPointStyleMarkersDesc" },
            ],
          },
        ],
      },
      {
        items: [
          {
            type: "checkbox",
            key: "mapRightClickMeasure",
            labelKey: "preferences.mapRightClickMeasure",
            hintKey: "preferences.mapRightClickMeasureHint",
            itemLabelKey: "preferences.mapRightClickMeasureLabel",
          },
          {
            type: "checkbox",
            key: "mapMeasureCircle",
            labelKey: "preferences.mapMeasureCircle",
            hintKey: "preferences.mapMeasureCircleHint",
            itemLabelKey: "preferences.mapMeasureCircleLabel",
          },
        ],
        noteKey: "preferences.mapMeasureCircleNote",
      },
    ],
  },
  {
    titleKey: "preferences.groupAzimuths",
    cards: [
      {
        items: [
          {
            type: "slider",
            key: "azimuthsMinZoom",
            labelKey: "preferences.azimuthsMinZoom",
            hintKey: "preferences.azimuthsMinZoomHint",
            min: 10,
            max: 19,
            step: 0.1,
            format: (v) => v.toFixed(1),
          },
          {
            type: "slider",
            key: "azimuthLineLength",
            labelKey: "preferences.azimuthLineLength",
            hintKey: "preferences.azimuthLineLengthHint",
            min: 50,
            max: 3000,
            step: 10,
            format: (v) => `${v} m`,
          },
          {
            type: "slider",
            key: "azimuthSpread",
            labelKey: "preferences.azimuthSpread",
            hintKey: "preferences.azimuthSpreadHint",
            min: 0,
            max: 120,
            step: 5,
            format: (v) => `${v}°`,
          },
        ],
      },
    ],
  },
];

function PreferenceField({
  item,
  preferences,
  updatePreferences,
  t,
}: {
  item: PreferenceItem;
  preferences: UserPreferences;
  updatePreferences: (update: Partial<UserPreferences>) => void;
  t: (key: string) => string;
}) {
  switch (item.type) {
    case "radio":
      return (
        <RadioGroup
          value={preferences[item.key] as string}
          onValueChange={(value) => updatePreferences({ [item.key]: value })}
          className="flex flex-col gap-1"
        >
          {item.options.map((option) => (
            <label
              key={option.value}
              htmlFor={`${item.key}-${option.value}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                preferences[item.key] === option.value ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <RadioGroupItem id={`${item.key}-${option.value}`} value={option.value} />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{t(option.labelKey)}</span>
                {option.example ? <span className="text-xs text-muted-foreground font-mono">{option.example}</span> : null}
                {option.descKey ? <span className="text-xs text-muted-foreground">{t(option.descKey)}</span> : null}
              </div>
            </label>
          ))}
        </RadioGroup>
      );

    case "checkbox-group": {
      const selected = preferences[item.key] as string[];
      return (
        <div className="flex flex-col gap-1">
          {item.options.map((option) => (
            <label
              key={option.value}
              htmlFor={`${item.key}-${option.value}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                selected.includes(option.value) ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <Checkbox
                id={`${item.key}-${option.value}`}
                checked={selected.includes(option.value)}
                onCheckedChange={() => updatePreferences({ [item.key]: toggleValue(selected, option.value) })}
              />
              {option.icon ? <option.icon className="size-4 text-muted-foreground" /> : null}
              <span className="text-sm font-medium">{t(option.labelKey)}</span>
            </label>
          ))}
        </div>
      );
    }

    case "checkbox": {
      const checked = preferences[item.key] as boolean;
      return (
        <label
          htmlFor={item.key}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
            checked ? "bg-primary/10" : "hover:bg-muted",
          )}
        >
          <Checkbox id={item.key} checked={checked} onCheckedChange={(v) => updatePreferences({ [item.key]: !!v })} />
          <span className="text-sm font-medium">{t(item.itemLabelKey)}</span>
        </label>
      );
    }

    case "slider": {
      const value = preferences[item.key] as number;
      const display = item.format ? item.format(value) : String(value);
      return (
        <div className="flex items-center gap-4 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors">
          <Slider
            value={[value]}
            onValueChange={(v) => updatePreferences({ [item.key]: Array.isArray(v) ? v[0] : v })}
            min={item.min}
            max={item.max}
            step={item.step}
          />
          <span className="text-sm font-mono font-medium tabular-nums w-12 text-right shrink-0">{display}</span>
        </div>
      );
    }
  }
}

function PrefToggle({ checked, disabled, onChange, label }: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label
      className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors", checked ? "bg-primary/10" : "hover:bg-muted")}
    >
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(!!v)} />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}

function CloudSyncSection({ cloud, t }: { cloud: CloudPreferencesControls; t: (key: string) => string }) {
  const toggle = (
    <PrefToggle
      checked={cloud.syncEnabled}
      disabled={!cloud.isAuthenticated || cloud.isLoading || cloud.isUpdating}
      onChange={(enabled) => {
        void (enabled ? cloud.enableSync() : cloud.disableSync());
      }}
      label={t("preferences.cloudSyncEnabled")}
    />
  );

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t("preferences.cloudSync")}</h2>
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{t("preferences.cloudSyncHint")}</p>
        </div>

        {cloud.isAuthenticated ? (
          toggle
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span className="block w-fit" />}>{toggle}</TooltipTrigger>
            <TooltipContent>{t("preferences.loginToSync")}</TooltipContent>
          </Tooltip>
        )}

        {cloud.syncEnabled ? (
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("preferences.profile")}</p>
              <p className="text-xs text-muted-foreground">{t("preferences.profileHint")}</p>
            </div>
            <Select
              value={cloud.activeProfile}
              onValueChange={(value) => {
                if (value !== null && isPreferenceProfile(value)) cloud.setActiveProfile(value);
              }}
            >
              <SelectTrigger className="h-8 w-full sm:w-40">
                <SelectValue>{cloud.activeProfile === "desktop" ? t("preferences.profileDesktop") : t("preferences.profileMobile")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desktop">{t("preferences.profileDesktop")}</SelectItem>
                <SelectItem value="mobile">{t("preferences.profileMobile")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function NotificationsSection({ t }: { t: (key: string) => string }) {
  const { data: session } = authClient.useSession();
  const { subscription, subscriptionId, permission, isSubscribing, subscribe, unsubscribe, isSupported } = usePushSubscription();
  const queryClient = useQueryClient();
  const isSubscribed = !!subscription;
  const role = session?.user?.role ?? "user";
  const isStaff = role === "admin" || role === "editor";

  const { data: pushPrefs } = useQuery({
    queryKey: ["push-preferences", subscriptionId],
    queryFn: () => fetchPushPreferences(subscriptionId!),
    enabled: !!session?.user && !!subscriptionId,
  });

  const { mutate: updatePrefs, isPending: isUpdatingPrefs } = useMutation({
    mutationFn: (prefs: Partial<PushPreferences>) => updatePushPreferences(prefs, subscriptionId!),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["push-preferences", subscriptionId] });
      const prev = queryClient.getQueryData(["push-preferences", subscriptionId]);
      queryClient.setQueryData(["push-preferences", subscriptionId], (old: typeof pushPrefs) => ({ ...old, ...vars }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(["push-preferences", subscriptionId], ctx?.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["push-preferences", subscriptionId] }),
  });

  if (!isSupported || !session?.user) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">{t("preferences.notifications")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t("preferences.pushTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("preferences.notificationsHint")}</p>
          </div>
          {permission === "denied" ? (
            <p className="text-sm text-destructive px-3">{t("preferences.notificationsBlocked")}</p>
          ) : (
            <PrefToggle
              checked={isSubscribed}
              disabled={isSubscribing}
              onChange={(v) => (v ? subscribe() : unsubscribe())}
              label={t("preferences.pushLabel")}
            />
          )}
        </div>

        {isSubscribed && subscriptionId && (
          <>
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{t("preferences.ukeUpdates")}</p>
                <p className="text-sm text-muted-foreground">{t("preferences.ukeUpdatesHint")}</p>
              </div>
              <PrefToggle
                checked={pushPrefs?.ukeUpdates ?? false}
                disabled={isUpdatingPrefs}
                onChange={(v) => updatePrefs({ ukeUpdates: v })}
                label={t("preferences.ukeUpdatesLabel")}
              />
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{t("preferences.stationWatches")}</p>
                <p className="text-sm text-muted-foreground">{t("preferences.stationWatchesHint")}</p>
              </div>
              <PrefToggle
                checked={pushPrefs?.stationWatches ?? true}
                disabled={isUpdatingPrefs}
                onChange={(v) => updatePrefs({ stationWatches: v })}
                label={t("preferences.stationWatchesLabel")}
              />
            </div>

            {!isStaff && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{t("preferences.submissionUpdates")}</p>
                  <p className="text-sm text-muted-foreground">{t("preferences.submissionUpdatesHint")}</p>
                </div>
                <PrefToggle
                  checked={pushPrefs?.submissionUpdates ?? true}
                  disabled={isUpdatingPrefs}
                  onChange={(v) => updatePrefs({ submissionUpdates: v })}
                  label={t("preferences.submissionUpdatesLabel")}
                />
              </div>
            )}

            {isStaff && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{t("preferences.newSubmissions")}</p>
                  <p className="text-sm text-muted-foreground">{t("preferences.newSubmissionsHint")}</p>
                </div>
                <PrefToggle
                  checked={pushPrefs?.newSubmission ?? true}
                  disabled={isUpdatingPrefs}
                  onChange={(v) => updatePrefs({ newSubmission: v })}
                  label={t("preferences.newSubmissionsLabel")}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PrivacySection({ t }: { t: (key: string) => string }) {
  const { consent, accept, reject, reset } = useCookieConsent();
  const { data: session } = authClient.useSession();
  const role = session?.user?.role;

  if (role !== undefined && role !== null && PRIVILEGED_ROLES.has(role)) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">{t("preferences.privacy")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ShieldUserIcon} className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">{t("preferences.adConsent")}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t("preferences.adConsentHint")}</p>
          </div>
          <PrefToggle
            checked={consent === "accepted"}
            disabled={false}
            onChange={(v) => (v ? accept() : reject())}
            label={t("preferences.adConsentLabel")}
          />
          {consent === null ? (
            <p className="text-xs text-muted-foreground px-3">{t("preferences.adConsentPending")}</p>
          ) : (
            <button
              type="button"
              onClick={reset}
              className="cursor-pointer px-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              {t("preferences.adConsentResetAction")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function PreferencesContent() {
  const { t } = useTranslation("settings");
  const { preferences, updatePreferences, cloud } = usePreferences();

  return (
    <div className="space-y-10">
      <CloudSyncSection cloud={cloud} t={t} />

      {GROUPS.map((group) => (
        <section key={group.titleKey} className="space-y-4">
          <h2 className="text-lg font-semibold">{t(group.titleKey)}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {getVisiblePreferenceCards(group, cloud.activeProfile).map((card) => (
              <div key={card.items.map((i) => i.key).join("-")} className="rounded-xl border bg-card p-4 space-y-4">
                {card.items.map((item, idx) => (
                  <div key={item.key} className="space-y-3">
                    {idx > 0 && <Separator />}
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{t(item.labelKey)}</p>
                      <p className="text-sm text-muted-foreground">{t(item.hintKey)}</p>
                    </div>
                    <PreferenceField item={item} preferences={preferences} updatePreferences={updatePreferences} t={t} />
                  </div>
                ))}
                {card.noteKey && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                    <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      <Trans
                        t={t}
                        i18nKey={card.noteKey}
                        components={{
                          kbd: <kbd className="px-1 py-0.5 rounded bg-amber-500/20 font-mono text-[10px] border border-amber-500/30" />,
                        }}
                      />
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <NotificationsSection t={t} />
      <PrivacySection t={t} />
    </div>
  );
}
