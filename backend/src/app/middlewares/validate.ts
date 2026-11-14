import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { HttpError } from "../utils/httpError.ts";

type SchemaSet = { body?: z.ZodType; params?: z.ZodType; query?: z.ZodType };
type Validated<S extends SchemaSet> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

export class InputValidationError extends HttpError {
  readonly erros: Record<string, string[]>;
  constructor(error: z.ZodError) {
    super(422, "Os dados informados são inválidos.", "dados_invalidos");
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "_geral";
      (fields[key] ??= []).push(issue.message);
    }
    this.erros = fields;
  }
}

export function validate<const S extends SchemaSet>(schemas: S): RequestHandler {
  return async (req, _res, next) => {
    const result: Record<string, unknown> = {};
    for (const key of ["params", "query", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const parsed = await schema.safeParseAsync(req[key]);
      if (!parsed.success) {
        next(new InputValidationError(parsed.error));
        return;
      }
      result[key] = parsed.data;
      if (key === "body") req.body = parsed.data;
    }
    req.validated = { ...req.validated, ...result };
    next();
  };
}

// O getter mantém a relação entre o schema e seu tipo de saída sem cast para any.
export function validatedPart<S extends z.ZodType>(req: Request, key: "body" | "params" | "query", schema: S): z.output<S> {
  const parsed = schema.safeParse(key === "query" ? req.query : req.validated?.[key]);
  if (!parsed.success) throw new InputValidationError(parsed.error);
  return parsed.data;
}

export type ValidatedInput<S extends SchemaSet> = Validated<S>;
