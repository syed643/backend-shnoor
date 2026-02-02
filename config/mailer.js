import nodemailer from "nodemailer";

const port = Number(process.env.SMTP_PORT || 587);
const secure = process.env.SMTP_SECURE === "true" || port === 465;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port,
  secure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // When using port 587 we use STARTTLS (secure=false, requireTLS=true).
  // For port 465 we use implicit TLS (secure=true).
  requireTLS: !secure,
  tls: {
    // allow configuring TLS verification from env (defaults to strict)
    rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
  },
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 30000),
});

export default transporter;
