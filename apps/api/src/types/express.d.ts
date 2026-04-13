import type { Logger } from "pino";
import type { RequestAuth } from "../auth/types.js";

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
