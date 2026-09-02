import {
  DEFAULT_SEO_DESCRIPTION,
  DEFAULT_SOCIAL_DESCRIPTION,
  DEFAULT_SOCIAL_IMAGE_PATH,
  type JsonLdObject,
  type SEOMetadata,
  SEO_IMAGE_HEIGHT,
  SEO_IMAGE_WIDTH,
  absoluteSiteUrl,
} from "@openbts/shared/seo";
import type { MetaDescriptor } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { APP_NAME } from "@/lib/api";

export const DEFAULT_DESCRIPTION = DEFAULT_SEO_DESCRIPTION;

const STATIC_PAGE_METADATA = {
  "/": {
    title: "BTSearch - mapa stacji bazowych 5G/LTE/UMTS/GSM i radiolinii w Polsce",
    description: DEFAULT_DESCRIPTION,
  },
  "/stations": {
    title: "Baza stacji bazowych",
    description:
      "Wyszukuj stacje bazowe w Polsce po ID stacji, Cell ID, eNB ID, mieście lub adresie. Sprawdź operatora, technologie, pasma, azymuty, pozwolenia UKE i zdjęcia",
  },
  "/statistics": {
    title: "Statystyki stacji bazowych i pozwoleń UKE",
    description:
      "Statystyki pozwoleń, kompletności bazy, kontrybucji i trendów historycznych w podziale na operatorów i pasma. Dane są aktualizowane co 24 godziny",
  },
  "/photos": {
    title: "Zdjęcia stacji bazowych",
    description: "Galeria aktualnych zdjęć opublikowanych stacji bazowych w Polsce wraz z informacjami o operatorach i lokalizacjach",
  },
  "/spectrum": {
    title: "Pasma częstotliwości w Polsce",
    description: "Przydział widma radiowego dla operatorów mobilnych w Polsce",
  },
  "/pem-measurements": {
    title: "Pomiary SI2PEM",
    description: "Planowane, zakończone i odwołane pomiary pól elektromagnetycznych oraz nieaktywne stacje z systemu SI2PEM",
  },
  "/clf-export": {
    title: "Eksport CLF",
    description: "Eksportuj dane komórek z bazy BTSearch do formatu CLF używanego przez aplikacje monitorujące sieci komórkowe",
  },
  "/kmz": {
    title: "Pliki KMZ dla Google Earth",
    description: "Pobierz pliki KMZ dla Google Earth wygenerowane na podstawie importów pozwoleń radiowych UKE",
  },
  "/deleted-entries": {
    title: "Usunięte wpisy UKE",
    description: "Przeglądaj wpisy usunięte podczas importów danych z wykazu pozwoleń radiowych UKE",
  },
  "/changelog": {
    title: "Historia zmian",
    description: "Historia zmian, nowych funkcji i poprawek w serwisie BTSearch",
  },
  "/about": {
    title: "O serwisie",
    description: "Poznaj historię, cel i zasady działania serwisu BTSearch oraz źródła prezentowanych danych o stacjach bazowych",
  },
  "/contact": {
    title: "Kontakt",
    description: "Skontaktuj się z autorami serwisu BTSearch w sprawach dotyczących bazy stacji, zgłoszeń i działania serwisu",
  },
  "/terms": {
    title: "Regulamin",
    description: "Regulamin korzystania z serwisu BTSearch, zasady udostępniania danych oraz odpowiedzialność użytkowników",
  },
  "/privacy": {
    title: "Polityka prywatności",
    description: "Informacje o przetwarzaniu danych osobowych, plikach cookie i ochronie prywatności użytkowników serwisu BTSearch",
  },
} as const;

export type StaticPagePath = keyof typeof STATIC_PAGE_METADATA;

type PageHead = {
  meta: ComponentProps<"meta">[];
  links: ComponentProps<"link">[];
};

type JsonLdMetaDescriptor = Extract<MetaDescriptor, { "script:ld+json": unknown }>;

function buildJsonLdMeta(data: JsonLdObject): ComponentProps<"meta"> {
  const descriptor: JsonLdMetaDescriptor = { "script:ld+json": data };
  return descriptor as unknown as ComponentProps<"meta">;
}

export function getBrowserOrigin(): string {
  return window.location.origin;
}

export function buildDefaultMeta(title: string): ComponentProps<"meta">[] {
  const defaultImageUrl = absoluteSiteUrl(getBrowserOrigin(), DEFAULT_SOCIAL_IMAGE_PATH);

  return [
    { title },
    { name: "description", content: DEFAULT_DESCRIPTION },
    { property: "og:title", content: title },
    { property: "og:site_name", content: title },
    { property: "og:description", content: DEFAULT_SOCIAL_DESCRIPTION },
    { property: "og:image", content: defaultImageUrl },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: DEFAULT_SOCIAL_DESCRIPTION },
    { name: "twitter:image", content: defaultImageUrl },
  ];
}

export function buildPageHead(metadata: SEOMetadata): PageHead {
  const meta: ComponentProps<"meta">[] = [
    { title: metadata.title },
    { name: "description", content: metadata.description },
    { property: "og:title", content: metadata.title },
    { property: "og:site_name", content: metadata.siteName },
    { property: "og:description", content: metadata.description },
    { property: "og:url", content: metadata.canonicalUrl },
    { property: "og:image", content: metadata.imageUrl },
    { property: "og:image:width", content: String(SEO_IMAGE_WIDTH) },
    { property: "og:image:height", content: String(SEO_IMAGE_HEIGHT) },
    { name: "twitter:title", content: metadata.title },
    { name: "twitter:description", content: metadata.description },
    { name: "twitter:image", content: metadata.imageUrl },
    ...metadata.jsonLd.map(buildJsonLdMeta),
  ];

  if (metadata.noindex) meta.push({ name: "robots", content: "noindex" });

  return {
    meta,
    links: [{ rel: "canonical", href: metadata.canonicalUrl }],
  };
}

export function buildStaticPageHead(path: StaticPagePath): PageHead {
  const page = STATIC_PAGE_METADATA[path];
  const siteUrl = getBrowserOrigin();
  const canonicalUrl = absoluteSiteUrl(siteUrl, path);
  const title = path === "/" ? page.title : `${page.title} | ${APP_NAME}`;
  const jsonLd: JsonLdObject[] =
    path === "/"
      ? [
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": `${canonicalUrl}#website`,
            url: canonicalUrl,
            name: APP_NAME,
            alternateName: "BTSearch.pl",
            description: page.description,
            inLanguage: "pl-PL",
          },
        ]
      : [];

  return buildPageHead({
    title,
    siteName: APP_NAME,
    description: page.description,
    canonicalUrl,
    imageUrl: absoluteSiteUrl(siteUrl, DEFAULT_SOCIAL_IMAGE_PATH),
    noindex: false,
    jsonLd,
  });
}
