import { describe, it, expect, beforeAll, vi } from "vitest";
import { createCipheriv, randomBytes } from "crypto";
import { encrypt, decrypt } from "@/lib/encryption";

const KEY_HEX = "a".repeat(64);

/** Produce a payload in the pre-GCM `iv:ciphertext` CBC format. */
function legacyEncrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(KEY_HEX, "hex"), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${enc.toString("hex")}`;
}

describe("encryption", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = KEY_HEX; // 32 bytes hex
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("round-trips a string", () => {
    const plaintext = "sk-test-key-12345";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(":")).toHaveLength(3); // iv:tag:ciphertext
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for same input", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same-value");
    expect(decrypt(b)).toBe("same-value");
  });

  it("still reads legacy aes-256-cbc payloads", () => {
    expect(decrypt(legacyEncrypt("old-secret"))).toBe("old-secret");
  });

  it("returns null for empty/null input to decrypt", () => {
    expect(decrypt("")).toBeNull();
    expect(decrypt(null)).toBeNull();
    expect(decrypt(undefined)).toBeNull();
  });

  it("returns null instead of throwing on tampered or malformed input", () => {
    const encrypted = encrypt("secret");
    const [iv, tag, ct] = encrypted.split(":");
    // flip a byte of the ciphertext — GCM's auth tag must reject it
    const flipped = ct.slice(0, -2) + (ct.slice(-2) === "00" ? "01" : "00");
    expect(decrypt(`${iv}:${tag}:${flipped}`)).toBeNull();
    expect(decrypt("not-encrypted-at-all")).toBeNull();
    expect(decrypt("zz:zz:zz")).toBeNull();
  });

  it("returns null when decrypting under a different key", () => {
    const encrypted = encrypt("secret");
    process.env.ENCRYPTION_KEY = "b".repeat(64);
    expect(decrypt(encrypted)).toBeNull();
    process.env.ENCRYPTION_KEY = KEY_HEX;
  });
});
