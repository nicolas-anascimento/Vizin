import express from "express";
import AccountController from "../controllers/accountsController.ts";

const usuarios = express();

usuarios.post("/", AccountController.getUserData);

export default usuarios;
