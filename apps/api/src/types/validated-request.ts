import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export interface RequestValidationSchemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

type SchemaOutput<TSchema> =
  TSchema extends ZodType<infer Output, unknown> ? Output : never;
type EmptySection = Record<never, never>;

type ValidatedSection<
  Schemas extends RequestValidationSchemas,
  Key extends keyof RequestValidationSchemas,
> = Schemas[Key] extends ZodType
  ? {
      [Section in Key]: SchemaOutput<Schemas[Key]>;
    }
  : EmptySection;

export type ValidatedInput<
  Schemas extends RequestValidationSchemas = RequestValidationSchemas,
> = ValidatedSection<Schemas, "params"> &
  ValidatedSection<Schemas, "query"> &
  ValidatedSection<Schemas, "body">;

export type ValidatedRouteHandler<
  Schemas extends RequestValidationSchemas = RequestValidationSchemas,
> = (
  input: ValidatedInput<Schemas>,
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;
