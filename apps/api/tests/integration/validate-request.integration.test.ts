import express from "express";
import { z } from "zod";
import request from "supertest";
import { pinoHttp } from "pino-http";
import { beforeAll, describe, expect, it } from "vitest";

import { logger } from "../../src/lib/logger.js";
import { errorHandlerMiddleware } from "../../src/middlewares/error-handler.js";
import { requestIdMiddleware } from "../../src/middlewares/request-id.js";
import { route } from "../../src/middlewares/validate-request.js";

interface ValidationErrorDetail {
  source: "params" | "query" | "body";
  path: string;
  message: string;
  code: string;
}

interface ValidationErrorResponseBody {
  error: {
    code: string;
    message: string;
    details: ValidationErrorDetail[];
    requestId: string;
  };
}

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

describe("validated route integration", () => {
  let app: express.Express;

  beforeAll(() => {
    logger.level = "silent";
    app = express();
    app.use(requestIdMiddleware);
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.requestId,
        customProps: (req) => ({
          requestId: req.requestId,
        }),
      }),
    );
    app.use(express.json());
    app.post(
      "/widgets/:widgetId",
      route(widgetRequestSchema, (input, _req, res) => {
        res.status(200).json(input);
      }),
    );
    app.use(errorHandlerMiddleware);
  });

  it("returns VALIDATION_ERROR for invalid params", async () => {
    const response = await request(app)
      .post("/widgets/not-a-number?page=1")
      .send({
        name: "Widget",
        active: true,
      });
    const body = response.body as ValidationErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toContainEqual(
      expect.objectContaining({
        source: "params",
        path: "widgetId",
        code: "invalid_type",
      }),
    );
  });

  it("returns VALIDATION_ERROR for invalid query", async () => {
    const response = await request(app).post("/widgets/1?page=zero").send({
      name: "Widget",
      active: true,
    });
    const body = response.body as ValidationErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toContainEqual(
      expect.objectContaining({
        source: "query",
        path: "page",
        code: "invalid_type",
      }),
    );
  });

  it("returns VALIDATION_ERROR for invalid body", async () => {
    const response = await request(app).post("/widgets/1?page=1").send({
      name: "",
      active: true,
    });
    const body = response.body as ValidationErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toContainEqual(
      expect.objectContaining({
        source: "body",
        path: "name",
        code: "too_small",
      }),
    );
  });

  it("aggregates params, query, and body validation details", async () => {
    const response = await request(app).post("/widgets/zero?page=nope").send({
      name: "",
      active: "yes",
    });
    const body = response.body as ValidationErrorResponseBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "params",
          path: "widgetId",
        }),
        expect.objectContaining({
          source: "query",
          path: "page",
        }),
        expect.objectContaining({
          source: "body",
          path: "name",
        }),
        expect.objectContaining({
          source: "body",
          path: "active",
        }),
      ]),
    );
  });

  it("passes parsed input to the route handler", async () => {
    const response = await request(app).post("/widgets/42?page=2").send({
      name: "Widget",
      active: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      params: {
        widgetId: 42,
      },
      query: {
        page: 2,
      },
      body: {
        name: "Widget",
        active: false,
      },
    });
  });
});
