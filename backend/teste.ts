// gerar_hash.ts
import bcrypt from "bcrypt";

const senha = "123";
const hash = await bcrypt.hash(senha, 10);
console.log(hash);