import {
  AddCircleIcon,
  AirportTowerIcon,
  AnalyticsUpIcon,
  Camera01Icon,
  DashboardSquare01Icon,
  DatabaseIcon,
  Delete02Icon,
  DiscordIcon,
  Download04Icon,
  EarthIcon,
  FileAttachmentIcon,
  FileBracesIcon,
  FileSearchIcon,
  FullSignalIcon,
  InformationCircleIcon,
  LegalDocument01Icon,
  LegalDocument02Icon,
  Location01Icon,
  Mail01Icon,
  MapsIcon,
  Message01Icon,
  Note01Icon,
  Radar01Icon,
  SecurityLockIcon,
  SentIcon,
  Settings02Icon,
  TaskDaily01Icon,
  Upload04Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export type NavConfigItem = {
  titleKey: string;
  url: string;
  href?: string;
  icon: IconSvgElement;
  allowedRoles?: string[];
  requiresSetting?: "enableUserLists";
};

export type NavConfigSection = {
  titleKey: string;
  key: string;
  url: string;
  icon: IconSvgElement;
  items: NavConfigItem[];
};

export type TranslatedNavItem = {
  title: string;
  url: string;
  href?: string;
  icon: IconSvgElement;
  showFloatingLabel?: boolean;
};

export type TranslatedNavSection = {
  title: string;
  key: string;
  url: string;
  icon: IconSvgElement;
  items: TranslatedNavItem[];
};

type RuntimeSettingsFlags = {
  enableUserLists?: boolean;
};

export const navMainConfig: NavConfigSection[] = [
  {
    titleKey: "sections.stations",
    key: "stations",
    url: "#",
    icon: AirportTowerIcon,
    items: [
      { titleKey: "items.mapView", url: "/", icon: MapsIcon },
      { titleKey: "items.database", url: "/stations", icon: DatabaseIcon },
      { titleKey: "items.photos", url: "/photos", icon: Camera01Icon },
      { titleKey: "items.statistics", url: "/statistics", icon: AnalyticsUpIcon },
      { titleKey: "items.deletedEntries", url: "/deleted-entries", icon: Delete02Icon },
      { titleKey: "items.clfExport", url: "/clf-export", icon: Download04Icon },
      { titleKey: "items.kmz", url: "/kmz", icon: EarthIcon },
      { titleKey: "items.analyzer", url: "/analyzer", icon: FileSearchIcon },
      { titleKey: "items.spectrum", url: "/spectrum", icon: FullSignalIcon },
      { titleKey: "items.pem", url: "/pem-measurements", icon: Radar01Icon },
      { titleKey: "items.hunters", url: "/hunters", icon: UserGroupIcon },
    ],
  },
];

export const authNavConfig: NavConfigSection[] = [
  {
    titleKey: "sections.contribute",
    key: "contribute",
    url: "#",
    icon: AddCircleIcon,
    items: [
      { titleKey: "items.submitStation", url: "/submission", icon: AddCircleIcon },
      { titleKey: "items.mySubmissions", url: "/account/submissions", icon: SentIcon },
    ],
  },
];

export const listsNavConfig: NavConfigSection[] = [
  {
    titleKey: "sections.lists",
    key: "lists",
    url: "#",
    icon: TaskDaily01Icon,
    items: [{ titleKey: "items.viewAllLists", url: "/lists", icon: TaskDaily01Icon }],
  },
];

export const infoNavConfig: NavConfigSection[] = [
  {
    titleKey: "sections.info",
    key: "info",
    url: "#",
    icon: InformationCircleIcon,
    items: [
      { titleKey: "items.about", url: "/about", icon: InformationCircleIcon },
      { titleKey: "items.contact", url: "/contact", icon: Mail01Icon },
      { titleKey: "items.terms", url: "/terms", icon: LegalDocument01Icon },
      { titleKey: "items.privacy", url: "/privacy", icon: LegalDocument02Icon },
      { titleKey: "items.apiDocs", url: "#", href: "/api/v1/docs", icon: FileBracesIcon },
      { titleKey: "items.discord", url: "#", href: "https://discord.gg/SZETJPeayg", icon: DiscordIcon },
    ],
  },
];

export const adminNavConfig: NavConfigSection[] = [
  {
    titleKey: "sections.admin",
    key: "admin",
    url: "#",
    icon: SecurityLockIcon,
    items: [
      { titleKey: "items.dashboard", url: "/admin", allowedRoles: ["admin", "editor"], icon: DashboardSquare01Icon },
      { titleKey: "items.users", url: "/admin/users", allowedRoles: ["admin"], icon: UserGroupIcon },
      { titleKey: "items.stations", url: "/admin/stations", allowedRoles: ["admin", "editor"], icon: AirportTowerIcon },
      { titleKey: "items.locations", url: "/admin/locations", allowedRoles: ["admin", "editor"], icon: Location01Icon },
      { titleKey: "items.submissions", url: "/admin/submissions", allowedRoles: ["admin", "editor"], icon: SentIcon },
      { titleKey: "items.ukePermits", url: "/admin/uke-permits", allowedRoles: ["admin", "editor"], icon: FileAttachmentIcon },
      { titleKey: "items.ukeImport", url: "/admin/uke-import", allowedRoles: ["admin"], icon: Upload04Icon },
      { titleKey: "items.lists", url: "/admin/lists", allowedRoles: ["admin"], icon: TaskDaily01Icon, requiresSetting: "enableUserLists" },
      { titleKey: "items.comments", url: "/admin/comments", allowedRoles: ["admin", "editor"], icon: Message01Icon },
      { titleKey: "items.auditLogs", url: "/admin/audit-logs", allowedRoles: ["admin"], icon: Note01Icon },
      { titleKey: "items.settings", url: "/admin/settings", allowedRoles: ["admin"], icon: Settings02Icon },
    ],
  },
];

export function translateNav(config: NavConfigSection[], t: (key: string) => string): TranslatedNavSection[] {
  return config.map((section) => ({
    title: t(section.titleKey),
    key: section.key,
    url: section.url,
    icon: section.icon,
    items: section.items.map((item) => ({
      title: t(item.titleKey),
      url: item.url,
      href: item.href,
      icon: item.icon,
    })),
  }));
}

export function translateAdminNav(
  config: NavConfigSection[],
  t: (key: string) => string,
  userRole: string | undefined,
  settings: RuntimeSettingsFlags | null | undefined,
) {
  if (userRole !== "admin" && userRole !== "editor") return [];

  return config
    .map((section) => ({
      title: t(section.titleKey),
      key: section.key,
      url: section.url,
      icon: section.icon,
      items: section.items
        .filter((item) => !item.allowedRoles || item.allowedRoles.includes(userRole))
        .filter((item) => !item.requiresSetting || !!settings?.[item.requiresSetting])
        .map((item) => ({
          title: t(item.titleKey),
          url: item.url,
          href: item.href,
          icon: item.icon,
        })),
    }))
    .filter((section) => section.items.length > 0);
}

export function isNavUrlActive(url: string, pathname: string) {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function getActiveNavSection(sections: TranslatedNavSection[], pathname: string) {
  const activeItemUrl = getActiveNavItemUrl(sections, pathname);
  if (activeItemUrl === null) return null;
  return sections.find((section) => section.items.some((item) => item.url === activeItemUrl)) ?? null;
}

export function getActiveNavItemUrl(sections: TranslatedNavSection[], pathname: string) {
  let activeUrl: string | null = null;

  for (const section of sections) {
    for (const item of section.items) {
      if (item.href || !isNavUrlActive(item.url, pathname)) continue;
      if (activeUrl === null || item.url.length > activeUrl.length) activeUrl = item.url;
    }
  }

  return activeUrl;
}
