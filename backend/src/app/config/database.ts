import parsedEnv from "./env.ts";
import { Pool } from "pg";

const dbHost = parsedEnv!.DB_HOST;
const dbUser = parsedEnv!.DB_USER;
const dbPwd = parsedEnv!.DB_PWD;
const dbName = parsedEnv!.DB_NAME;
const dbPort = parsedEnv!.DB_PORT as unknown as number;

const pool = new Pool({
  host: dbHost,
  port: dbPort,
  database: dbName,
  user: dbUser,
  password: dbPwd,
});

export default pool;
