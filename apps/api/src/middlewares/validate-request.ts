import type { RequestHandler } from "express";
import type { ZodIssue } from "zod";

import { AppError } from "../errors/app-error.js";
import type {
  RequestValidationSchemas,
  ValidatedInput,
  ValidatedRouteHandler,
} from "../types/validated-request.js";

type ValidationSource = keyof RequestValidationSchemas;

interface ValidationErrorDetail {
  source: ValidationSource;
  path: string;
  message: string;
  code: string;
}

const getValidationDetails = (
  source: ValidationSource,
  result:
    | { success: true }
    | { success: false; error: { issues: ZodIssue[] } }
    | undefined,
): ValidationErrorDetail[] => {
  if (!result || result.success) {
    return [];
  }

  return result.error.issues.map((issue: ZodIssue) => ({
    source,
    path: issue.path.map(String).join("."),
    message: issue.message,
    code: issue.code,
  }));
};

const parseRequestInput = async <Schemas extends RequestValidationSchemas>(
  schemas: Schemas,
  req: Parameters<RequestHandler>[0],
): Promise<ValidatedInput<Schemas>> => {
  const [paramsResult, queryResult, bodyResult] = await Promise.all([
    schemas.params?.safeParseAsync(req.params),
    schemas.query?.safeParseAsync(req.query),
    schemas.body?.safeParseAsync(req.body),
  ]);

  const details = [
    ...getValidationDetails("params", paramsResult),
    ...getValidationDetails("query", queryResult),
    ...getValidationDetails("body", bodyResult),
  ];

  if (details.length > 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      details,
    );
  }

  return Object.assign(
    {},
    paramsResult && paramsResult.success
      ? {
          params: paramsResult.data,
        }
      : {},
    queryResult && queryResult.success
      ? {
          query: queryResult.data,
        }
      : {},
    bodyResult && bodyResult.success
      ? {
          body: bodyResult.data,
        }
      : {},
  ) as ValidatedInput<Schemas>;
};

export const route = <Schemas extends RequestValidationSchemas>(
  schemas: Schemas,
  handler: ValidatedRouteHandler<Schemas>,
): RequestHandler => {
  return async (req, res, next) => {
    try {
      const input = await parseRequestInput(schemas, req);
      await handler(input, req, res, next);
    } catch (error) {
      next(error);
    }
  };
};
