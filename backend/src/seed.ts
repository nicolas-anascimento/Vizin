import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "./app/config/database.ts";

const categories = ["Ferramentas", "Eletrônicos", "Casa", "Jardim", "Esportes", "Festas", "Outros"];

async function main(): Promise<void> {
  for (const nome of categories) {
    await prisma.categorias.upsert({ where: { nome }, update: {}, create: { nome } });
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 10) throw new Error("ADMIN_PASSWORD deve ter pelo menos 10 caracteres");
    await prisma.usuarios.upsert({
      where: { email },
      update: { tipo: "admin", ativo: true },
      create: { nome: "Administrador", email, senha_hash: await bcrypt.hash(password, 12), tipo: "admin", ativo: true },
    });
    console.log(`Administrador configurado: ${email}`);
  } else {
    console.log("ADMIN_EMAIL/ADMIN_PASSWORD não definidos; nenhum administrador foi criado.");
  }
}

main().finally(async () => prisma.$disconnect());
