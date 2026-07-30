import crypto from "node:crypto";
import type { Request, RequestHandler } from "express";
import prisma from "../config/database.ts";
import env from "../config/env.ts";
import { HttpError } from "../utils/httpError.ts";
import { parseDateOnly } from "../utils/dates.ts";
import { serializeRental } from "../utils/serializers.ts";
import { nonEmptyString } from "../utils/strings.ts";
import { rentalInclude } from "./rentalsController.ts";


function requireConfiguredPaymentMode(): void {
  if (env.NODE_ENV !== "dev" || env.PAYMENT_MODE !== "demo") {
    throw new HttpError(503, "Gateway de pagamento real ainda não foi configurado");
  }
}

function ensurePayable(rental: { status: string | null }): void {
  if (rental.status === "pendente") {
    throw new HttpError(409, "Aguarde a aprovação do proprietário antes de pagar");
  }
  if (!["aprovado", "pago"].includes(rental.status ?? "")) {
    throw new HttpError(409, "Este aluguel não pode ser pago");
  }
}

async function resolveRental(req: Request) {
  const rentalId = nonEmptyString(req.body?.solicitacao_id ?? req.body?.aluguel_id ?? req.body?.pedido_id);
  if (rentalId) {
    const rental = await prisma.alugueis.findUnique({ where: { id: rentalId }, include: rentalInclude });
    if (!rental) throw new HttpError(404, "Solicitação não encontrada");
    if (rental.locatario_id !== req.user!.id && req.user!.tipo !== "admin") throw new HttpError(403, "Acesso negado");
    ensurePayable(rental);
    return rental;
  }

  const itemId = nonEmptyString(req.body?.objeto_id ?? req.body?.item_id);
  const start = parseDateOnly(req.body?.data_retirada ?? req.body?.data_inicio ?? req.body?.retirada, "Data de retirada");
  const end = parseDateOnly(req.body?.data_devolucao ?? req.body?.data_fim ?? req.body?.devolucao, "Data de devolução");
  if (!itemId || !start || !end) throw new HttpError(422, "Objeto e período são obrigatórios");
  const existing = await prisma.alugueis.findFirst({
    where: { item_id: itemId, locatario_id: req.user!.id, data_inicio: start, data_fim: end, status: { in: ["pendente", "aprovado", "pago"] } },
    include: rentalInclude,
    orderBy: { criado_em: "desc" },
  });
  if (existing) return existing;

  throw new HttpError(409, "Crie a solicitação e aguarde a aprovação do proprietário antes de pagar");
}

async function confirmPayment(rental: any, method: string) {
  ensurePayable(rental);
  if (rental.status === "pago") return rental;
  return prisma.$transaction(async (tx) => {
    const transition = await tx.alugueis.updateMany({
      where: { id: rental.id, status: "aprovado" },
      data: { status: "pago", atualizado_em: new Date() },
    });
    if (transition.count === 0) {
      const current = await tx.alugueis.findUnique({ where: { id: rental.id }, include: rentalInclude });
      if (current?.status === "pago") return current;
      throw new HttpError(409, "Este aluguel não pode mais ser pago");
    }
    await tx.pagamentos.create({
      data: { aluguel_id: rental.id, valor: rental.valor_total, metodo: method, status: "pago", pago_em: new Date() },
    });
    await tx.notificacoes.createMany({
      data: [
        { usuario_id: rental.locador_id, tipo: "pagamento", titulo: "Pagamento confirmado", mensagem: "O pagamento do aluguel foi confirmado." },
        { usuario_id: rental.locatario_id, tipo: "pagamento", titulo: "Pagamento confirmado", mensagem: "Seu pagamento foi confirmado." },
      ],
    });
    return tx.alugueis.findUniqueOrThrow({ where: { id: rental.id }, include: rentalInclude });
  });
}

export const generatePix: RequestHandler = async (req, res) => {
  requireConfiguredPaymentMode();
  const rental = await resolveRental(req);
  ensurePayable(rental);
  const code = `VIZIN|${rental.id}|${Number(rental.valor_total).toFixed(2)}|${crypto.randomBytes(8).toString("hex")}`;
  res.json({ success: true, aluguel_id: rental.id, pedido_id: rental.id, valor: Number(rental.valor_total), codigo_copia_cola: code, qr_code: code, qrcode_url: null, expira_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(), ambiente: "simulado" });
};

export const confirmPix: RequestHandler = async (req, res) => {
  requireConfiguredPaymentMode();
  const rental = await resolveRental(req);
  const updated = await confirmPayment(rental, "pix");
  res.json({ success: true, pedido_id: updated.id, status: "pago", ...serializeRental(updated) });
};

export const payCard: RequestHandler = async (req, res) => {
  requireConfiguredPaymentMode();
  const token = nonEmptyString(req.body?.token_cartao ?? req.body?.tokenCartao);
  if (!token) throw new HttpError(422, "Token do cartão é obrigatório");
  const rental = await resolveRental(req);
  const updated = await confirmPayment(rental, "cartao");
  res.json({ success: true, pedido_id: updated.id, status: "pago", ...serializeRental(updated) });
};

export const getOrder: RequestHandler = async (req, res) => {
  const rental = await prisma.alugueis.findUnique({ where: { id: req.params.id }, include: rentalInclude });
  if (!rental) throw new HttpError(404, "Pedido não encontrado");
  if (req.user!.tipo !== "admin" && ![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado");
  res.json(serializeRental(rental));
};
