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

export const DEFAULT_DESCRIPTION = DEFAULT_SEO_DESCRIPTION;

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
