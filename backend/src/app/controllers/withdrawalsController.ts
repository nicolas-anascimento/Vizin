import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { publicUploadUrl } from "../utils/files.ts";
import { nonEmptyString } from "../utils/strings.ts";

export const createWithdrawal: RequestHandler = async (req, res) => {
  const itemId = nonEmptyString(req.body?.objeto_id ?? req.body?.item_id);
  const rentalId = nonEmptyString(req.body?.aluguel_id ?? req.body?.pedido_id);
  const files = Array.isArray(req.files) ? req.files : [];
  if (!itemId && !rentalId) throw new HttpError(422, "Objeto ou aluguel é obrigatório");
  if (!files.length) throw new HttpError(422, "Adicione ao menos uma foto da retirada");
  const rental = await prisma.alugueis.findFirst({
    where: { ...(rentalId ? { id: rentalId } : { item_id: itemId! }), locatario_id: req.user!.id, status: "pago" },
    include: { itens: true },
    orderBy: { criado_em: "desc" },
  });
  if (!rental) throw new HttpError(404, "Aluguel pago apto para retirada não encontrado");
  const today = new Date(new Date().toISOString().slice(0, 10));
  if (rental.data_inicio > today) throw new HttpError(409, "A retirada só pode ser registrada na data combinada");

  const withdrawal = await prisma.$transaction(async (tx) => {
    const changed = await tx.alugueis.updateMany({
      where: { id: rental.id, status: "pago" },
      data: { status: "retirado", atualizado_em: new Date() },
    });
    if (changed.count === 0) throw new HttpError(409, "A retirada já foi registrada ou o aluguel mudou de status");
    const created = await tx.retiradas.create({
      data: {
        aluguel_id: rental.id,
        usuario_id: req.user!.id,
        observacoes: nonEmptyString(req.body?.observacoes),
        fotos: { create: files.map((file) => ({ url: publicUploadUrl(file.path) })) },
      },
      include: { fotos: true },
    });
    await tx.notificacoes.create({
      data: {
        usuario_id: rental.locador_id,
        tipo: "retirada",
        titulo: "Objeto retirado",
        mensagem: `${rental.itens.titulo} foi marcado como retirado.`,
      },
    });
    return created;
  });
  res.status(201).json({
    success: true,
    retirada: { ...withdrawal, fotos: withdrawal.fotos.map((photo: { url: string }) => photo.url) },
  });
};
