import mailer from "nodemailer";
import parsedEnv from "./env.ts";

const transporter = mailer.createTransport({
    service: "gmail",
    auth: {
        user: parsedEnv!.EMAIL_TRANSPORT,
        pass: parsedEnv!.PASSWORD_TRANSPORT,
    },
});

export default transporter;
