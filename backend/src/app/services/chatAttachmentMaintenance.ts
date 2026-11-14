import { unlink } from "node:fs/promises";
import path from "node:path";
import prisma from "../config/database.ts";
import { privateRoot } from "../middlewares/privateUpload.ts";

// Uploads concluídos que não viraram mensagem são descartados após um dia.
export async function pruneUnattachedChatUploads(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.anexos.findMany({
    where: { mensagem: { is: null }, criado_em: { lt: cutoff } },
    select: { id: true, caminho: true }, take: 100,
  });
  for (const row of rows) {
    const deleted = await prisma.anexos.deleteMany({
      where: { id: row.id, mensagem: { is: null }, criado_em: { lt: cutoff } },
    });
    if (deleted.count && path.basename(row.caminho) === row.caminho) {
      await unlink(path.join(privateRoot, row.caminho)).catch(error => {
        if (error?.code !== "ENOENT") console.error("Falha ao remover anexo órfão", error);
      });
    }
  }
}
