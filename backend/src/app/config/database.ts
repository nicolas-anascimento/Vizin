import parsedEnv from "./env.ts";
import { Client } from "pg";

const dbHost = parsedEnv!.DB_HOST;
const dbUser = parsedEnv!.DB_USER;
const dbPwd = parsedEnv!.DB_PWD;
const dbName = parsedEnv!.DB_NAME;

const db = new Client({
  user: dbUser,
  host: dbHost,
  password: dbPwd,
  database: dbName,
});

export default db;
