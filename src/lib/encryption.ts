import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
/** Payloads written before the GCM switch are `iv:ciphertext` with no auth tag. */
const LEGACY_ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/** AES-256-GCM. Format: `iv:authTag:ciphertext`, all hex. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a value produced by `encrypt` (or by the older CBC scheme).
 * Returns `null` — never throws — when the value is missing, malformed, tampered with,
 * or was encrypted under a different key, so a bad stored secret can't 500 a request.
 */
export function decrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  const parts = ciphertext.split(":");
  try {
    if (parts.length === 3) {
      const [ivHex, tagHex, encHex] = parts;
      const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
    }
    if (parts.length === 2) {
      const [ivHex, encHex] = parts;
      const decipher = createDecipheriv(LEGACY_ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
      return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
    }
  } catch (error) {
    console.error("[encryption] decrypt failed:", error instanceof Error ? error.message : error);
  }
  return null;
}
