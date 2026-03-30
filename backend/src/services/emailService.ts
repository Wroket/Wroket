import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const FROM_ADDRESS = process.env.EMAIL_FROM || SMTP_USER || "noreply@wroket.com";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!SMTP_USER || !SMTP_PASS) {
      console.warn("[email] SMTP_USER / SMTP_PASS not configured — emails disabled");
      transporter = nodemailer.createTransport({ jsonTransport: true });
    } else {
      transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
    }
  }
  return transporter;
}

/**
 * Sends the email verification link to a newly registered user.
 */
export async function sendVerificationEmail(
  toEmail: string,
  token: string,
  locale: "fr" | "en" = "fr",
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

  const subject = locale === "fr"
    ? "Wroket — Confirmez votre adresse email"
    : "Wroket — Confirm your email address";

  const html = locale === "fr"
    ? `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#334155">Bienvenue sur Wroket !</h2>
        <p>Cliquez sur le bouton ci-dessous pour confirmer votre adresse email :</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Confirmer mon email</a>
        <p style="font-size:13px;color:#64748b">Ou copiez ce lien : ${verifyUrl}</p>
        <p style="font-size:12px;color:#94a3b8">Ce lien expire dans 24 heures.</p>
      </div>`
    : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#334155">Welcome to Wroket!</h2>
        <p>Click the button below to confirm your email address:</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Confirm my email</a>
        <p style="font-size:13px;color:#64748b">Or copy this link: ${verifyUrl}</p>
        <p style="font-size:12px;color:#94a3b8">This link expires in 24 hours.</p>
      </div>`;

  const t = getTransporter();

  try {
    const info = await t.sendMail({
      from: `"Wroket" <${FROM_ADDRESS}>`,
      to: toEmail,
      subject,
      html,
    });
    if (SMTP_USER) {
      console.log("[email] Verification sent to %s (messageId: %s)", toEmail, info.messageId);
    } else {
      console.log("[email] (dry-run) Verification email for %s — token: %s", toEmail, token);
    }
  } catch (err) {
    console.error("[email] Failed to send verification to %s: %s", toEmail, err);
  }
}

/**
 * Sends an invitation email to discover Wroket.
 */
export async function sendInviteEmail(
  toEmail: string,
  fromName: string,
  locale: "fr" | "en" = "fr",
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const signupUrl = `${frontendUrl}/login`;

  const subject = locale === "fr"
    ? `${fromName} vous invite à découvrir Wroket`
    : `${fromName} invites you to try Wroket`;

  const html = locale === "fr"
    ? `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#334155">${fromName} vous recommande Wroket !</h2>
        <p>Wroket est une application collaborative de gestion de tâches, simple et efficace.</p>
        <a href="${signupUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Créer mon compte gratuitement</a>
        <p style="font-size:13px;color:#64748b">Ou copiez ce lien : ${signupUrl}</p>
      </div>`
    : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#334155">${fromName} recommends Wroket!</h2>
        <p>Wroket is a simple and effective collaborative task management app.</p>
        <a href="${signupUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Create my free account</a>
        <p style="font-size:13px;color:#64748b">Or copy this link: ${signupUrl}</p>
      </div>`;

  const t = getTransporter();

  try {
    const info = await t.sendMail({
      from: `"Wroket" <${FROM_ADDRESS}>`,
      to: toEmail,
      subject,
      html,
    });
    if (SMTP_USER) {
      console.log("[email] Invite sent to %s from %s (messageId: %s)", toEmail, fromName, info.messageId);
    } else {
      console.log("[email] (dry-run) Invite email for %s from %s", toEmail, fromName);
    }
  } catch (err) {
    console.error("[email] Failed to send invite to %s: %s", toEmail, err);
  }
}

/**
 * Sends a password reset link.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  token: string,
  locale: "fr" | "en" = "fr",
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

  const subject = locale === "fr"
    ? "Wroket — Réinitialisation de votre mot de passe"
    : "Wroket — Reset your password";

  const html = locale === "fr"
    ? `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#334155">Réinitialisation du mot de passe</h2>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous :</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Réinitialiser mon mot de passe</a>
        <p style="font-size:13px;color:#64748b">Ou copiez ce lien : ${resetUrl}</p>
        <p style="font-size:12px;color:#94a3b8">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
      </div>`
    : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#334155">Password reset</h2>
        <p>You requested a password reset. Click the button below:</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Reset my password</a>
        <p style="font-size:13px;color:#64748b">Or copy this link: ${resetUrl}</p>
        <p style="font-size:12px;color:#94a3b8">This link expires in 1 hour. If you did not request this, please ignore this email.</p>
      </div>`;

  const t = getTransporter();

  try {
    const info = await t.sendMail({
      from: `"Wroket" <${FROM_ADDRESS}>`,
      to: toEmail,
      subject,
      html,
    });
    if (SMTP_USER) {
      console.log("[email] Password reset sent to %s (messageId: %s)", toEmail, info.messageId);
    } else {
      console.log("[email] (dry-run) Password reset email for %s — token: %s", toEmail, token);
    }
  } catch (err) {
    console.error("[email] Failed to send password reset to %s: %s", toEmail, err);
  }
}
