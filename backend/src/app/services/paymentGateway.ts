import { MercadoPagoGateway } from "./mercadoPagoGateway.ts";
import crypto from "node:crypto";
import env from "../config/env.ts";
import { HttpError } from "../utils/httpError.ts";
// Contrato comum de respostas do gateway usado pelos controllers financeiros.
export type GatewayResult = { referencia: string; status: "pendente" | "pago" | "falhou" | "cancelado" | "estornado"; codigo_copia_cola?: string; qrcode_url?: string; expira_em?: string; qr_code_base64?: string; valor?: number; moeda?: string; external_reference?: string; metadata?: Record<string,unknown>; cartao_id?: string; acao_necessaria?: {tipo:"3ds";url:string;creq?:string} };
// Habilita cobrança simulada somente no ambiente de desenvolvimento configurado.
export function simulated(): boolean { return env.NODE_ENV === "dev" && env.PAYMENT_MODE === "demo"; }
// O adaptador isola credenciais e chamadas HTTP das regras de negócio da locação.
// Envia operação com chave idempotente, timeout e validação mínima da resposta do provedor.
export async function gatewayRequest(operation: string, data: Record<string, unknown>, key: string, provider = "real"): Promise<GatewayResult> {
 if(provider === "mercado_pago") return new MercadoPagoGateway().request(operation,data,key);
 const endpoint = process.env.PAYMENT_GATEWAY_URL;
 const secret = process.env.PAYMENT_GATEWAY_TOKEN;
 if (!endpoint || !secret) throw new HttpError(503, "Gateway real não configurado");
 if (env.NODE_ENV === "production" && !endpoint.startsWith("https://")) throw new HttpError(503, "Gateway exige HTTPS");
 let response: Response;
 try { response = await fetch(`${endpoint.replace(/\/$/, "")}/${operation}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, "Idempotency-Key": key }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) }); }
 catch { throw new HttpError(502, "Gateway indisponível; consulte o status antes de tentar novamente"); }
 if (!response.ok) throw new HttpError(502, "Gateway recusou a operação");
 let payload:unknown;try{payload=await response.json();}catch{throw new HttpError(502,"Resposta inválida do gateway");}
 if(!payload || typeof payload!=="object" || Array.isArray(payload))throw new HttpError(502,"Resposta inválida do gateway");
 const result = payload as GatewayResult;
 if (typeof result.referencia !== "string" || !result.referencia.trim() || result.referencia.length>200 || !["pendente", "pago", "falhou", "cancelado", "estornado"].includes(result.status)) throw new HttpError(502, "Resposta inválida do gateway");
 if (operation !== "payments" && result.status === "falhou") throw new HttpError(502,"Gateway recusou a operação");
 return result;
}
// Verifica HMAC do corpo bruto com comparação em tempo constante antes de aceitar eventos.
export function verifyWebhook(body: Buffer, signature: unknown): void {
 const secret = process.env.PAYMENT_WEBHOOK_SECRET;
 if (!secret || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) throw new HttpError(401, "Webhook não autenticado");
 const expected = crypto.createHmac("sha256", secret).update(body).digest();
 if (!crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new HttpError(401, "Assinatura inválida");
}
