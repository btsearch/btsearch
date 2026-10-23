import "reflect-metadata";
import {
  AttestationApplicationId,
  type AuthorizationList,
  KeyDescription,
  NonStandardKeyDescription,
  SecurityLevel,
  VerifiedBootState,
  id_ce_keyDescription,
} from "@peculiar/asn1-android";
import { AsnConvert } from "@peculiar/asn1-schema";
import { X509Certificate } from "@peculiar/x509";
import { createHash } from "node:crypto";

import { ValidationError } from "../../../errors.js";
import { ATTESTATION_ROOT_KEYS } from "./trustedKeys.js";

type AttestationSecurityLevel = "software" | "trustedEnvironment" | "strongBox";
type BootState = "verified" | "selfSigned" | "unverified" | "failed";

export type VerifiedAttestation = {
  record: {
    root: string;
    securityLevel: AttestationSecurityLevel;
    keymintSecurityLevel: AttestationSecurityLevel;
    verifiedBootState: BootState | null;
    isBootloaderLocked: boolean | null;
    verifiedBootKey: Buffer | null;
    osVersion: number | null;
    osPatchLevel: number | null;
    vendorPatchLevel: number | null;
    bootPatchLevel: number | null;
    attestedPackage: string | null;
  };
  signatureDigests: Buffer[];
  certificates: { serial: Buffer; der: Buffer }[];
};

const UNKNOWN_ROOT = "unknown";
const ROOT_NAMES_BY_KEY_SHA256 = new Map(ATTESTATION_ROOT_KEYS.map((rootKey) => [rootKey.spkiSha256, rootKey.name]));

const SECURITY_LEVELS: Record<number, AttestationSecurityLevel> = {
  [SecurityLevel.software]: "software",
  [SecurityLevel.trustedEnvironment]: "trustedEnvironment",
  [SecurityLevel.strongBox]: "strongBox",
};

const BOOT_STATES: Record<number, BootState> = {
  [VerifiedBootState.verified]: "verified",
  [VerifiedBootState.selfSigned]: "selfSigned",
  [VerifiedBootState.unverified]: "unverified",
  [VerifiedBootState.failed]: "failed",
};

const KEY_PURPOSE_SIGN = 2;
const KEY_ALGORITHM_EC = 3;
const EC_CURVE_P256 = 1;
const PACKAGE_NAME_MAX_LENGTH = 255;

type AuthorizationLookup = <Key extends keyof AuthorizationList>(key: Key) => AuthorizationList[Key] | undefined;
type ParsedKeyDescription = { description: KeyDescription | NonStandardKeyDescription; find: AuthorizationLookup };

function refusal(position: number, message: string): ValidationError {
  return new ValidationError([{ field: `certificateChain/${position}`, validationMessage: message }]);
}

function toBuffer(value: ArrayBuffer | ArrayBufferView): Buffer {
  return value instanceof ArrayBuffer ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function toNumber(value: number | string | undefined): number | null {
  return value === undefined ? null : Number(value);
}

export function serialBytes(hexSerial: string): Buffer {
  const minimalHex = BigInt(`0x${hexSerial}`).toString(16);
  return Buffer.from(minimalHex.length % 2 === 0 ? minimalHex : `0${minimalHex}`, "hex");
}

function parseCertificates(chain: readonly Buffer[]): X509Certificate[] {
  return chain.map((der, position) => {
    try {
      return new X509Certificate(der);
    } catch {
      throw refusal(position, "Not an X.509 certificate in DER");
    }
  });
}

async function isSignedBy(certificate: X509Certificate, issuer: X509Certificate): Promise<boolean> {
  try {
    return await certificate.verify({ publicKey: issuer.publicKey, signatureOnly: true });
  } catch {
    return false;
  }
}

async function assertChained(certificates: readonly X509Certificate[]): Promise<void> {
  const signatures = await Promise.all(
    certificates.slice(0, -1).map((certificate, position) => isSignedBy(certificate, certificates[position + 1]!)),
  );
  const unsigned = signatures.indexOf(false);
  if (unsigned !== -1) throw refusal(unsigned, "Not signed by the next certificate of the chain");
}

function parseKeyDescription(leaf: X509Certificate): ParsedKeyDescription {
  const extension = leaf.getExtension(id_ce_keyDescription);
  if (extension === null) throw refusal(0, "Has no key attestation extension");

  try {
    const strict = AsnConvert.parse(extension.value, KeyDescription);
    return { description: strict, find: (key) => strict.teeEnforced[key] ?? strict.softwareEnforced[key] };
  } catch {
    try {
      const lenient = AsnConvert.parse(extension.value, NonStandardKeyDescription);
      return { description: lenient, find: (key) => lenient.teeEnforced.findProperty(key) ?? lenient.softwareEnforced.findProperty(key) };
    } catch {
      throw refusal(0, "Its key attestation extension cannot be read");
    }
  }
}

function assertAttestsDeviceKey(leaf: X509Certificate, { description, find }: ParsedKeyDescription, challenge: Buffer, publicKey: Buffer): void {
  if (!toBuffer(description.attestationChallenge).equals(challenge)) throw refusal(0, "Attests another challenge than `challenge`");
  if (!toBuffer(leaf.publicKey.rawData).equals(publicKey)) throw refusal(0, "Attests another key than `publicKey`");

  const isSigningKey = [...(find("purpose") ?? [])].includes(KEY_PURPOSE_SIGN);
  const isP256 = toNumber(find("algorithm")) === KEY_ALGORITHM_EC && toNumber(find("ecCurve")) === EC_CURVE_P256;
  if (!isSigningKey || !isP256) throw refusal(0, "Attests a key that is not an EC P-256 signing key");
}

function findRoot(certificates: readonly X509Certificate[], now: Date): string {
  const top = certificates.at(-1)!;
  const root = ROOT_NAMES_BY_KEY_SHA256.get(createHash("sha256").update(toBuffer(top.publicKey.rawData)).digest("hex")) ?? UNKNOWN_ROOT;
  const isEveryCertificateCurrent = certificates.slice(0, -1).every((certificate) => certificate.notBefore <= now && now <= certificate.notAfter);
  return isEveryCertificateCurrent ? root : UNKNOWN_ROOT;
}

function readApplication(find: AuthorizationLookup): { attestedPackage: string | null; signatureDigests: Buffer[] } {
  const octets = find("attestationApplicationId");
  if (octets === undefined) return { attestedPackage: null, signatureDigests: [] };

  const application = AsnConvert.parse(octets, AttestationApplicationId);
  const firstPackage = application.packageInfos[0];
  const packageName = firstPackage === undefined ? null : new TextDecoder().decode(toBuffer(firstPackage.packageName));
  return {
    attestedPackage: packageName !== null && packageName.length <= PACKAGE_NAME_MAX_LENGTH ? packageName : null,
    signatureDigests: (application.signatureDigests ?? []).map(toBuffer),
  };
}

export async function verifyAttestation(chain: readonly Buffer[], challenge: Buffer, publicKey: Buffer, now: Date): Promise<VerifiedAttestation> {
  const certificates = parseCertificates(chain);
  await assertChained(certificates);
  const leaf = certificates[0]!;
  const keyDescription = parseKeyDescription(leaf);
  assertAttestsDeviceKey(leaf, keyDescription, challenge, publicKey);

  const { description, find } = keyDescription;
  const rootOfTrust = find("rootOfTrust");
  const { attestedPackage, signatureDigests } = readApplication(find);
  return {
    record: {
      root: findRoot(certificates, now),
      securityLevel: SECURITY_LEVELS[description.attestationSecurityLevel] ?? "software",
      keymintSecurityLevel: SECURITY_LEVELS[description.keymasterSecurityLevel] ?? "software",
      verifiedBootState: rootOfTrust ? (BOOT_STATES[rootOfTrust.verifiedBootState] ?? null) : null,
      isBootloaderLocked: rootOfTrust?.deviceLocked ?? null,
      verifiedBootKey: rootOfTrust ? toBuffer(rootOfTrust.verifiedBootKey) : null,
      osVersion: toNumber(find("osVersion")),
      osPatchLevel: toNumber(find("osPatchLevel")),
      vendorPatchLevel: toNumber(find("vendorPatchLevel")),
      bootPatchLevel: toNumber(find("bootPatchLevel")),
      attestedPackage,
    },
    signatureDigests,
    certificates: certificates.map((certificate, position) => ({ serial: serialBytes(certificate.serialNumber), der: chain[position]! })),
  };
}
