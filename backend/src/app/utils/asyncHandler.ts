import type { NextFunction, Request, RequestHandler, Response } from "express";

// Encaminha falhas de funções assíncronas ao middleware central de erros.
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
