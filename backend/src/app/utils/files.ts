import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Define caminhos de uploads públicos e fotos privadas de retirada/devolução.
export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const uploadsRoot = path.join(backendRoot, "uploads");
export const privateWithdrawalRoot = path.join(backendRoot, "private-uploads", "withdrawals");

// Converte caminho privado em URL protegida pela rota autenticada.
export function withdrawalPhotoUrl(filePath: string): string {
  return `/uploads/withdrawals/${path.basename(filePath)}`;
}

// Converte o arquivo público salvo em URL devolvida pela API.
export function publicUploadUrl(filePath: string): string {
  const relative = path.relative(uploadsRoot, filePath).split(path.sep).join("/");
  return `/uploads/${relative}`;
}

// Remove arquivo antigo somente quando sua URL aponta para um upload local permitido.
export async function removeUploadByUrl(url: string | null | undefined): Promise<void> {
  if (!url?.startsWith("/uploads/")) return;
  const relative = url.slice("/uploads/".length);
  const target = path.resolve(uploadsRoot, relative);
  if (target !== uploadsRoot && !target.startsWith(`${uploadsRoot}${path.sep}`)) return;
  await fs.unlink(target).catch(() => undefined);
}
