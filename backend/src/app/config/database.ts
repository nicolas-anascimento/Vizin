import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import parsedEnv from "./env.ts";


const connectionString = `${parsedEnv!.DATABASE_URL}`
const adapter = new PrismaPg({connectionString})
const prisma = new PrismaClient({adapter});


export default prisma;
