import Express from "express";
import cookieParser from "cookie-parser";

const app = Express();

// ===========================================================================
// Config das rotas do backend
// ===========================================================================

app.use(cookieParser());
app.use(Express.json());

// ===========================================================================
// Rotas do backend
// ===========================================================================

app.get("/", async (_req, res) => {
  res.json({
    funcionando: true,
  });
});

app.listen(8080, () => {
  console.log("http://localhost:8080");
});
