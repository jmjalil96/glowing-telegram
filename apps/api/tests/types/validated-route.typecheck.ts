import { z } from "zod";

import { route } from "../../src/middlewares/validate-request.js";

const consume = (..._values: unknown[]): void => undefined;

const widgetRequestSchema = {
  params: z.object({
    widgetId: z.coerce.number().int().min(1),
  }),
  query: z.object({
    page: z.coerce.number().int().min(1),
  }),
  body: z.object({
    name: z.string().min(1),
    active: z.boolean(),
  }),
};

void route(widgetRequestSchema, (input, _req, res) => {
  input.params.widgetId.toFixed();
  input.query.page.toFixed();
  input.body.name.toUpperCase();
  input.body.active.valueOf();

  // @ts-expect-error missing properties must not be exposed
  consume(input.body.missing);

  return res.status(200).json(input);
});

void route(
  {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  (input, _req, res) => {
    input.params.id.toUpperCase();

    // @ts-expect-error query should not exist when no query schema is provided
    consume(input.query);

    return res.status(200).json({
      id: input.params.id,
    });
  },
);
