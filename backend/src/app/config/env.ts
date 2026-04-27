import dotenv from "dotenv";

const env = dotenv.config();
const parsedEnv = env.parsed;

export default parsedEnv;
