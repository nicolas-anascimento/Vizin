import { log } from "node:console";
import db from "../config/database.ts";
import User from "./User.ts";
import bcrypt from "bcrypt";

async function seed() {
  const pwd = await bcrypt.hash("123", 10);
  const data = (await User.findOne({
    where: { name: "teste" },
    raw: true,
  })) as unknown as any[];
  if (!data) {
    await User.bulkCreate([
      {
        name: "teste",
        email: "teste@email.com",
        password: pwd,
        cpf: "00000000000",
      },
    ]);
  }
}


export { User, seed };
