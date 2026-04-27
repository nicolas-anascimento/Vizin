import { Sequelize } from "sequelize";
import { log } from "node:console";
import parsedEnv from "./env.ts";
import { parse } from "node:path";

if (!parsedEnv) {
  throw new Error("Env inexistente");
}

const db = new Sequelize(
  parsedEnv.DB_NAME!,
  parsedEnv.DB_USER!,
  parsedEnv.DB_PWD!,
  {
    dialect: "postgres",
    port: 5432,
    host: parsedEnv.DB_HOST!,
    logging: false,
  },
);

db.authenticate();

export default db;
