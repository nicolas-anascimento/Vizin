import express from "express";
import cookieParser from "cookie-parser";
import { log } from "node:console";
import { seed } from "./app/model/index.ts";
import loginController from "./app/controller/loginController.ts";
import db from "./app/config/database.ts";
import auth from "./routes/authRoutesV1.ts";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use("/v1/auth", auth);

app.listen(8080, () => {
  console.log("http://localhost:8080");
});


await db.sync({force: true});
await seed();
