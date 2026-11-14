import { z } from "zod";

export const positivePageSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.int().positive());
export const optionalPageSchema = (fallback: number) => positivePageSchema.optional().transform(value => value ?? fallback);
export const moneyFilterSchema = z.string().trim().min(1).transform(Number).pipe(z.number().finite().nonnegative());
export const coordinateSchema = z.string().trim().min(1).transform(Number).pipe(z.number().finite());
export const booleanQuerySchema = z.enum(["true", "false"]).transform(value => value === "true");
