import { db } from "../../../platform/database/client.js";
import type { IdentityTransactionRunner } from "../application/ports.js";
import { createPasswordResetTokenRepository } from "./password-reset-token.repository.drizzle.js";
import { createSessionRepository } from "./session.repository.drizzle.js";
import { createUserRepository } from "./user.repository.drizzle.js";

interface CreateIdentityTransactionRunnerOptions {
  db?: Pick<typeof db, "transaction">;
}

export const createIdentityTransactionRunner = (
  options: CreateIdentityTransactionRunnerOptions = {},
): IdentityTransactionRunner => {
  const identityDb = options.db ?? db;

  return {
    transaction: async (callback) =>
      identityDb.transaction(async (transactionDb) => {
        const transactionUserRepository = createUserRepository({
          db: transactionDb,
        });
        const transactionSessionRepository = createSessionRepository({
          db: transactionDb,
        });
        const transactionPasswordResetTokenRepository =
          createPasswordResetTokenRepository({
            db: transactionDb,
          });

        return callback({
          ...transactionUserRepository,
          ...transactionSessionRepository,
          ...transactionPasswordResetTokenRepository,
        });
      }),
  };
};

export type { CreateIdentityTransactionRunnerOptions };
