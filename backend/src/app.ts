import Express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import api from "./app/routes/api.ts";

const app = Express();

// ===========================================================================
// Config das rotas do backend
// ===========================================================================

app.use(cookieParser());
app.use(Express.json());
app.use(cors());

// ===========================================================================
// Rotas do backend
// ===========================================================================

app.use("/api", api);

app.listen(8080, () => {
    console.log("http://localhost:8080");
});
