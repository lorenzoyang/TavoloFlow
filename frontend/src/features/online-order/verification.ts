import { sha256 } from "@noble/hashes/sha2.js";
import { isUuid } from "../../lib/ids.ts";

// A hash, rather than the request ID itself: that ID is the credential for GET recovery.
export function verificationBinding(restaurantId: string, requestId: string): string {
  if (!isUuid(restaurantId) || !isUuid(requestId)) throw new Error("Invalid verification context");
  const input = `${restaurantId.replaceAll("-", "").toLowerCase()}:${requestId.replaceAll("-", "").toLowerCase()}`;
  return Array.from(sha256(new TextEncoder().encode(input)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export type VerificationProof = { token: string; context: string };
export const verificationContext = (siteKey: string, binding: string, language: string) =>
  `${siteKey}:${binding}:${language}`;
export function verificationToken(proof: VerificationProof | null, context: string): string | null {
  return proof?.context === context && proof.token.length > 0 && proof.token.length <= 2048
    ? proof.token
    : null;
}
