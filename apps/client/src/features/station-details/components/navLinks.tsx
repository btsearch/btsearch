import { AppleIcon, GoogleMapsIcon, MapsLocation01Icon, WazeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import type { JSX } from "react/jsx-runtime";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type NavigationApp, usePreferences } from "@/hooks/usePreferences";

import OsmSvg from "../../../components/ui/osm.svg?react";

type NavIconComponent = (props: { className?: string }) => JSX.Element;

const hugeIcon = (icon: typeof GoogleMapsIcon): NavIconComponent => {
  function NavHugeIcon({ className }: { className?: string }) {
    return <HugeiconsIcon icon={icon} className={className} />;
  }
  return NavHugeIcon;
};

const GoogleMapsNavIcon = hugeIcon(GoogleMapsIcon);
const AppleNavIcon = hugeIcon(AppleIcon);
const WazeNavIcon = hugeIcon(WazeIcon);

export function OrganicMapsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="93 97 830 830" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="m861.3562052 256.9139426c18.220574 48.4374573-79.2585233 166.2022835-172.1806378 196.4226995-168.0803471-58.2153969-173.5457836 39.5504743-311.1096159 132.4296677 162.6149552 112.4329497 332.9737882 24.8856325 329.7844002-85.7673036-127.9956457 73.3254376-208.1650824 81.3238121-254.1719349 79.1032962 154.8710218-30.6636026 322.0404219-125.7633124 357.0667834-165.7616685 0.032202 1.7749817 0.049863 3.5523114 0.049863 5.33456 0 191.0905993-295.1650572 474.6148576-295.1650572 474.6148576s-154.5086464-147.95159-239.9499331-302.4701423c-11.943516-0.1614425-83.8230022 25.9633002-110.3310391-9.051445-29.6082623-39.1049397 80.1693081-170.2028122 175.3699196-209.3102117 170.3563508 77.3261904 263.7351577-123.0971499 317.0292402-134.2068293-158.9688193-94.2135154-316.1183714-55.5493358-333.8847017 84.4353407 88.3675802-50.2172465 196.7775505-78.65765 246.8822227-76.4346744-140.7606999 28.7623957-301.9981102 132.8752019-350.2809443 172.4255642 0-159.041983 132.1505407-287.9677052 295.1650569-287.9677052 96.4018995 0 182.0095151 45.0859887 235.8744518 114.8252613 0.00335 0 96.1884344-31.2834041 109.851981 11.3787329zm-33.7059144 14.218972c-12.6607646-17.2289278-56.7341326 2.8936807-56.7341326 2.8936807 6.1678152 10.3446685 11.7002555 21.0960758 16.5352245 32.2084942 4.8995467 11.2622344 9.0867303 22.8954305 12.5044868 34.8382086 0 0 45.0041042-46.3863227 27.6944213-69.9403835zm-629.5734431 294.3797539c13.6858848 18.6189721 61.3258973-3.1309266 61.3258973-3.1309266-6.6716772-11.1802827-12.6484216-22.8033047-17.8755617-34.8139472-5.2966478-12.1727565-9.8213865-24.7454316-13.5171072-37.6545218 0 0-48.6427553 50.1397674-29.9332284 75.5993956z" />
    </svg>
  );
}

export function OsmAndIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        d="m598.32963 913.706-84.95 80.979a19.593 19.593 0 0 1 -26.784 0l-84.947-80.978c-207.9-45.1-363.672001-230.086-363.672001-451.553 0-255.237 206.849001-462.15399485 462.011001-462.15399485s462.012 206.91699485 462.012 462.15399485c0 221.466-155.771 406.451-363.67 451.552zm-98.318-715.649c-145.786 0-263.971 118.208-263.971 264.036s118.185 264.039 263.971 264.039 263.976-118.217 263.976-264.039-118.19-264.036-263.976-264.036z"
      />
    </svg>
  );
}

export function OpenStreetMapIcon({ className }: { className?: string }) {
  return <OsmSvg className={className} />;
}

type NavigationLinksProps = {
  latitude: number;
  longitude: number;
  className?: string;
  displayMode?: "inline" | "buttons";
};

export const NAV_APP_CONFIG: Record<NavigationApp, { label: string; Icon: NavIconComponent; url: (lat: number, lng: number) => string }> = {
  "google-maps": {
    label: "Google Maps",
    Icon: GoogleMapsNavIcon,
    url: (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  },
  "apple-maps": {
    label: "Apple Maps",
    Icon: AppleNavIcon,
    url: (lat, lng) => `https://maps.apple.com/?q=${lat},${lng}`,
  },
  waze: {
    label: "Waze",
    Icon: WazeNavIcon,
    url: (lat, lng) => `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  },
  osmand: {
    label: "OsmAnd",
    Icon: OsmAndIcon,
    url: (lat, lng) => `https://osmand.net/go?lat=${lat}&lon=${lng}&z=16`,
  },
  "organic-maps": {
    label: "Organic Maps",
    Icon: OrganicMapsIcon,
    url: (lat, lng) => `https://omaps.app/map?v=1&ll=${lat},${lng}`,
  },
  openstreetmap: {
    label: "OpenStreetMap",
    Icon: OpenStreetMapIcon,
    url: (lat, lng) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}&layers=D`,
  },
};

export function NavigationLinks({ latitude, longitude, className, displayMode }: NavigationLinksProps) {
  const { t } = useTranslation("settings");
  const { preferences } = usePreferences();

  const mode = displayMode ?? preferences.navLinksDisplay;

  if (preferences.navigationApps.length === 0) return null;

  if (mode === "buttons") {
    return (
      <div className={className}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {preferences.navigationApps.map((app) => {
            const config = NAV_APP_CONFIG[app];
            return (
              <Tooltip key={app}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => window.open(config.url(latitude, longitude), "_blank", "noreferrer")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    />
                  }
                >
                  <config.Icon className="size-3.5" />
                  {config.label}
                </TooltipTrigger>
                <TooltipContent>{t("preferences.openWith", { app: config.label })}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <span className={className}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer" />
            }
          >
            <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{t("preferences.navigationApps")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" sideOffset={4} className="min-w-48">
          {preferences.navigationApps.map((app) => {
            const config = NAV_APP_CONFIG[app];
            return (
              <DropdownMenuItem
                key={app}
                onClick={() => window.open(config.url(latitude, longitude), "_blank", "noreferrer")}
                className="cursor-pointer"
              >
                <config.Icon className="size-4" />
                {t("preferences.openWith", { app: config.label })}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
