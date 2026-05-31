import prisma from "./src/app/config/database.ts";

// gerar_hash.ts
import bcrypt from "bcrypt";

const senha = "123";
const hash = await bcrypt.hash(senha, 10);
console.log(hash);

await prisma.usuarios.create({
  data: { email: "nicolas.anascimento@eaportal.org", senha_hash: hash, nome: "teste User", tipo: "admin" },
});
