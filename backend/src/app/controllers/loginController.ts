import type { Request, Response, CookieOptions } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import parsedEnv from "../config/env.ts";
import validator from "validator";
import prisma from "../config/database.ts";

interface loginObj {
    login(req: Request, res: Response): Promise<void>;
    register(req: Request, res: Response): Promise<void>;
    logout(req: Request, res: Response): Promise<void>;
}

const Login: loginObj = {
    async login(req, res) {
        if (!req.body) {
            res.status(400).json({
                error: "no data",
            });
            return;
        }
        const { email, senha } = req.body;

        try {
            const user = await prisma.usuarios.findUnique({
                where: { email: email },
            });

            if (!user) {
                res.status(400).json({
                    error: "password or email are wrong",
                });
                return;
            }


            if (!(await bcrypt.compare(senha, user.senha_hash))) {
                res.status(401).json();
                return;
            }
            const buffer = {
                id: user.id,
                email: user.email,
                tipo: user.tipo,
            };
            const token = jwt.sign(buffer, parsedEnv!.JWT_KEY!);
            const cookieConfig: CookieOptions =
                parsedEnv!.NODE_ENV === "dev"
                    ? {
                          httpOnly: true,
                          sameSite: "lax",
                          secure: false,
                          maxAge: 30 * 24 * 60 * 60 * 1000,
                      }
                    : {
                          httpOnly: true,
                          sameSite: "strict",
                          secure: true,
                          maxAge: 30 * 24 * 60 * 60 * 1000,
                      };

            res.cookie("token", token, cookieConfig);
            if (user.tipo === "admin") {
                res.json({
                    success: true,
                    tipo: "admin",
                });
                return;
            } else {
                res.json({
                    success: true,
                });
                return;
            }
        } catch (err) {
            console.log(err);
            res.status(400).json({
                error: "error",
                success: false,
            });
            return;
        }
    },
    async register(req, res) {
        const { email, senha, nome } = req.body;

        try {
            const senha_hash = await bcrypt.hash(senha, 10);

            await prisma.usuarios.create({
                data: {
                    email: email,
                    senha_hash: senha_hash,
                    nome: nome,
                },
            });
        } catch (err) {
            res.json(err);
            return;
        }
    },

    async logout(_req, res) {
        const cookieVerify = validator.isEmpty(_req.cookies.token);

        if (cookieVerify) {
            res.status(400).json({
                error: "alread without account",
            });
            return;
        }

        const cookieConfig: CookieOptions =
            parsedEnv!.NODE_ENV === "dev"
                ? {
                      httpOnly: true,
                      sameSite: "lax",
                      secure: false,
                      maxAge: 30 * 24 * 60 * 60 * 1000,
                  }
                : {
                      httpOnly: true,
                      sameSite: "strict",
                      secure: true,
                      maxAge: 30 * 24 * 60 * 60 * 1000,
                  };
        res.clearCookie("token", cookieConfig);
        res.json();
        return;
    },
};

export default Login;
