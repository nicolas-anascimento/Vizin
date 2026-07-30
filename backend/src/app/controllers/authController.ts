import type { CookieOptions, RequestHandler } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/database.ts";
import env from "../config/env.ts";
import { HttpError } from "../utils/httpError.ts";
import { nonEmptyString } from "../utils/strings.ts";

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https://"),
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function signToken(user: { id: string; email: string; tipo: "admin" | "usuario"; tokenVersion: number }): string {
  return jwt.sign(user, env.JWT_KEY, { expiresIn: "30d" });
}

export const register: RequestHandler = async (req, res) => {
  const nome = nonEmptyString(req.body?.nome);
  const email = nonEmptyString(req.body?.email)?.toLowerCase();
  const senha = nonEmptyString(req.body?.senha);
  if (!nome || !email || !senha) throw new HttpError(422, "Nome, email e senha são obrigatórios");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(422, "Email inválido");
  if (senha.length < 8) throw new HttpError(422, "A senha deve ter pelo menos 8 caracteres");
  const exists = await prisma.usuarios.findUnique({ where: { email } });
  if (exists) throw new HttpError(409, "Este email já está cadastrado");
  const user = await prisma.usuarios.create({
    data: { nome, email, senha_hash: await bcrypt.hash(senha, 12) },
    select: { id: true, nome: true, email: true, tipo: true },
  });
  res.status(201).json({ success: true, message: "Conta criada com sucesso", usuario: user });
};

export const login: RequestHandler = async (req, res) => {
  const email = nonEmptyString(req.body?.email)?.toLowerCase();
  const senha = nonEmptyString(req.body?.senha);
  if (!email || !senha) throw new HttpError(422, "Email e senha são obrigatórios");
  const user = await prisma.usuarios.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(senha, user.senha_hash))) {
    throw new HttpError(401, "Email ou senha inválidos");
  }
  if (!user.ativo) throw new HttpError(403, "Esta conta está suspensa");
  const token = signToken({ id: user.id, email: user.email, tipo: user.tipo, tokenVersion: user.token_version });
  res.cookie("token", token, cookieOptions());
  res.json({
    success: true,
    tipo: user.tipo,
    token,
    usuario: { id: user.id, nome: user.nome, email: user.email, tipo: user.tipo, avatarUrl: user.foto_url },
  });
};

export const logout: RequestHandler = (_req, res) => {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie("token", options);
  res.json({ success: true });
};

export const session: RequestHandler = async (req, res) => {
  if (!req.user) throw new HttpError(401, "Sessão inválida");
  const user = await prisma.usuarios.findUnique({
    where: { id: req.user.id },
    select: { id: true, nome: true, email: true, tipo: true, foto_url: true, bio: true, verificado: true },
  });
  if (!user) throw new HttpError(404, "Usuário não encontrado");
  res.json({ ...user, avatarUrl: user.foto_url });
};
