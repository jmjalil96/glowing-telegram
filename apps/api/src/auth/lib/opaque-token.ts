import { createHash, randomBytes } from "node:crypto";

const DEFAULT_TOKEN_BYTE_LENGTH = 32;
const DEFAULT_TOKEN_HASH_ALGORITHM = "sha256";

interface OpaqueTokenIssue {
  token: string;
  tokenHash: string;
}

interface OpaqueTokenService {
  generate(): string;
  hash(token: string): string;
  issue(): OpaqueTokenIssue;
}

interface CreateOpaqueTokenServiceOptions {
  tokenByteLength?: number;
}

const assertTokenByteLength = (tokenByteLength: number): void => {
  if (!Number.isInteger(tokenByteLength) || tokenByteLength < 16) {
    throw new Error(
      "tokenByteLength must be an integer greater than or equal to 16",
    );
  }
};

export const createOpaqueTokenService = (
  options: CreateOpaqueTokenServiceOptions = {},
): OpaqueTokenService => {
  const tokenByteLength = options.tokenByteLength ?? DEFAULT_TOKEN_BYTE_LENGTH;

  assertTokenByteLength(tokenByteLength);

  return {
    generate: () => randomBytes(tokenByteLength).toString("base64url"),
    hash: (token) =>
      createHash(DEFAULT_TOKEN_HASH_ALGORITHM)
        .update(token, "utf8")
        .digest("hex"),
    issue: () => {
      const token = randomBytes(tokenByteLength).toString("base64url");

      return {
        token,
        tokenHash: createHash(DEFAULT_TOKEN_HASH_ALGORITHM)
          .update(token, "utf8")
          .digest("hex"),
      };
    },
  };
};

export type {
  CreateOpaqueTokenServiceOptions,
  OpaqueTokenIssue,
  OpaqueTokenService,
};

export const opaqueTokenService = createOpaqueTokenService();
