import type { Request, Response } from "express";
import type { CookieOptions } from "express";
import validator from "validator";
import { User } from "../model/index.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import env from "../config/env.ts";
import type {
  userDataType,
  userBodyLoginType,
  userBodyRegisterType,
} from "../types/types.ts";


const loginController = {
  async login(req: Request, res: Response) {
    const body: userBodyLoginType = req.body;

    if (!body) {
      return res.status(401).json({
        forbidden: true,
        error: "no Data",
      });
    }

    const userData = (await User.findOne({
      where: {
        email: body.email,
      },
      raw: true,
      nest: true,
    })) as userDataType | null;

    if (!userData) {
      return res.status(401).json({
        forbidden: true,
        error: "password or email",
      });
    }

    const passwordValid = await bcrypt.compare(
      body.password,
      userData.password,
    );

    if (!passwordValid) {
      return res.status(401).json({
        forbidden: true,
        error: "password or email",
      });
    }
    const buffer = {
      id: userData.id,
      user: userData.name,
    };
    const token = jwt.sign(buffer, env!.JWT_KEY!, {expiresIn: "30d"});

    let cookieConfig: CookieOptions;

    if (env!.NODE_ENV === "dev") {
      cookieConfig = {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      };
    } else {
      cookieConfig = {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      };
    }

    res.cookie("token", token, cookieConfig);

    res.json({
      Accepted: true,
    });
  },

  async register(req: Request, res: Response) {
    const data: userBodyRegisterType = req.body;

    if (!data) {
      return res.status(400).json({
        error: "no data",
      });
    }
    if (!data.password || !data.email) {
      return res.status(400).json({
        error: "missin fields",
      });
    }
    if (!validator.isEmail(data.email)) {
      return res.status(400).json({
        error: "email invalid",
      });
    }
    const searchEmail = await User.findOne({
      where: { email: data.email },
      raw: true,
      nest: true,
    });
    // log(searchEmail);
    if (searchEmail) {
      return res.status(409).json({
        error: "account alread exists",
      });
    }

    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(data.password, 10);
    } catch (err) {
      return res.status(400).json({
        error: "Failed to hash password",
      });
    }
    data.password = passwordHash;
    const user = await User.create(data);

    res.status(201).json({
      sucess: true,
    });
  },
};

export default loginController;
