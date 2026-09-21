import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { boolean, text, uuid } from "../utils/validation.ts";
import { audit } from "../utils/admin.ts";

// A moderação só altera visibilidade. Dados comerciais e fotos pertencem ao fluxo do proprietário.
async function moderate(req: Parameters<RequestHandler>[0], archive: boolean) {
  const id = uuid(req.params.id);
  const keys = Object.keys(req.body ?? {});
  if (keys.some(k => !["disponivel", "motivo"].includes(k)) || (!archive && req.body?.disponivel === undefined)) throw new HttpError(422, "Apenas disponivel e motivo são aceitos");
  const available = archive ? false : boolean(req.body.disponivel, "Disponível");
  const motivo = req.body?.motivo === undefined ? null : text(req.body.motivo, "Motivo", 1000);
  if (!available && !motivo) throw new HttpError(422, "Motivo obrigatório para ocultar ou arquivar");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM itens WHERE id=${id}::uuid FOR UPDATE`;
    const item = await tx.itens.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, "Objeto não encontrado");
    if (await tx.alugueis.count({ where: { item_id: id, status: { in: ["aprovado", "pago", "retirado", "devolvido"] } } })) throw new HttpError(409, "O objeto possui uma locação ativa", "OBJETO_EM_LOCACAO");
    if ((archive || !available) && await tx.alugueis.count({ where: { item_id: id, status: "pendente" } })) throw new HttpError(409, "O objeto possui uma solicitação pendente", "OBJETO_COM_SOLICITACAO_PENDENTE");
    if (item.arquivado && !archive) throw new HttpError(409, "Objeto arquivado não pode ser reativado por moderação");
    if (item.arquivado === archive && item.disponivel === available) return item;
    const row = await tx.itens.update({ where: { id }, data: { disponivel: available, ...(archive ? { arquivado: true } : {}), atualizado_em: new Date() } });
    await audit(tx, req.user!.id, archive ? "arquivar" : available ? "exibir" : "ocultar", "objeto", id, { motivo });
    return row;
  });
}
// Atualiza os campos administrativos permitidos do objeto.
export const updateAdminItem: RequestHandler = async (req, res) => { res.json(await moderate(req, false)); };
// Arquiva o anúncio por decisão administrativa conforme as restrições de locação.
export const archiveAdminItem: RequestHandler = async (req, res) => { res.json(await moderate(req, true)); };
