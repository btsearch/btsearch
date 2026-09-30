import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import {
  AppleIcon,
  CloudIcon,
  ComputerIcon,
  GoogleMapsIcon,
  InformationCircleIcon,
  LanguageSquareIcon,
  Moon02Icon,
  Notification03Icon,
  PaintBoardIcon,
  ShieldUserIcon,
  SmartPhone01Icon,
  Sun03Icon,
  WazeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../authErrors";
import { SETTINGS_SECTION_IDS } from "../sections";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SETTINGS_TWO_COLUMN_CLASS,
  SegmentedControl,
  SettingsCard,
  SettingsCardHeader,
  SettingsCardNote,
  SettingsRow,
  SettingsSection,
  SettingsStack,
} from "./settingsPrimitives";
import { preloadEnglishCatalog, useLanguageChange, useLanguageOptions } from "@/components/preferences/languageSwitcher";
import { useTheme } from "@/components/preferences/themeProvider";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { type PushPreferences, fetchPushPreferences, updatePushPreferences } from "@/features/notifications/api";
import { usePushSubscription } from "@/features/notifications/usePushSubscription";
import { OpenStreetMapIcon, OrganicMapsIcon, OsmAndIcon } from "@/features/station-details/components/navLinks";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { type NavMode, type NavigationApp, type UserPreferences, usePreferences } from "@/hooks/usePreferences";
import { isGloballyHandledError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { cn, toggleValue } from "@/lib/utils";

const PRIVILEGED_ROLES = new Set(["admin", "editor"]);

type ThemeValue = ReturnType<typeof useTheme>["theme"];
type UpdatePreferences = ReturnType<typeof usePreferences>["updatePreferences"];

type NavigationAppOption = {
  value: NavigationApp;
  labelKey: string;
  renderIcon: (className: string) => ReactNode;
};

function renderHugeIcon(icon: IconSvgElement) {
  return (className: string) => <HugeiconsIcon icon={icon} aria-hidden="true" className={className} />;
}

const NAVIGATION_APPS: readonly NavigationAppOption[] = [
  { value: "google-maps", labelKey: "preferences.navGoogleMaps", renderIcon: renderHugeIcon(GoogleMapsIcon) },
  { value: "apple-maps", labelKey: "preferences.navAppleMaps", renderIcon: renderHugeIcon(AppleIcon) },
  { value: "waze", labelKey: "preferences.navWaze", renderIcon: renderHugeIcon(WazeIcon) },
  { value: "osmand", labelKey: "preferences.navOsmAnd", renderIcon: (className) => <OsmAndIcon className={className} /> },
  { value: "organic-maps", labelKey: "preferences.navOrganicMaps", renderIcon: (className) => <OrganicMapsIcon className={className} /> },
  { value: "openstreetmap", labelKey: "preferences.navOpenStreetMap", renderIcon: (className) => <OpenStreetMapIcon className={className} /> },
];

const GPS_EXAMPLES = {
  decimal: "52.23157, 21.00672",
  dms: "52°13'53.7\"N 21°00'24.2\"E",
} as const;

function PreferenceSwitchRow({
  title,
  description,
  checked,
  disabled = false,
  onCheckedChange,
  icon,
  className,
}: {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: IconSvgElement;
  className?: string;
}) {
  const titleId = useId();

  return (
    <SettingsRow icon={icon} title={title} titleId={titleId} description={description} className={className}>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-labelledby={titleId} />
    </SettingsRow>
  );
}

function PreferenceSliderRow({
  title,
  description,
  value,
  min,
  max,
  step,
  format = String,
  onValueChange,
}: {
  title: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onValueChange: (value: number) => void;
}) {
  return (
    <SettingsRow title={title} description={description} wrap>
      <div className="flex w-full items-center gap-3 sm:w-72">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          aria-label={title}
          onValueChange={(next) => {
            const nextValue = Array.isArray(next) ? next[0] : next;
            if (typeof nextValue === "number") onValueChange(nextValue);
          }}
        />
        <span className="w-14 shrink-0 text-right font-mono text-[0.8125rem] font-medium tabular-nums">{format(value)}</span>
      </div>
    </SettingsRow>
  );
}

function NavModePreview({ mode }: { mode: NavMode }) {
  if (mode === "sidebar") {
    return (
      <span aria-hidden="true" className="flex h-16 w-full overflow-hidden rounded-md border bg-background">
        <span className="flex w-1/4 flex-col gap-1 border-r bg-muted/60 p-1.5">
          <span className="h-1 w-3/4 rounded-full bg-muted-foreground/30" />
          <span className="h-1 w-full rounded-full bg-primary" />
          <span className="h-1 w-3/5 rounded-full bg-muted-foreground/30" />
          <span className="h-1 w-4/5 rounded-full bg-muted-foreground/30" />
        </span>
        <span className="flex flex-1 flex-col gap-1 p-1.5">
          <span className="h-1 w-2/5 rounded-full bg-muted-foreground/30" />
          <span className="flex-1 rounded-sm bg-muted/70" />
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="relative block h-16 w-full overflow-hidden rounded-md border bg-background p-1.5">
      <span className="block h-1 w-2/5 rounded-full bg-muted-foreground/30" />
      <span className="mt-1 block h-7 rounded-sm bg-muted/70" />
      <span className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-background p-0.5">
        <span className="h-1.5 w-3 rounded-full bg-primary" />
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      </span>
    </span>
  );
}

function NavModePicker({ value, onValueChange }: { value: NavMode; onValueChange: (mode: NavMode) => void }) {
  const { t } = useTranslation("settings");
  const titleId = useId();
  const options: { value: NavMode; label: string }[] = [
    { value: "sidebar", label: t("preferences.navModeSidebar") },
    { value: "floating", label: t("preferences.navModeFloating") },
  ];

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3.5 first:border-t-0 sm:px-5">
      <div>
        <p id={titleId} className="text-sm leading-5 font-medium">
          {t("preferences.navMode")}
        </p>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("preferences.navModeHint")}</p>
      </div>
      <RadioGroupPrimitive
        value={value}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) onValueChange(option.value);
        }}
        aria-labelledby={titleId}
        className="grid grid-cols-2 gap-3"
      >
        {options.map((option) => (
          <RadioPrimitive.Root
            key={option.value}
            value={option.value}
            className="group/tile flex cursor-pointer flex-col gap-2.5 rounded-lg border p-2.5 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary/10"
          >
            <NavModePreview mode={option.value} />
            <span className="flex items-center gap-2 text-[0.8125rem] leading-[1.125rem] font-medium">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input group-data-checked/tile:border-primary">
                <span className="size-2 rounded-full bg-primary opacity-0 group-data-checked/tile:opacity-100" />
              </span>
              {option.label}
            </span>
          </RadioPrimitive.Root>
        ))}
      </RadioGroupPrimitive>
    </div>
  );
}

function NavigationAppsPicker({ selected, onChange }: { selected: NavigationApp[]; onChange: (apps: NavigationApp[]) => void }) {
  const { t } = useTranslation("settings");
  const titleId = useId();

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:px-5">
      <div>
        <p id={titleId} className="text-sm leading-5 font-medium">
          {t("preferences.navigationApps")}
        </p>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("preferences.navigationAppsHint")}</p>
      </div>
      <div role="group" aria-labelledby={titleId} className="flex flex-wrap gap-2">
        {NAVIGATION_APPS.map((app) => {
          const pressed = selected.includes(app.value);
          return (
            <Button
              key={app.value}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={pressed}
              onClick={() => onChange(toggleValue(selected, app.value))}
              className="aria-pressed:border-primary/30 aria-pressed:bg-primary/10 aria-pressed:text-primary hover:aria-pressed:bg-primary/15 dark:aria-pressed:border-primary/30 dark:aria-pressed:bg-primary/10 dark:hover:aria-pressed:bg-primary/15"
            >
              {app.renderIcon("size-3.5")}
              {t(app.labelKey)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function SyncCard() {
  const { t } = useTranslation("settings");
  const { cloud } = usePreferences();
  const profileTitleId = useId();

  const toggleSync = (enabled: boolean) => {
    const request = enabled ? cloud.enableSync() : cloud.disableSync();
    request.catch(showSettingsError);
  };

  return (
    <SettingsCard>
      <PreferenceSwitchRow
        icon={CloudIcon}
        title={t("preferences.cloudSync")}
        description={cloud.isAuthenticated ? t("preferences.cloudSyncHint") : t("preferences.loginToSync")}
        checked={cloud.syncEnabled}
        disabled={!cloud.isAuthenticated || cloud.isLoading || cloud.isUpdating}
        onCheckedChange={toggleSync}
        className="py-4"
      />
      {cloud.syncEnabled ? (
        <SettingsRow title={t("preferences.profile")} titleId={profileTitleId} description={t("preferences.profileHint")} wrap>
          <SegmentedControl
            value={cloud.activeProfile}
            onValueChange={cloud.setActiveProfile}
            ariaLabelledBy={profileTitleId}
            options={[
              { value: "desktop", label: t("preferences.profileDesktop"), icon: ComputerIcon },
              { value: "mobile", label: t("preferences.profileMobile"), icon: SmartPhone01Icon },
            ]}
          />
        </SettingsRow>
      ) : null}
    </SettingsCard>
  );
}

function AppearanceCard() {
  const { t } = useTranslation("settings");
  const { theme, setTheme } = useTheme();
  const changeLanguage = useLanguageChange();
  const { options: languageOptions, current: currentLanguage } = useLanguageOptions();
  const themeTitleId = useId();
  const languageTitleId = useId();

  const themeOptions: { value: ThemeValue; label: string; icon: IconSvgElement }[] = [
    { value: "light", label: t("common:theme.light"), icon: Sun03Icon },
    { value: "dark", label: t("common:theme.dark"), icon: Moon02Icon },
    { value: "system", label: t("common:theme.system"), icon: ComputerIcon },
  ];

  return (
    <SettingsCard>
      <SettingsRow
        icon={PaintBoardIcon}
        title={t("common:theme.title")}
        titleId={themeTitleId}
        description={t("preferences.themeHint")}
        wrap
        className="py-4"
      >
        <SegmentedControl value={theme} onValueChange={setTheme} options={themeOptions} ariaLabelledBy={themeTitleId} />
      </SettingsRow>
      <SettingsRow
        icon={LanguageSquareIcon}
        title={t("preferences.language")}
        titleId={languageTitleId}
        description={t("preferences.languageHint")}
        wrap
      >
        <Select
          value={currentLanguage?.code ?? null}
          items={languageOptions.map((option) => ({ value: option.code, label: option.nativeName }))}
          onValueChange={(code) => {
            if (code !== null) changeLanguage(code);
          }}
        >
          <SelectTrigger
            aria-labelledby={languageTitleId}
            onPointerEnter={preloadEnglishCatalog}
            onFocus={preloadEnglishCatalog}
            className="min-w-44 cursor-pointer max-sm:w-full"
          >
            <SelectValue>{currentLanguage?.nativeName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {languageOptions.map((option) => (
              <SelectItem key={option.code} value={option.code} className="cursor-pointer">
                <span lang={option.code}>{option.nativeName}</span>
                {option.hint ? <span className="text-xs text-muted-foreground">{option.hint}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsCard>
  );
}

function NavigationCard({ preferences, updatePreferences }: { preferences: UserPreferences; updatePreferences: UpdatePreferences }) {
  const { t } = useTranslation("settings");
  const displayTitleId = useId();

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("common:labels.navigation")} description={t("preferences.navigationHint")} />
      <div className="border-t">
        <NavModePicker value={preferences.navMode} onValueChange={(navMode) => updatePreferences({ navMode })} />
        <NavigationAppsPicker selected={preferences.navigationApps} onChange={(navigationApps) => updatePreferences({ navigationApps })} />
        <SettingsRow title={t("preferences.navDisplayMode")} titleId={displayTitleId} description={t("preferences.navDisplayModeHint")} wrap>
          <SegmentedControl
            value={preferences.navLinksDisplay}
            onValueChange={(navLinksDisplay) => updatePreferences({ navLinksDisplay })}
            ariaLabelledBy={displayTitleId}
            options={[
              { value: "inline", label: t("preferences.navDisplayInline") },
              { value: "buttons", label: t("preferences.navDisplayButtons") },
            ]}
          />
        </SettingsRow>
      </div>
    </SettingsCard>
  );
}

function NotificationsCard() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { subscription, subscriptionId, permission, isSubscribing, subscribe, unsubscribe, isSupported } = usePushSubscription();
  const queryKey = ["push-preferences", subscriptionId];

  const {
    data: pushPreferences,
    isLoadingError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => (subscriptionId === null ? Promise.reject(new Error("Missing push subscription")) : fetchPushPreferences(subscriptionId)),
    enabled: Boolean(session?.user) && subscriptionId !== null,
  });

  const { mutate: updatePush, isPending: isUpdatingPush } = useMutation({
    mutationFn: (patch: Partial<PushPreferences>) =>
      subscriptionId === null ? Promise.reject(new Error("Missing push subscription")) : updatePushPreferences(patch, subscriptionId),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PushPreferences>(queryKey);
      if (previous !== undefined) queryClient.setQueryData<PushPreferences>(queryKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (error, _patch, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      if (isGloballyHandledError(error)) return;
      toast.error(t("preferences.notificationPrefsError"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (!isSupported || !session?.user) return null;

  const isStaff = PRIVILEGED_ROLES.has(session.user.role ?? "user");
  const isSubscribed = subscription !== null;
  const topicsDisabled = isUpdatingPush || pushPreferences === undefined;
  const topicRowClassName = "sm:pl-[4.125rem]";

  return (
    <SettingsCard>
      {permission === "denied" ? (
        <>
          <SettingsCardHeader icon={Notification03Icon} title={t("notifications:pushTitle")} description={t("preferences.notificationsHint")} />
          <div className="border-t px-4 py-3 sm:px-5">
            <InlineError size="sm" title={t("preferences.notificationsBlocked")} description={t("preferences.notificationsBlockedHint")} />
          </div>
        </>
      ) : (
        <PreferenceSwitchRow
          icon={Notification03Icon}
          title={t("notifications:pushTitle")}
          description={t("preferences.notificationsHint")}
          checked={isSubscribed}
          disabled={isSubscribing}
          onCheckedChange={(checked) => void (checked ? subscribe() : unsubscribe())}
          className="py-4"
        />
      )}
      {isSubscribed && subscriptionId !== null ? (
        isLoadingError ? (
          <div className="border-t px-4 py-3 sm:px-5">
            <InlineError size="sm" onRetry={() => void refetch()} isRetrying={isFetching} />
          </div>
        ) : (
          <>
            <PreferenceSwitchRow
              title={t("preferences.ukeUpdates")}
              description={t("preferences.ukeUpdatesHint")}
              checked={pushPreferences?.ukeUpdates ?? false}
              disabled={topicsDisabled}
              onCheckedChange={(ukeUpdates) => updatePush({ ukeUpdates })}
              className={topicRowClassName}
            />
            <PreferenceSwitchRow
              title={t("preferences.stationWatches")}
              description={t("preferences.stationWatchesHint")}
              checked={pushPreferences?.stationWatches ?? true}
              disabled={topicsDisabled}
              onCheckedChange={(stationWatches) => updatePush({ stationWatches })}
              className={topicRowClassName}
            />
            {isStaff ? (
              <PreferenceSwitchRow
                title={t("preferences.newSubmissions")}
                description={t("preferences.newSubmissionsHint")}
                checked={pushPreferences?.newSubmission ?? true}
                disabled={topicsDisabled}
                onCheckedChange={(newSubmission) => updatePush({ newSubmission })}
                className={topicRowClassName}
              />
            ) : (
              <PreferenceSwitchRow
                title={t("preferences.submissionUpdates")}
                description={t("preferences.submissionUpdatesHint")}
                checked={pushPreferences?.submissionUpdates ?? true}
                disabled={topicsDisabled}
                onCheckedChange={(submissionUpdates) => updatePush({ submissionUpdates })}
                className={topicRowClassName}
              />
            )}
          </>
        )
      ) : null}
      <SettingsCardNote>{t("preferences.notificationsNote")}</SettingsCardNote>
    </SettingsCard>
  );
}

function AdConsentCard() {
  const { t } = useTranslation("settings");
  const { data: session } = authClient.useSession();
  const { consent, accept, reject, reset } = useCookieConsent();
  const role = session?.user.role;

  if (typeof role === "string" && PRIVILEGED_ROLES.has(role)) return null;

  return (
    <SettingsCard>
      <PreferenceSwitchRow
        icon={ShieldUserIcon}
        title={t("preferences.adConsent")}
        description={t("preferences.adConsentHint")}
        checked={consent === "accepted"}
        onCheckedChange={(checked) => (checked ? accept() : reject())}
        className="py-4"
      />
      <SettingsCardNote>
        {consent === null ? (
          t("preferences.adConsentPending")
        ) : (
          <button type="button" onClick={reset} className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline">
            {t("preferences.adConsentResetAction")}
          </button>
        )}
      </SettingsCardNote>
    </SettingsCard>
  );
}

function MapCard({
  preferences,
  updatePreferences,
  isDesktopProfile,
}: {
  preferences: UserPreferences;
  updatePreferences: UpdatePreferences;
  isDesktopProfile: boolean;
}) {
  const { t } = useTranslation("settings");
  const styleTitleId = useId();

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("common:labels.map")} description={t("preferences.mapHint")} />
      <div className="border-t">
        <SettingsRow title={t("preferences.mapPointStyle")} titleId={styleTitleId} description={t("preferences.mapPointStyleHint")} wrap>
          <SegmentedControl
            value={preferences.mapPointStyle}
            onValueChange={(mapPointStyle) => updatePreferences({ mapPointStyle })}
            ariaLabelledBy={styleTitleId}
            options={[
              { value: "dots", label: t("preferences.mapPointStyleDots") },
              { value: "markers", label: t("preferences.mapPointStyleMarkers") },
            ]}
          />
        </SettingsRow>
        <PreferenceSliderRow
          title={t("preferences.mapStationsLimit")}
          description={t("preferences.mapStationsLimitHint")}
          value={preferences.mapStationsLimit}
          min={10}
          max={1000}
          step={10}
          onValueChange={(mapStationsLimit) => updatePreferences({ mapStationsLimit })}
        />
        <PreferenceSliderRow
          title={t("preferences.radiolinesMinZoom")}
          description={t("preferences.radiolinesMinZoomHint")}
          value={preferences.radiolinesMinZoom}
          min={7}
          max={11}
          step={0.1}
          format={(value) => value.toFixed(1)}
          onValueChange={(radiolinesMinZoom) => updatePreferences({ radiolinesMinZoom })}
        />
        <PreferenceSliderRow
          title={t("preferences.mapRadiolinesLimit")}
          description={t("preferences.mapRadiolinesLimitHint")}
          value={preferences.mapRadiolinesLimit}
          min={10}
          max={1000}
          step={10}
          onValueChange={(mapRadiolinesLimit) => updatePreferences({ mapRadiolinesLimit })}
        />
        <PreferenceSwitchRow
          title={t("preferences.mapHoverTooltip")}
          description={t("preferences.mapHoverTooltipHint")}
          checked={preferences.showMapHoverTooltip}
          onCheckedChange={(showMapHoverTooltip) => updatePreferences({ showMapHoverTooltip })}
        />
        <PreferenceSwitchRow
          title={t("preferences.allowMultipleMapPopups")}
          description={t("preferences.allowMultipleMapPopupsHint")}
          checked={preferences.allowMultipleMapPopups}
          onCheckedChange={(allowMultipleMapPopups) => updatePreferences({ allowMultipleMapPopups })}
        />
        <PreferenceSwitchRow
          title={t("preferences.closeMapPopupsOnMapClick")}
          description={t("preferences.closeMapPopupsOnMapClickHint")}
          checked={preferences.closeMapPopupsOnMapClick}
          onCheckedChange={(closeMapPopupsOnMapClick) => updatePreferences({ closeMapPopupsOnMapClick })}
        />
        {isDesktopProfile ? (
          <PreferenceSwitchRow
            title={t("preferences.hideFiltersOnMapClick")}
            description={t("preferences.hideFiltersOnMapClickHint")}
            checked={preferences.hideFiltersOnMapClick}
            onCheckedChange={(hideFiltersOnMapClick) => updatePreferences({ hideFiltersOnMapClick })}
          />
        ) : null}
        <PreferenceSwitchRow
          title={t("preferences.mapRightClickMeasure")}
          description={t("preferences.mapRightClickMeasureHint")}
          checked={preferences.mapRightClickMeasure}
          onCheckedChange={(mapRightClickMeasure) => updatePreferences({ mapRightClickMeasure })}
        />
        <PreferenceSwitchRow
          title={t("preferences.mapMeasureCircle")}
          description={t("preferences.mapMeasureCircleHint")}
          checked={preferences.mapMeasureCircle}
          onCheckedChange={(mapMeasureCircle) => updatePreferences({ mapMeasureCircle })}
        />
      </div>
      <SettingsCardNote>
        <Trans
          t={t}
          i18nKey="preferences.mapMeasureCircleNote"
          components={{ kbd: <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground" /> }}
        />
      </SettingsCardNote>
    </SettingsCard>
  );
}

function StationCard({ preferences, updatePreferences }: { preferences: UserPreferences; updatePreferences: UpdatePreferences }) {
  const { t } = useTranslation("settings");
  const gpsTitleId = useId();

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("preferences.stationTitle")} description={t("preferences.stationHint")} />
      <div className="border-t">
        <PreferenceSwitchRow
          title={t("preferences.stationPhotoPanel")}
          description={t("preferences.stationPhotoPanelHint")}
          checked={preferences.showStationPhotoPanel}
          onCheckedChange={(showStationPhotoPanel) => updatePreferences({ showStationPhotoPanel })}
        />
        <PreferenceSwitchRow
          title={t("preferences.showElevation")}
          description={t("preferences.showElevationHint")}
          checked={preferences.showElevation}
          onCheckedChange={(showElevation) => updatePreferences({ showElevation })}
        />
        <SettingsRow
          title={t("preferences.gpsFormat")}
          titleId={gpsTitleId}
          description={
            <>
              {t("preferences.gpsExample")} <span className="font-mono text-xs text-foreground">{GPS_EXAMPLES[preferences.gpsFormat]}</span>
            </>
          }
          wrap
        >
          <SegmentedControl
            value={preferences.gpsFormat}
            onValueChange={(gpsFormat) => updatePreferences({ gpsFormat })}
            ariaLabelledBy={gpsTitleId}
            options={[
              { value: "decimal", label: t("preferences.gpsDecimal") },
              { value: "dms", label: t("preferences.gpsDms") },
            ]}
          />
        </SettingsRow>
        <PreferenceSliderRow
          title={t("preferences.azimuthsMinZoom")}
          description={t("preferences.azimuthsMinZoomHint")}
          value={preferences.azimuthsMinZoom}
          min={10}
          max={19}
          step={0.1}
          format={(value) => value.toFixed(1)}
          onValueChange={(azimuthsMinZoom) => updatePreferences({ azimuthsMinZoom })}
        />
        <PreferenceSliderRow
          title={t("preferences.azimuthLineLength")}
          description={t("preferences.azimuthLineLengthHint")}
          value={preferences.azimuthLineLength}
          min={50}
          max={3000}
          step={10}
          format={(value) => `${value} m`}
          onValueChange={(azimuthLineLength) => updatePreferences({ azimuthLineLength })}
        />
        <PreferenceSliderRow
          title={t("preferences.azimuthSpread")}
          description={t("preferences.azimuthSpreadHint")}
          value={preferences.azimuthSpread}
          min={0}
          max={120}
          step={5}
          format={(value) => `${value}°`}
          onValueChange={(azimuthSpread) => updatePreferences({ azimuthSpread })}
        />
      </div>
    </SettingsCard>
  );
}

export function PreferencesSection() {
  const { t } = useTranslation("settings");
  const { preferences, updatePreferences, cloud } = usePreferences();
  const profileLabel = cloud.activeProfile === "desktop" ? t("preferences.profileDesktop") : t("preferences.profileMobile");

  return (
    <SettingsSection id={SETTINGS_SECTION_IDS.preferences} title={t("sections.preferences")}>
      <p className={cn("mb-4 flex items-center gap-2", SETTINGS_DESCRIPTION_CLASS)}>
        <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
        {t("preferences.appliesTo", { profile: profileLabel })}
      </p>
      <div className={SETTINGS_TWO_COLUMN_CLASS}>
        <SettingsStack>
          <SyncCard />
          <AppearanceCard />
          <NavigationCard preferences={preferences} updatePreferences={updatePreferences} />
          <NotificationsCard />
          <AdConsentCard />
        </SettingsStack>
        <SettingsStack>
          <MapCard preferences={preferences} updatePreferences={updatePreferences} isDesktopProfile={cloud.activeProfile === "desktop"} />
          <StationCard preferences={preferences} updatePreferences={updatePreferences} />
        </SettingsStack>
      </div>
    </SettingsSection>
  );
}
