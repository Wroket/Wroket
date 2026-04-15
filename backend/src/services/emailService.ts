import nodemailer from "nodemailer";
import { escapeHtml } from "../utils/escapeHtml";
import { normalizeNotificationData } from "./notificationFormatting";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
/** Shown in the From header (with display name "Wroket"). Prefer EMAIL_FROM in prod so SMTP_USER (auth account) is not exposed. */
const FROM_ADDRESS = process.env.EMAIL_FROM || SMTP_USER || "noreply@wroket.com";

let transporter: nodemailer.Transporter | null = null;

const LOGO_URL = `${process.env.FRONTEND_URL || "http://localhost:3000"}/wroket-logo.png`;

function emailHeader(): string {
  return `<div style="text-align:center;padding:24px 0 16px">
    <img src="${LOGO_URL}" alt="Wroket" width="48" height="48" style="display:inline-block" />
  </div>`;
}

function emailFooter(): string {
  return `<div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0">
    <p style="font-size:11px;color:#94a3b8;margin:0">Wroket — Gestion de tâches collaborative</p>
    <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}" style="font-size:11px;color:#64748b;text-decoration:none">wroket.com</a>
  </div>`;
}

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
        ${emailHeader()}
        <h2 style="color:#334155">Bienvenue sur Wroket !</h2>
        <p>Cliquez sur le bouton ci-dessous pour confirmer votre adresse email :</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Confirmer mon email</a>
        <p style="font-size:13px;color:#64748b">Ou copiez ce lien : ${verifyUrl}</p>
        <p style="font-size:12px;color:#94a3b8">Ce lien expire dans 24 heures.</p>
        ${emailFooter()}
      </div>`
    : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        ${emailHeader()}
        <h2 style="color:#334155">Welcome to Wroket!</h2>
        <p>Click the button below to confirm your email address:</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Confirm my email</a>
        <p style="font-size:13px;color:#64748b">Or copy this link: ${verifyUrl}</p>
        <p style="font-size:12px;color:#94a3b8">This link expires in 24 hours.</p>
        ${emailFooter()}
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
      // FIX: Never log the actual token — it is equivalent to a password.
      // If logs are forwarded to a log aggregator the token is stored
      // indefinitely and accessible to anyone with log access.
      console.log("[email] (dry-run) Verification email queued for %s", toEmail);
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

  // FIX: Escape user-controlled fromName before embedding in HTML.
  // The original code interpolated the raw value, allowing HTML injection
  // (e.g. a user could set their name to <img src=x onerror=...>).
  const safeName = escapeHtml(fromName);

  const subject = locale === "fr"
    ? `${safeName} vous invite à découvrir Wroket`
    : `${safeName} invites you to try Wroket`;

  const html = locale === "fr"
    ? `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        ${emailHeader()}
        <h2 style="color:#334155">${safeName} vous recommande Wroket !</h2>
        <p>Wroket est une application collaborative de gestion de tâches, simple et efficace.</p>
        <a href="${signupUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Créer mon compte gratuitement</a>
        <p style="font-size:13px;color:#64748b">Ou copiez ce lien : ${signupUrl}</p>
        ${emailFooter()}
      </div>`
    : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        ${emailHeader()}
        <h2 style="color:#334155">${safeName} recommends Wroket!</h2>
        <p>Wroket is a simple and effective collaborative task management app.</p>
        <a href="${signupUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Create my free account</a>
        <p style="font-size:13px;color:#64748b">Or copy this link: ${signupUrl}</p>
        ${emailFooter()}
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
 * Collaboration invite: tells the invitee to open Wroket (Teams page) to accept.
 * Best-effort: logs on failure; SMTP must be configured for real delivery.
 */
export async function sendCollaborationInviteEmail(
  toEmail: string,
  inviterEmail: string,
  inviterDisplayName: string,
  locale: "fr" | "en" = "fr",
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const teamsUrl = `${frontendUrl}/teams`;
  const safeName = escapeHtml(inviterDisplayName);
  const safeInviterEmail = escapeHtml(inviterEmail);

  const subject =
    locale === "fr"
      ? `${safeName} vous invite à collaborer sur Wroket`
      : `${safeName} invited you to collaborate on Wroket`;

  const html =
    locale === "fr"
      ? `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        ${emailHeader()}
        <h2 style="color:#334155">Invitation à collaborer</h2>
        <p><strong>${safeName}</strong> (<span style="color:#64748b">${safeInviterEmail}</span>) vous a invité à collaborer sur Wroket.</p>
        <p>Connectez-vous et ouvrez la page <strong>Équipes</strong> pour accepter ou refuser l'invitation.</p>
        <a href="${teamsUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Ouvrir Wroket — Équipes</a>
        <p style="font-size:13px;color:#64748b">Ou copiez ce lien : ${teamsUrl}</p>
        ${emailFooter()}
      </div>`
      : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        ${emailHeader()}
        <h2 style="color:#334155">Collaboration invite</h2>
        <p><strong>${safeName}</strong> (<span style="color:#64748b">${safeInviterEmail}</span>) invited you to collaborate on Wroket.</p>
        <p>Sign in and open the <strong>Teams</strong> page to accept or decline.</p>
        <a href="${teamsUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Open Wroket — Teams</a>
        <p style="font-size:13px;color:#64748b">Or copy this link: ${teamsUrl}</p>
        ${emailFooter()}
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
      console.log("[email] Collaboration invite sent to %s (messageId: %s)", toEmail, info.messageId);
    } else {
      console.log("[email] (dry-run) Collaboration invite queued for %s", toEmail);
    }
  } catch (err) {
    console.error("[email] Failed to send collaboration invite to %s: %s", toEmail, err);
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
        ${emailHeader()}
        <h2 style="color:#334155">Réinitialisation du mot de passe</h2>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous :</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Réinitialiser mon mot de passe</a>
        <p style="font-size:13px;color:#64748b">Ou copiez ce lien : ${resetUrl}</p>
        <p style="font-size:12px;color:#94a3b8">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
        ${emailFooter()}
      </div>`
    : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        ${emailHeader()}
        <h2 style="color:#334155">Password reset</h2>
        <p>You requested a password reset. Click the button below:</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0">Reset my password</a>
        <p style="font-size:13px;color:#64748b">Or copy this link: ${resetUrl}</p>
        <p style="font-size:12px;color:#94a3b8">This link expires in 1 hour. If you did not request this, please ignore this email.</p>
        ${emailFooter()}
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
      // FIX: Never log the actual reset token.
      console.log("[email] (dry-run) Password reset email queued for %s", toEmail);
    }
  } catch (err) {
    console.error("[email] Failed to send password reset to %s: %s", toEmail, err);
  }
}

/**
 * 6-digit OTP for login (pending 2FA) or enrollment — never log the code.
 */
export async function sendEmailOtpEmail(
  toEmail: string,
  code: string,
  kind: "login" | "enrollment" | "disable",
  locale: "fr" | "en" = "fr",
): Promise<void> {
  const subjects: Record<typeof kind, { fr: string; en: string }> = {
    login: {
      fr: "Wroket — Votre code de connexion",
      en: "Wroket — Your sign-in code",
    },
    enrollment: {
      fr: "Wroket — Activez la 2FA par email",
      en: "Wroket — Enable email two-factor authentication",
    },
    disable: {
      fr: "Wroket — Code pour désactiver la 2FA par email",
      en: "Wroket — Code to turn off email 2FA",
    },
  };

  const bodies: Record<typeof kind, { fr: string; en: string }> = {
    login: {
      fr: `Votre code à 6 chiffres : <strong style="font-size:22px;letter-spacing:4px">${escapeHtml(code)}</strong><p style="font-size:12px;color:#94a3b8">Valide 10 minutes. Si ce n'est pas vous, changez votre mot de passe.</p>`,
      en: `Your 6-digit code: <strong style="font-size:22px;letter-spacing:4px">${escapeHtml(code)}</strong><p style="font-size:12px;color:#94a3b8">Valid for 10 minutes. If this wasn't you, change your password.</p>`,
    },
    enrollment: {
      fr: `Entrez ce code dans les paramètres Wroket pour activer la 2FA par email : <strong style="font-size:22px;letter-spacing:4px">${escapeHtml(code)}</strong><p style="font-size:12px;color:#94a3b8">Valide 10 minutes.</p>`,
      en: `Enter this code in Wroket settings to enable email 2FA: <strong style="font-size:22px;letter-spacing:4px">${escapeHtml(code)}</strong><p style="font-size:12px;color:#94a3b8">Valid for 10 minutes.</p>`,
    },
    disable: {
      fr: `Pour désactiver la 2FA par email, entrez ce code dans les paramètres : <strong style="font-size:22px;letter-spacing:4px">${escapeHtml(code)}</strong>`,
      en: `To turn off email 2FA, enter this code in settings: <strong style="font-size:22px;letter-spacing:4px">${escapeHtml(code)}</strong>`,
    },
  };

  const subject = subjects[kind][locale];
  const inner = bodies[kind][locale];
  const html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
    ${emailHeader()}
    <div style="color:#334155">${inner}</div>
    ${emailFooter()}
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
      console.log("[email] OTP (%s) sent to %s (messageId: %s)", kind, toEmail, info.messageId);
    } else {
      console.log("[email] (dry-run) OTP email kind=%s for %s", kind, toEmail);
    }
  } catch (err) {
    console.error("[email] Failed to send OTP to %s: %s", toEmail, err);
  }
}

/**
 * In-app notification mirrored to the user's email (settings → notification channel).
 */
export async function sendNotificationEmail(
  toEmail: string,
  title: string,
  message: string,
  data?: Record<string, string>,
): Promise<void> {
  const subject = `Wroket — ${title}`;
  const ctx = normalizeNotificationData(data);
  const detailRows: string[] = [];
  if (ctx.todoTitle) {
    detailRows.push(
      `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top;width:96px">Tâche</td><td style="padding:6px 0;color:#334155;font-size:14px">${escapeHtml(ctx.todoTitle)}</td></tr>`,
    );
  }
  if (ctx.actorEmail) {
    detailRows.push(
      `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top">Par</td><td style="padding:6px 0;color:#334155;font-size:14px">${escapeHtml(ctx.actorEmail)}</td></tr>`,
    );
  }
  if (ctx.recipientEmail) {
    detailRows.push(
      `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top">Pour</td><td style="padding:6px 0;color:#334155;font-size:14px">${escapeHtml(ctx.recipientEmail)}</td></tr>`,
    );
  }
  if (ctx.projectName) {
    detailRows.push(
      `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top">Projet</td><td style="padding:6px 0;color:#334155;font-size:14px">${escapeHtml(ctx.projectName)}</td></tr>`,
    );
  }
  if (ctx.teamName) {
    detailRows.push(
      `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top">Équipe</td><td style="padding:6px 0;color:#334155;font-size:14px">${escapeHtml(ctx.teamName)}</td></tr>`,
    );
  }
  if (ctx.commentPreview) {
    detailRows.push(
      `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top">Commentaire</td><td style="padding:6px 0;color:#334155;font-size:14px;font-style:italic">${escapeHtml(ctx.commentPreview)}</td></tr>`,
    );
  }
  const detailsBlock =
    detailRows.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;padding:12px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">${detailRows.join("")}</table>`
      : "";
  const html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
    ${emailHeader()}
    <h2 style="color:#334155">${escapeHtml(title)}</h2>
    ${detailsBlock}
    <p style="color:#475569;line-height:1.5">${escapeHtml(message)}</p>
    ${emailFooter()}
  </div>`;
  const t = getTransporter();
  try {
    await t.sendMail({
      from: `"Wroket" <${FROM_ADDRESS}>`,
      to: toEmail,
      subject,
      html,
    });
    if (!SMTP_USER) {
      console.log("[email] (dry-run) notification email for %s", toEmail);
    }
  } catch (err) {
    console.error("[email] Failed to send notification to %s: %s", toEmail, err);
  }
}
