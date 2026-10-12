import { serializeUser } from "../utils/serializers.ts";
import type { CookieOptions, RequestHandler } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/database.ts";
import env from "../config/env.ts";
import { HttpError } from "../utils/httpError.ts";
import { cpf, email as validEmail, password, text } from "../utils/validation.ts";

// Define cookie de sessão inacessível a JavaScript e ajusta SameSite, HTTPS e validade por ambiente.
export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.COOKIE_SAME_SITE,
    secure: env.NODE_ENV === "production" || env.APP_URL.startsWith("https://"),
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

// Assina identidade, papel e versão da sessão em JWT com expiração de 30 dias.
function signToken(user: { id: string; email: string; tipo: "admin" | "usuario"; tokenVersion: number }): string {
  return jwt.sign(user, env.JWT_KEY, { expiresIn: "30d" });
}

// Valida cadastro, rejeita email existente e armazena apenas o hash bcrypt da senha; devolve perfil seguro.
export const register: RequestHandler = async (req, res) => {
  const nome = text(req.body?.nome, "Nome", 100);
  const email = validEmail(req.body?.email);
  const senha = password(req.body?.senha);
  const documento = cpf(req.body?.cpf);
  const phoneValue = req.body?.telefone ?? req.body?.whatsapp;
  const telefone = typeof phoneValue === "string" && !phoneValue.trim() ? undefined : phoneValue;
  if (telefone !== undefined && (typeof telefone !== "string" || !/^[+()\d\s-]{8,20}$/.test(telefone))) throw new HttpError(422, "Telefone inválido");
  const exists = await prisma.usuarios.findUnique({ where: { email } });
  if (exists) throw new HttpError(409, "Este email já está cadastrado");
  const user = await prisma.usuarios.create({
    data: { nome, email, cpf: documento, telefone: telefone ?? null, senha_hash: await bcrypt.hash(senha, 12) },
    select: { id: true, nome: true, email: true, cpf: true, telefone: true, tipo: true },
  });
  await prisma.notificacoes_admin.create({ data: { tipo: "novo_usuario", categoria: "usuarios", prioridade: "normal", titulo: "Novo usuário", mensagem: "Uma nova conta foi cadastrada.", referencia_tipo: "usuario", referencia_id: user.id, chave_deduplicacao: `novo_usuario:${user.id}` } });
  res.status(201).json({ success: true, message: "Conta criada com sucesso", usuario: serializeUser(user,true) });
};

// Confere CPF e senha. Conta suspensa mantém acesso ao canal restrito de sessão/suporte.
export const login: RequestHandler = async (req, res) => {
  const documento = cpf(req.body?.cpf);
  const senha = typeof req.body?.senha === "string" ? req.body.senha : null;
  if (!senha || Buffer.byteLength(senha) > 72) throw new HttpError(422, "Senha obrigatória");
  const user = await prisma.usuarios.findUnique({ where: { cpf: documento } });
  if (!user || !(await bcrypt.compare(senha, user.senha_hash))) {
    throw new HttpError(401, "CPF ou senha inválidos");
  }
  const token = signToken({ id: user.id, email: user.email, tipo: user.tipo, tokenVersion: user.token_version });
  res.cookie("token", token, cookieOptions());
  res.json({
    success: true,
    tipo: user.tipo,
    token,
    usuario: serializeUser(user,true),
    conta_suspensa: !user.ativo,
  });
};

// Incrementa a versão do token para invalidar sessões emitidas antes do logout e limpa o cookie.
export const logout: RequestHandler = async (req, res) => {
  if (req.user) await prisma.usuarios.update({ where: { id: req.user.id }, data: { token_version: { increment: 1 } } });
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie("token", options);
  res.json({ success: true });
};

// Retorna o perfil atualizado no banco para uma sessão já autenticada pelo middleware.
export const session: RequestHandler = async (req, res) => {
  if (!req.user) throw new HttpError(401, "Sessão inválida");
  const user = await prisma.usuarios.findUnique({
    where: { id: req.user.id },
    select: { id: true, nome: true, email: true, cpf: true, telefone: true, tipo: true, foto_url: true, bio: true, verificado: true },
  });
  if (!user) throw new HttpError(404, "Usuário não encontrado");
  const approved = await prisma.verificacoes_identidade.count({ where: { usuario_id: user.id, status: "aprovado", revogada: false } });
  res.json({ ...serializeUser({ ...user, verificado: approved > 0 },true), ativo: req.user.ativo });
};
