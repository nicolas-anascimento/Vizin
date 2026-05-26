import Express from "express";
// import cors from "cors";
import cookieParser from "cookie-parser";
import api from "./app/routes/api.ts";
import path from "path";

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
app.use("/", Express.static(path.resolve("../frontend/")))


app.listen(8080, () => {
  console.log("http://localhost:8080");
});

console.log(path.resolve("../frontend/"));
