// ========== OUTGOING E-MAIL ==========
// Three providers, chosen by EMAIL_PROVIDER:
//  - log    : nothing is sent; the message is printed and, when EMAIL_LOG_FILE is set, appended as JSON (dev, tests)
//  - smtp   : nodemailer over SMTP_URL (smtps://user:pass@host:465)
//  - resend : Resend HTTP API with RESEND_API_KEY
// Failures never break the game flow: callers log and carry on.
const fs = require('fs');
const config = require('../config');

let transporter = null;

async function sendMail({ to, subject, text, html }) {
  const { provider, from } = config.email;
  if (provider === 'log') {
    const line = JSON.stringify({ at: new Date().toISOString(), to, subject, text });
    console.log('[MAIL]', line);
    if (config.email.logFile) fs.appendFileSync(config.email.logFile, line + '\n');
    return { ok: true, logged: true };
  }
  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text, html }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return { ok: true };
  }
  if (provider === 'smtp') {
    if (!transporter) transporter = require('nodemailer').createTransport(config.email.smtpUrl);
    await transporter.sendMail({ from, to, subject, text, html });
    return { ok: true };
  }
  return { ok: false, skipped: true };
}

function configured() { return ['smtp', 'resend'].includes(config.email.provider); }

module.exports = { sendMail, configured };
