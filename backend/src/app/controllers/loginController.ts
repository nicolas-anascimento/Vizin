import db from "../config/database.ts";
import type { Request, Response, CookieOptions } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import parsedEnv from "../config/env.ts";
import validator from "validator";

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

        const { userEmail, password } = req.body;

        try {
            const { rows } = await db.query("SELECT * FROM usuarios WHERE email=$1", [userEmail]);

            if (!rows.length) {
                res.status(400);
                return;
            }

            console.log(rows[0]);
            if (!(await bcrypt.compare(password, rows[0].senha_hash))) {
                res.status(401).json();
                return;
            }
            const buffer = {
                id: rows[0].id,
                email: rows[0].email,
            };
            const token = jwt.sign(buffer, parsedEnv!.JWT_KEY!);
            const cookieConfig: CookieOptions =
                parsedEnv!.NODE_ENV === "dev"
                    ? { httpOnly: true, sameSite: "lax", secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 }
                    : { httpOnly: true, sameSite: "strict", secure: true, maxAge: 30 * 24 * 60 * 60 * 1000 };

            res.cookie("token", token, cookieConfig);
            res.json();
        } catch (err) {
            console.log(err);
            res.status(400).json({
                err,
            });
            return;
        }
    },
    async register(_req, _res) {},

    async logout(_req, res) {
        const cookieVerify = validator.isEmpty(_req.cookies.token);
        
        if(cookieVerify){
            res.status(400).json({
                error: "alread without account"
            })
            return;
        }

        const cookieConfig: CookieOptions =
            parsedEnv!.NODE_ENV === "dev"
                ? { httpOnly: true, sameSite: "lax", secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 }
                : { httpOnly: true, sameSite: "strict", secure: true, maxAge: 30 * 24 * 60 * 60 * 1000 };
        res.clearCookie("token", cookieConfig);
        res.json()
        return;
    },
};

export default Login;
