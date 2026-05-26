import path from "path";
import Express from "express";

const web = Express();

function view(view: String){
    return path.resolve(`../frontend/${view}`);
}

web.get("/", (_req, res) => {
    res.sendFile(view("login.html"))
})
web.get("/login", (_req,res) => {
    res.sendFile(view("login.html"))
})
web.get("/home", (_req, res) => {
    // res.sendFile(view)
})