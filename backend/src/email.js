// Minimal transactional email sender, using Resend's HTTP API directly (no
// SDK dependency — it's a single POST). Configured via two env vars:
//   RESEND_API_KEY   — from https://resend.com (free tier is plenty for this)
//   RESEND_FROM_EMAIL — a sender address on a domain verified in Resend,
//                        e.g. "PoGo Arcade <noreply@pogoarcade.com>"
// If either is missing, sendPasswordResetEmail() logs a warning and returns
// false instead of throwing — the reset flow still "succeeds" from the
// caller's perspective (see routes.js: we never reveal whether an email is
// registered), it just won't actually deliver until these are configured.
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";

export async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn(
      "[email] RESEND_API_KEY / RESEND_FROM_EMAIL not configured — skipping password reset email send. " +
        "Set both as Cloud Run env vars/secrets to enable real delivery."
    );
    // Dev convenience only: with no email service configured, print the
    // link so local development/testing can still exercise the reset flow.
    // Never logged in production, since the raw token grants a password
    // reset to whoever has it.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] (dev) password reset link for ${toEmail}: ${resetUrl}`);
    }
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [toEmail],
        subject: "Reset your PoGo Arcade password",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#111">PoGo Arcade</h2>
            <p>We received a request to reset your password. This link expires in 1 hour and can only be used once.</p>
            <p style="margin:24px 0">
              <a href="${resetUrl}" style="background:#8b5cf6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a>
            </p>
            <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
            <p style="color:#999;font-size:12px">Or paste this link into your browser: ${resetUrl}</p>
          </div>
        `,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend API error", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Failed to send password reset email:", err.message);
    return false;
  }
}
