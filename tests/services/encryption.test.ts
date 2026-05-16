import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/encryption";

describe("encryption", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64); // 32 bytes hex
  });

  it("round-trips a string", () => {
    const plaintext = "sk-test-key-12345";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":"); // iv:ciphertext format
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for same input", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same-value");
    expect(decrypt(b)).toBe("same-value");
  });

  it("returns null for empty/null input to decrypt", () => {
    expect(decrypt("")).toBeNull();
    expect(decrypt(null as unknown as string)).toBeNull();
  });
});
