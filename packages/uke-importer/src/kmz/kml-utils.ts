import { strToU8, zipSync } from "fflate";

const XML_ESCAPE_CHARS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPE_CHARS[char]!);
}

export function wrapKml(name: string, content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${escapeXml(name)}</name>
${content}
</Document>
</kml>`;
}

export function buildKmz(kmlContent: string): Uint8Array {
  return zipSync({ "doc.kml": strToU8(kmlContent) }, { level: 6 });
}

export function lodRegion(lat: number, lon: number, boxDeg = 0.05, minLodPixels = 256): string {
  const north = lat + boxDeg;
  const south = lat - boxDeg;
  const east = lon + boxDeg;
  const west = lon - boxDeg;

  return `<Region>
<LatLonAltBox>
<north>${north}</north><south>${south}</south>
<east>${east}</east><west>${west}</west>
</LatLonAltBox>
<Lod><minLodPixels>${minLodPixels}</minLodPixels><maxLodPixels>-1</maxLodPixels></Lod>
</Region>`;
}

export function lineLodRegion(lat1: number, lon1: number, lat2: number, lon2: number, minLodPixels = 128, pad = 0.01): string {
  const north = Math.max(lat1, lat2) + pad;
  const south = Math.min(lat1, lat2) - pad;
  const east = Math.max(lon1, lon2) + pad;
  const west = Math.min(lon1, lon2) - pad;

  return `<Region>
<LatLonAltBox>
<north>${north}</north><south>${south}</south>
<east>${east}</east><west>${west}</west>
</LatLonAltBox>
<Lod><minLodPixels>${minLodPixels}</minLodPixels><maxLodPixels>-1</maxLodPixels></Lod>
</Region>`;
}

export function placemark(name: string, description: string, coords: string, styleUrl?: string, region?: string, visible = true): string {
  return `<Placemark>
<name>${escapeXml(name)}</name>
<visibility>${visible ? 1 : 0}</visibility>
<description><![CDATA[${description}]]></description>
${styleUrl ? `<styleUrl>${styleUrl}</styleUrl>` : ""}
${region ?? ""}
${coords}
</Placemark>`;
}

export function folder(name: string, content: string, open = false, visible = true): string {
  return `<Folder><name>${escapeXml(name)}</name><open>${open ? 1 : 0}</open><visibility>${visible ? 1 : 0}</visibility>\n${content}\n</Folder>`;
}

export function hexToKmlColor(hex: string, alpha = "ff"): string {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `${alpha}${b}${g}${r}`;
}

export function lineStyle(id: string, color: string, width: number): string {
  return `<Style id="${escapeXml(id)}">
<LineStyle><color>${color}</color><width>${width}</width></LineStyle>
</Style>`;
}

export function iconStyle(id: string, iconHref: string, scale = 0.8, color?: string): string {
  return `<Style id="${escapeXml(id)}">
<IconStyle>
${color ? `<color>${color}</color>` : ""}
<scale>${scale}</scale>
<Icon><href>${escapeXml(iconHref)}</href></Icon>
</IconStyle>
<LabelStyle><scale>0.7</scale></LabelStyle>
</Style>`;
}
