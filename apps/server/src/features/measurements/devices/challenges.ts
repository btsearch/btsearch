import type { DeviceChallenge } from "@openbts/shared/contract";
import { createHash, randomBytes } from "node:crypto";

import redis from "../../../database/redis.js";
import { ValidationError } from "../../../errors.js";

const CHALLENGE_BYTES = 32;
const CHALLENGE_TTL_SECONDS = 600;

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function challengeKey(challenge: Buffer): string {
  return `measurements:device-challenge:${sha256Hex(challenge)}`;
}

function usedChallengeKey(challenge: Buffer): string {
  return `measurements:device-challenge-used:${sha256Hex(challenge)}`;
}

function issuedTo(userId: string, clientId: string): string {
  return `${userId} ${clientId}`;
}

function usedBy(userId: string, clientId: string, publicKey: Buffer): string {
  return `${issuedTo(userId, clientId)} ${sha256Hex(publicKey)}`;
}

export async function issueDeviceChallenge(userId: string, clientId: string): Promise<DeviceChallenge> {
  const challenge = randomBytes(CHALLENGE_BYTES);
  await redis.setEx(challengeKey(challenge), CHALLENGE_TTL_SECONDS, issuedTo(userId, clientId));
  return { challenge: challenge.toString("base64url"), expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString() };
}

export async function useDeviceChallenge(challenge: Buffer, userId: string, clientId: string, publicKey: Buffer): Promise<void> {
  const recipient = await redis.getDel(challengeKey(challenge));
  if (recipient === issuedTo(userId, clientId)) {
    await redis.setEx(usedChallengeKey(challenge), CHALLENGE_TTL_SECONDS, usedBy(userId, clientId, publicKey));
    return;
  }

  const isRetryWithSameKey = recipient === null && (await redis.get(usedChallengeKey(challenge))) === usedBy(userId, clientId, publicKey);
  if (!isRetryWithSameKey) {
    throw new ValidationError([{ field: "challenge", validationMessage: "Unknown, expired or used by another key. Ask for a new challenge" }]);
  }
}
