import express from 'express';
import loginController from '../app/controller/loginController.ts';


const auth = express()


auth.post("/login", loginController.login);
auth.post("/register", loginController.register);


export default auth;