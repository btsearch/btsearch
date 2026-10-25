import { X509Certificate, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { serialBytes, verifyAttestation } from "../../../../src/features/measurements/attestation/verify.js";

function readChain(name: string): Buffer[] {
  const pem = readFileSync(new URL(`../../../fixtures/attestation/${name}`, import.meta.url), "utf8");
  return [...pem.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/g)].map((match) =>
    Buffer.from(match[1]!.replace(/\s+/g, ""), "base64"),
  );
}

function leafKey(chain: readonly Buffer[]): Buffer {
  return new X509Certificate(chain[0]!).publicKey.export({ type: "spki", format: "der" });
}

const ecRootChain = readChain("ec-root-tee.pem");
const ecRootChallenge = Buffer.from("6417f92c-daef-4cc1-8828-5bb39338ffd5");
const rsaRootChain = readChain("rsa-root-tee.pem");
const rsaRootChallenge = Buffer.from("d688d763-6118-4ca6-94b2-e6cd9ed7e4e4");

describe("verifyAttestation", () => {
  it("reads a Pixel's TEE attestation that ends at Google's EC root", async () => {
    const attestation = await verifyAttestation(ecRootChain, ecRootChallenge, leafKey(ecRootChain), new Date("2026-03-01T00:00:00Z"));

    expect(attestation.record).toEqual({
      root: "googleEc",
      securityLevel: "trustedEnvironment",
      keymintSecurityLevel: "trustedEnvironment",
      verifiedBootState: "verified",
      isBootloaderLocked: true,
      verifiedBootKey: expect.any(Buffer),
      osVersion: 160000,
      osPatchLevel: 202602,
      vendorPatchLevel: 20260205,
      bootPatchLevel: 20260205,
      attestedPackage: "com.google.android.attestation",
    });
    expect(attestation.signatureDigests).toEqual([Buffer.from("EDk47kU35Z6O55L2VFBPuDRvxrNG0LvEQV/DOfz8jsE=", "base64")]);
    expect(attestation.certificates.map((certificate) => certificate.der)).toEqual(ecRootChain);
  });

  it("recognises Google's RSA root while every certificate below it is within its dates", async () => {
    const attestation = await verifyAttestation(rsaRootChain, rsaRootChallenge, leafKey(rsaRootChain), new Date("2025-10-01T00:00:00Z"));
    expect(attestation.record.root).toBe("googleRsa");
  });

  it("counts a chain with an expired certificate as a chain to an unknown root", async () => {
    const attestation = await verifyAttestation(rsaRootChain, rsaRootChallenge, leafKey(rsaRootChain), new Date("2026-01-01T00:00:00Z"));
    expect(attestation.record.root).toBe("unknown");
  });

  it("keeps a software attestation, whose root is not Google's", async () => {
    const chain = readChain("software-attestation.pem");
    const attestation = await verifyAttestation(chain, Buffer.from("challenge"), leafKey(chain), new Date("2020-01-01T00:00:00Z"));
    expect(attestation.record).toMatchObject({ root: "unknown", securityLevel: "software" });
  });

  const otherKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "der" });
  it.each([
    {
      name: "another challenge",
      chain: ecRootChain,
      challenge: Buffer.from("another"),
      key: leafKey(ecRootChain),
      field: "certificateChain/0",
      message: "Attests another challenge than `challenge`",
    },
    {
      name: "another key",
      chain: ecRootChain,
      challenge: ecRootChallenge,
      key: otherKey,
      field: "certificateChain/0",
      message: "Attests another key than `publicKey`",
    },
    {
      name: "a missing intermediate",
      chain: [ecRootChain[0]!, ...ecRootChain.slice(2)],
      challenge: ecRootChallenge,
      key: leafKey(ecRootChain),
      field: "certificateChain/0",
      message: "Not signed by the next certificate of the chain",
    },
    {
      name: "a leaf without the attestation extension",
      chain: ecRootChain.slice(1),
      challenge: ecRootChallenge,
      key: leafKey(ecRootChain),
      field: "certificateChain/0",
      message: "Has no key attestation extension",
    },
    {
      name: "bytes that are no certificate",
      chain: [Buffer.from("not a certificate")],
      challenge: ecRootChallenge,
      key: otherKey,
      field: "certificateChain/0",
      message: "Not an X.509 certificate in DER",
    },
  ])("refuses a chain with $name", async ({ chain, challenge, key, field, message }) => {
    await expect(verifyAttestation(chain, challenge, key, new Date("2026-03-01T00:00:00Z"))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: [{ field, validationMessage: message }],
    });
  });
});

describe("serialBytes", () => {
  it("gives a serial with leading zeros the same bytes as Google's revocation list, which drops them", () => {
    expect(serialBytes("0388266760658996860d")).toEqual(serialBytes("388266760658996860d"));
  });
});
