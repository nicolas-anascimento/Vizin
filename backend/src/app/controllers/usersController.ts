import { text } from "../utils/validation.ts";
import { uuid } from "../utils/validation.ts";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { publicUploadUrl, removeUploadByUrl } from "../utils/files.ts";
import { serializeProfile } from "../utils/serializers.ts";

// Relações usadas para avaliações, histórico e contadores exibidos no perfil.
const profileInclude = {
  avaliacoes_avaliacoes_avaliado_idTousuarios: {
    orderBy: { criado_em: "desc" as const },
    include: { usuarios_avaliacoes_avaliador_idTousuarios: { select: { nome: true } } },
  },
  alugueis_alugueis_locador_idTousuarios: { select: { status: true } },
  alugueis_alugueis_locatario_idTousuarios: { select: { status: true } },
  itens: { where: { arquivado: false }, select: { id: true } },
};

// Entrega o perfil completo do usuário autenticado, incluindo os campos privados permitidos.
export const ownProfile: RequestHandler = async (req, res) => {
  const user = await prisma.usuarios.findUnique({ where: { id: req.user!.id }, include: profileInclude });
  if (!user) throw new HttpError(404, "Usuário não encontrado");
  res.json(serializeProfile(user,true));
};

// Respeita atividade e privacidade da conta antes de remover campos sensíveis do DTO público.
export const publicProfile: RequestHandler = async (req, res) => {
  const user = await prisma.usuarios.findUnique({ where: { id: uuid(req.params.id) }, include: profileInclude });
  if (!user || !user.ativo || (user.privacidade as { perfilPublico?: boolean })?.perfilPublico === false) throw new HttpError(404, "Usuário não encontrado");
  const profile = serializeProfile(user);
  delete profile.email;
  delete profile.telefone;
  delete profile.whatsapp;
  delete profile.preferenciasNotificacao;
  delete profile.privacidade;
  res.json(profile);
};

// Valida apenas os campos enviados e atualiza o perfil do usuário autenticado.
export const updateProfile: RequestHandler = async (req, res) => {
  const body = req.body ?? {};
  const nome = body.nome !== undefined ? text(body.nome,"Nome",100) : undefined;
  const bio = body.bio === "" ? "" : body.bio !== undefined ? text(body.bio,"Bio",1000) : undefined;
  const phone = body.telefone ?? body.whatsapp;
  const telefone = phone === "" ? "" : phone !== undefined ? text(phone,"Telefone",20) : undefined;
  if (telefone && !/^[+()\d\s-]{8,20}$/.test(telefone)) throw new HttpError(422,"Telefone inválido");
  const user = await prisma.usuarios.update({
    where: { id: req.user!.id },
    data: { ...(nome ? { nome } : {}), ...(bio !== undefined ? { bio } : {}), ...(telefone !== undefined ? { telefone } : {}), atualizado_em: new Date() },
    include: profileInclude,
  });
  res.json(serializeProfile(user,true));
};

// Salva a URL do avatar novo no usuário e remove o arquivo anterior após a atualização.
export const uploadAvatar: RequestHandler = async (req, res) => {
  const file = req.file ?? (req.files && !Array.isArray(req.files) ? Object.values(req.files).flat()[0] : undefined);
  if (!file) throw new HttpError(422, "Envie uma imagem");
  const current = await prisma.usuarios.findUnique({ where: { id: req.user!.id }, select: { foto_url: true } });
  const avatarUrl = publicUploadUrl(file.path);
  await prisma.usuarios.update({ where: { id: req.user!.id }, data: { foto_url: avatarUrl, atualizado_em: new Date() } });
  await removeUploadByUrl(current?.foto_url);
  res.json({ success: true, avatarUrl });
};
