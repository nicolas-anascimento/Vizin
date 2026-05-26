import express from "express";
import Login from "../controllers/loginController.ts";

const login = express();

login.post("/", Login.login);
login.post("/logout", Login.logout);

export default login;
