import { HttpError } from "../utils/httpError.ts";
export const activeStatuses = ["pendente", "aprovado", "pago", "retirado", "devolvido"];
export function normalizeRentalStatus(value: string): string { return ({ rejeitado: "recusado", concluido: "finalizado" } as Record<string, string>)[value] ?? value; }
export function authorizeTransition(rental: { status: string | null; locador_id: string; locatario_id: string }, user: { id: string; tipo: string }, status: string): void {
 const party = [rental.locador_id, rental.locatario_id].includes(user.id);
 if (!party && user.tipo !== "admin") throw new HttpError(403, "Acesso negado");
 if (["aprovado", "recusado", "finalizado"].includes(status) && rental.locador_id !== user.id && user.tipo !== "admin") throw new HttpError(403, "Apenas proprietário pode executar esta ação");
 const transitions: Record<string, string[]> = { pendente: ["aprovado", "recusado", "cancelado"], aprovado: ["cancelado"], pago: ["cancelado"], devolvido: ["finalizado"] };
 if (!(transitions[rental.status ?? "pendente"] ?? []).includes(status)) throw new HttpError(409, "Transição inválida; retirada e devolução exigem registro das duas partes");
}
