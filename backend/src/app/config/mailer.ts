import nodemailer from "nodemailer";
import env from "./env.ts";

// Seleciona SMTP configurado ou Gmail legado; sem credenciais, o envio fica indisponível.
const transporter = env.SMTP_HOST
  ? env.SMTP_FROM && ((!env.SMTP_USER && !env.SMTP_PASS) || (env.SMTP_USER && env.SMTP_PASS))
    ? nodemailer.createTransport({
      pool: true,
      maxConnections: 2,
      maxMessages: 100,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }) : null
  : env.EMAIL_TRANSPORT && env.PASSWORD_TRANSPORT
    ? nodemailer.createTransport({
        pool: true,
        maxConnections: 2,
        maxMessages: 100,
        service: "gmail",
        auth: { user: env.EMAIL_TRANSPORT, pass: env.PASSWORD_TRANSPORT },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      })
    : null;

export default transporter;
