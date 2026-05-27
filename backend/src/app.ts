import Express from "express";
// import cors from "cors";
import cookieParser from "cookie-parser";
import api from "./app/routes/api.ts";
import path from "path";
import web from "./app/routes/web.ts";

const app = Express();

// ===========================================================================
// Config das rotas do backend
// ===========================================================================

app.use(cookieParser());
app.use(Express.json());

// ===========================================================================
// Rotas do backend
// ===========================================================================

app.use("/api", api);
app.use("/", web);


app.listen(8080, () => {
  console.log("http://localhost:8080");
});

console.log(path.resolve("../frontend/"));
