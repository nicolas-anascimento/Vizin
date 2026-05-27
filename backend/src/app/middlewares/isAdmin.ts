import type { Response, Request, NextFunction } from "express";
import parsedEnv from "../config/env.ts";
import jwt from "jsonwebtoken";

async function isAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.cookies.token) {
    res.redirect("/");
    return;
  }
  const token = req.cookies.token;
    const user = jwt.verify(token, parsedEnv!.JWT_KEY!) as jwt.JwtPayload

  if (user.tipo !== "admin") {
    res.redirect("/");
    return;
  }

  next();
}

export default isAdmin;
