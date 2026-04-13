import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

const ARGON2_ALGORITHM = "argon2id";
const HASH_VERSION = 1;

const defaultPasswordHasherConfig = Object.freeze({
  saltByteLength: 16,
  memory: 65_536,
  passes: 3,
  parallelism: 4,
  tagLength: 32,
});

interface PasswordHasherConfig {
  saltByteLength: number;
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}

interface ParsedPasswordHash {
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
  salt: Buffer;
  digest: Buffer;
}

interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

type CreatePasswordHasherOptions = Partial<PasswordHasherConfig>;

const passwordHashPattern =
  /^argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+),l=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

const assertInteger = (label: string, value: number, minimum: number): void => {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(
      `${label} must be an integer greater than or equal to ${minimum}`,
    );
  }
};

const resolveConfig = (
  options: CreatePasswordHasherOptions = {},
): PasswordHasherConfig => {
  const config = {
    saltByteLength:
      options.saltByteLength ?? defaultPasswordHasherConfig.saltByteLength,
    memory: options.memory ?? defaultPasswordHasherConfig.memory,
    passes: options.passes ?? defaultPasswordHasherConfig.passes,
    parallelism: options.parallelism ?? defaultPasswordHasherConfig.parallelism,
    tagLength: options.tagLength ?? defaultPasswordHasherConfig.tagLength,
  };

  assertInteger("saltByteLength", config.saltByteLength, 8);
  assertInteger("memory", config.memory, 16);
  assertInteger("passes", config.passes, 2);
  assertInteger("parallelism", config.parallelism, 2);
  assertInteger("tagLength", config.tagLength, 5);

  if (config.memory <= 8 * config.parallelism) {
    throw new Error("memory must be greater than 8 times the parallelism");
  }

  return Object.freeze(config);
};

const deriveKey = async (
  password: string,
  salt: Buffer,
  config: Omit<PasswordHasherConfig, "saltByteLength">,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    argon2(
      ARGON2_ALGORITHM,
      {
        message: Buffer.from(password, "utf8"),
        nonce: salt,
        parallelism: config.parallelism,
        tagLength: config.tagLength,
        memory: config.memory,
        passes: config.passes,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(Buffer.from(derivedKey));
      },
    );
  });

const serializePasswordHash = (
  digest: Buffer,
  salt: Buffer,
  config: Omit<PasswordHasherConfig, "saltByteLength">,
): string =>
  `${ARGON2_ALGORITHM}$v=${HASH_VERSION}$m=${config.memory},t=${config.passes},p=${config.parallelism},l=${config.tagLength}$${salt.toString("base64url")}$${digest.toString("base64url")}`;

const parseInteger = (rawValue: string, label: string): number => {
  const value = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid password hash ${label}`);
  }

  return value;
};

const getCapture = (match: RegExpExecArray, index: number): string => {
  const value = match[index];

  if (value === undefined) {
    throw new Error("Invalid password hash format");
  }

  return value;
};

const parsePasswordHash = (passwordHash: string): ParsedPasswordHash => {
  const match = passwordHashPattern.exec(passwordHash);

  if (!match) {
    throw new Error("Invalid password hash format");
  }

  const versionRaw = getCapture(match, 1);
  const memoryRaw = getCapture(match, 2);
  const passesRaw = getCapture(match, 3);
  const parallelismRaw = getCapture(match, 4);
  const tagLengthRaw = getCapture(match, 5);
  const saltRaw = getCapture(match, 6);
  const digestRaw = getCapture(match, 7);
  const version = parseInteger(versionRaw, "version");

  if (version !== HASH_VERSION) {
    throw new Error("Unsupported password hash version");
  }

  const memory = parseInteger(memoryRaw, "memory");
  const passes = parseInteger(passesRaw, "passes");
  const parallelism = parseInteger(parallelismRaw, "parallelism");
  const tagLength = parseInteger(tagLengthRaw, "tag length");
  const salt = Buffer.from(saltRaw, "base64url");
  const digest = Buffer.from(digestRaw, "base64url");

  assertInteger("memory", memory, 16);
  assertInteger("passes", passes, 2);
  assertInteger("parallelism", parallelism, 2);
  assertInteger("tagLength", tagLength, 5);

  if (memory <= 8 * parallelism) {
    throw new Error("Invalid password hash memory setting");
  }

  if (salt.length < 8) {
    throw new Error("Invalid password hash salt");
  }

  if (digest.length !== tagLength) {
    throw new Error("Invalid password hash digest length");
  }

  return {
    memory,
    passes,
    parallelism,
    tagLength,
    salt,
    digest,
  };
};

export const createPasswordHasher = (
  options: CreatePasswordHasherOptions = {},
): PasswordHasher => {
  const config = resolveConfig(options);

  return {
    hash: async (password) => {
      const salt = randomBytes(config.saltByteLength);
      const digest = await deriveKey(password, salt, config);

      return serializePasswordHash(digest, salt, config);
    },
    verify: async (password, passwordHash) => {
      const parsedHash = parsePasswordHash(passwordHash);
      const derivedKey = await deriveKey(password, parsedHash.salt, {
        memory: parsedHash.memory,
        passes: parsedHash.passes,
        parallelism: parsedHash.parallelism,
        tagLength: parsedHash.tagLength,
      });

      return timingSafeEqual(derivedKey, parsedHash.digest);
    },
  };
};

export type {
  CreatePasswordHasherOptions,
  PasswordHasher,
  PasswordHasherConfig,
};

export const passwordHasher = createPasswordHasher();
