import type { FastifyRequest } from "fastify";
import { createHash } from "node:crypto";

const ACCEPT_SENT = "sent";

interface BrowserProperties {
  userAgent: string;
  language: string;
  platform: string;
  acceptHeaders: string;
  acceptEncoding: string;
  secChUa: string;
  dnt: string;
}

function computeFingerprint(properties: BrowserProperties, ip: string | undefined): string | null {
  if (properties.userAgent === "unknown" || properties.acceptHeaders === "unknown") return null;

  const hasBrowserSignal = properties.language !== "unknown" || properties.secChUa !== "unknown";
  if (!hasBrowserSignal) return null;

  const knownCount = Object.values(properties).filter((val) => val !== "unknown").length;
  if (knownCount < 3) return null;

  const browserFingerprint = Object.values(properties).join("|");
  const ipSubnet = getIpSubnet(ip);
  const combined = `${browserFingerprint}:${ipSubnet}`;

  return createHash("sha256").update(combined).digest("hex").substring(0, 12);
}

export function generateFingerprint(req: FastifyRequest): string | null {
  const headers = req.headers;

  const get = (value: string | string[] | undefined): string => {
    if (Array.isArray(value)) return value.join(",");
    return value || "unknown";
  };

  return computeFingerprint(
    {
      userAgent: get(headers["user-agent"]),
      language: get(headers["accept-language"]),
      platform: get(headers["sec-ch-ua-platform"]),
      acceptHeaders: get(headers.accept),
      acceptEncoding: get(headers["accept-encoding"]),
      secChUa: get(headers["sec-ch-ua"]),
      dnt: get(headers.dnt),
    },
    req.ip,
  );
}

export function generateFingerprintFromWebRequest(req: Request): string | null {
  const get = (key: string): string => req.headers.get(key) || "unknown";

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0]?.trim() : null) ?? req.headers.get("x-real-ip") ?? undefined;

  return computeFingerprint(
    {
      userAgent: get("user-agent"),
      language: get("accept-language"),
      platform: get("sec-ch-ua-platform"),
      acceptHeaders: get("accept") === "unknown" ? "unknown" : ACCEPT_SENT,
      acceptEncoding: get("accept-encoding"),
      secChUa: get("sec-ch-ua"),
      dnt: get("dnt"),
    },
    ip,
  );
}

function getIpSubnet(ip: string | undefined): string {
  if (!ip || ip === "unknown") return "unknown";

  try {
    // IPv4: Use /24 subnet (first 3 octets) to group nearby IPs
    if (ip.includes(".")) {
      const parts = ip.split(".");
      if (parts.length === 4 && parts[0] && parts[1] && parts[2]) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }

    // IPv6: Use first 64 bits (4 groups)
    if (ip.includes(":")) {
      const groups = ip.split(":");
      if (groups.length >= 4 && groups[0] && groups[1] && groups[2] && groups[3]) return `${groups[0]}:${groups[1]}:${groups[2]}:${groups[3]}::`;
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}
