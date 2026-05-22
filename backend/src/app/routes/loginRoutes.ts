import express from "express";
import Login from "../controllers/loginController.ts";

const login = express();

login.get("/", Login.login);
login.get("/logout", Login.logout);

export default login;
