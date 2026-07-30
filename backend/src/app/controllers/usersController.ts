import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { publicUploadUrl, removeUploadByUrl } from "../utils/files.ts";
import { serializeProfile } from "../utils/serializers.ts";
import { nonEmptyString } from "../utils/strings.ts";

const profileInclude = {
  avaliacoes_avaliacoes_avaliado_idTousuarios: {
    orderBy: { criado_em: "desc" as const },
    include: { usuarios_avaliacoes_avaliador_idTousuarios: { select: { nome: true } } },
  },
  alugueis_alugueis_locatario_idTousuarios: { select: { status: true } },
  itens: { where: { arquivado: false }, select: { id: true } },
};

export const ownProfile: RequestHandler = async (req, res) => {
  const user = await prisma.usuarios.findUnique({ where: { id: req.user!.id }, include: profileInclude });
  if (!user) throw new HttpError(404, "Usuário não encontrado");
  res.json(serializeProfile(user));
};

export const publicProfile: RequestHandler = async (req, res) => {
  const user = await prisma.usuarios.findUnique({ where: { id: req.params.id }, include: profileInclude });
  if (!user || !user.ativo) throw new HttpError(404, "Usuário não encontrado");
  const profile = serializeProfile(user);
  profile.email = "";
  res.json(profile);
};

export const updateProfile: RequestHandler = async (req, res) => {
  const nome = nonEmptyString(req.body?.nome);
  const bio = typeof req.body?.bio === "string" ? req.body.bio.trim().slice(0, 1000) : undefined;
  const telefone = typeof req.body?.telefone === "string" ? req.body.telefone.trim().slice(0, 20) : undefined;
  if (!nome) throw new HttpError(422, "Nome é obrigatório");
  const user = await prisma.usuarios.update({
    where: { id: req.user!.id },
    data: { nome, ...(bio !== undefined ? { bio } : {}), ...(telefone !== undefined ? { telefone } : {}), atualizado_em: new Date() },
    include: profileInclude,
  });
  res.json(serializeProfile(user));
};

export const uploadAvatar: RequestHandler = async (req, res) => {
  const file = req.file ?? (req.files && !Array.isArray(req.files) ? Object.values(req.files).flat()[0] : undefined);
  if (!file) throw new HttpError(422, "Envie uma imagem");
  const current = await prisma.usuarios.findUnique({ where: { id: req.user!.id }, select: { foto_url: true } });
  const avatarUrl = publicUploadUrl(file.path);
  await prisma.usuarios.update({ where: { id: req.user!.id }, data: { foto_url: avatarUrl, atualizado_em: new Date() } });
  await removeUploadByUrl(current?.foto_url);
  res.json({ success: true, avatarUrl });
};
