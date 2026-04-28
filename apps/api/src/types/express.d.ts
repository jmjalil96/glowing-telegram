import type { Logger } from "pino";
import type { RequestAuth } from "../modules/identity/domain/request-auth.js";

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuth | null;
      log: Logger;
      requestId: string;
    }
  }
}

export {};
