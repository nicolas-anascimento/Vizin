import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const Path = path.resolve(__dirname, "../../../.env")
const env = dotenv.config({path: Path});
const parsedEnv = env.parsed;

console.log(Path)

export default parsedEnv;
