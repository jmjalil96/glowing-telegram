import { setupServer } from "msw/node";

import { defaultMswHandlers } from "../helpers/api-contract";

export const server = setupServer(...defaultMswHandlers);

export const resetMswHandlers = (): void => {
  server.resetHandlers(...defaultMswHandlers);
};
