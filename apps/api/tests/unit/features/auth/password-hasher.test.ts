import { describe, expect, it } from "vitest";

import { createPasswordHasher } from "../../../../src/auth/lib/password-hasher.js";

const testHasher = createPasswordHasher({
  saltByteLength: 16,
  memory: 8_192,
  passes: 2,
  parallelism: 2,
  tagLength: 16,
});

describe("createPasswordHasher", () => {
  it("hashes passwords into versioned argon2id strings and verifies them", async () => {
    const passwordHash = await testHasher.hash("correct horse battery staple");

    expect(passwordHash).toMatch(
      /^argon2id\$v=1\$m=8192,t=2,p=2,l=16\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
    );
    await expect(
      testHasher.verify("correct horse battery staple", passwordHash),
    ).resolves.toBe(true);
  });

  it("returns false when the password does not match", async () => {
    const passwordHash = await testHasher.hash("correct horse battery staple");

    await expect(testHasher.verify("Tr0ub4dor&3", passwordHash)).resolves.toBe(
      false,
    );
  });

  it("generates distinct hashes for the same password", async () => {
    const password = "correct horse battery staple";
    const firstHash = await testHasher.hash(password);
    const secondHash = await testHasher.hash(password);

    expect(firstHash).not.toBe(secondHash);
    await expect(testHasher.verify(password, firstHash)).resolves.toBe(true);
    await expect(testHasher.verify(password, secondHash)).resolves.toBe(true);
  });

  it("rejects unsupported or malformed password hashes", async () => {
    await expect(
      testHasher.verify(
        "correct horse battery staple",
        "argon2id$v=2$m=8192,t=2,p=2,l=16$invalid$invalid",
      ),
    ).rejects.toThrow("Unsupported password hash version");
    await expect(
      testHasher.verify("correct horse battery staple", "not-a-password-hash"),
    ).rejects.toThrow("Invalid password hash format");
  });
});
