import Express from "express";
import cookieParser from "cookie-parser";

const app = Express();

app.use(cookieParser());




app.listen(8080, () => {
  console.log("http://localhost:8080");
});