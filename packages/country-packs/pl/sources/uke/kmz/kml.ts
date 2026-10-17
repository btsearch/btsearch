import type { DecisionType } from "../../../../core/sources.ts";

const XML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const DECISION_CODES: Readonly<Record<DecisionType, string>> = { permit: "P", permit_change: "zmP" };

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

export function decisionCode(decisionType: DecisionType): string {
  return DECISION_CODES[decisionType];
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

export async function zipKml(kml: string): Promise<Uint8Array> {
  const { strToU8, zipSync } = await import("fflate");
  return zipSync({ "doc.kml": strToU8(kml) }, { level: 6 });
}

export function placemark(name: string, description: string, geometry: string, styleUrl: string): string {
  return `<Placemark>
<name>${escapeXml(name)}</name>
<visibility>0</visibility>
<description><![CDATA[${description}]]></description>
<styleUrl>${styleUrl}</styleUrl>

${geometry}
</Placemark>`;
}

export function folder(name: string, content: string, isOpen: boolean): string {
  return `<Folder><name>${escapeXml(name)}</name><open>${isOpen ? 1 : 0}</open><visibility>0</visibility>\n${content}\n</Folder>`;
}

export function hexToKmlColor(hex: string, alpha = "ff"): string {
  const hexDigits = hex.replace("#", "");
  const red = hexDigits.slice(0, 2);
  const green = hexDigits.slice(2, 4);
  const blue = hexDigits.slice(4, 6);
  return `${alpha}${blue}${green}${red}`;
}

export function lineStyle(id: string, color: string, width: number): string {
  return `<Style id="${escapeXml(id)}">
<LineStyle><color>${color}</color><width>${width}</width></LineStyle>
</Style>`;
}

export function iconStyle(id: string, iconHref: string, scale: number, color: string): string {
  return `<Style id="${escapeXml(id)}">
<IconStyle>
<color>${color}</color>
<scale>${scale}</scale>
<Icon><href>${escapeXml(iconHref)}</href></Icon>
</IconStyle>
<LabelStyle><scale>0.7</scale></LabelStyle>
</Style>`;
}
