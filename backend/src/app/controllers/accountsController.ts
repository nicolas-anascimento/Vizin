import type { Request, Response } from "express";
import _bcrypt from "bcrypt";
import _prisma from "../config/database.ts";


const AccountController = {
    async resetPassword(_req: Request, _res: Response): Promise<void> {
        // if(request)

    },
};

export default AccountController;
