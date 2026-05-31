import type { Request, Response } from "express";
// import bcrypt from "bcrypt";
import prisma from "../config/database.ts";
import { createHash, randomBytes, type BinaryLike } from "crypto";
import transporter from "../config/mailer.ts";
import parsedEnv from "../config/env.ts";

const AccountController = {
    async requestResetPassword(req: Request, res: Response) {
        if (!req.body.email) {
            res.status(400).json({
                error: "sem body",
            });
            return;
        }
        const { email } = req.body;

        const user = await prisma.usuarios.findUnique({ where: { email: email } });

        if (!user) {
            res.json({
                error: "Se o usuário existir, iremos lhe enviar um email",
            });
            return;
        }

        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");

        await prisma.resetar_Senha.deleteMany({ where: { userId: user.id } });

        await prisma.resetar_Senha.create({
            data: {
                userId: user.id,
                token: tokenHash,
                expire_in: new Date(Date.now() + 60 * 60 * 1000),
            },
        });

        const url = `http://localhost:8080/resetar-senha?token=${token}`;

        // console.log(url);
        // console.log(user);

        await transporter.sendMail({
            from: parsedEnv!.EMAIL_TRANSPORT,
            to: email,
            subject: "Recuperação de senha",
            html: `
                <h2>Recuperação de senha</h2>
                <p>Clique no link abaixo para redefinir sua senha:</p>
                <a href="${url}">Redefinir senha</a>
                <p>Este link expira em 1 hora.</p>
            `,
        });

        res.status(200).json({});
    },
};

export default AccountController;
