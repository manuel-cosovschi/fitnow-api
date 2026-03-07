// src/utils/mailer.js
/**
 * Thin email abstraction.
 * - If SMTP_HOST is set: sends via nodemailer.
 * - Otherwise: logs the link (useful for dev/testing without an email server).
 */
import nodemailer from 'nodemailer';
import logger from './logger.js';

let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.SMTP_FROM || 'noreply@fitnow.app';

export async function sendPasswordReset(email, token) {
  const base  = process.env.RESET_PASSWORD_URL || 'fitnow://reset-password';
  const resetUrl = `${base}?token=${token}`;

  if (!transporter) {
    logger.info('[MAILER] Password reset link (SMTP no configurado):', { email, resetUrl });
    return;
  }

  await transporter.sendMail({
    from:    FROM,
    to:      email,
    subject: 'Restablecé tu contraseña — FitNow',
    text:    `Para restablecer tu contraseña, ingresá al siguiente enlace:\n\n${resetUrl}\n\nEste enlace expira en 1 hora.`,
    html:    `
      <p>Hola,</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta FitNow.</p>
      <p><a href="${resetUrl}" style="background:#00C27C;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Restablecer contraseña</a></p>
      <p>Si no solicitaste esto, podés ignorar este correo.</p>
      <p>Este enlace expira en 1 hora.</p>
    `,
  });
}
