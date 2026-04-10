import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error.js";

const isInvalidJsonBodyError = (
  error: unknown,
): error is { type: string; status?: number; statusCode?: number } => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    type?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  return (
    candidate.type === "entity.parse.failed" &&
    (candidate.status === 400 || candidate.statusCode === 400)
  );
};

const isPayloadTooLargeError = (
  error: unknown,
): error is { type: string; status?: number; statusCode?: number } => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    type?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  return (
    candidate.type === "entity.too.large" &&
    (candidate.status === 413 || candidate.statusCode === 413)
  );
};

export const errorHandlerMiddleware = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (isInvalidJsonBodyError(error)) {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON body",
        details: [],
        requestId: req.requestId,
      },
    });

    return;
  }

  if (isPayloadTooLargeError(error)) {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body too large",
        details: [],
        requestId: req.requestId,
      },
    });

    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: req.requestId,
      },
    });

    return;
  }

  req.log.error({ err: error, requestId: req.requestId }, "Unhandled error");

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      details: [],
      requestId: req.requestId,
    },
  });
};
