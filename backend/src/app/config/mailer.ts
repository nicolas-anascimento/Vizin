import nodemailer from "nodemailer";
import env from "./env.ts";

const transporter = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : env.EMAIL_TRANSPORT && env.PASSWORD_TRANSPORT
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: env.EMAIL_TRANSPORT, pass: env.PASSWORD_TRANSPORT },
      })
    : null;

export default transporter;
