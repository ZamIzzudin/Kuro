// Notu — mail service (reset password). SMTP via env (Q3).
// Jika SMTP_HOST tidak diset (mode dev), email dicetak ke console agar flow tetap bisa dites.
import nodemailer from 'nodemailer'

type SendOptions = { to: string; subject: string; html: string }

export async function sendMail({ to, subject, html }: SendOptions) {
  const host = process.env.SMTP_HOST
  if (!host) {
    console.log(`[mail:dev] ┌ Kepada: ${to}\n[mail:dev] │ Subjek: ${subject}\n[mail:dev] └ Link/konten: ${html.match(/https?:\/\/[^"'\s<]+/)?.[0] ?? '(lihat HTML)'}`)
    return
  }
  const port = Number(process.env.SMTP_PORT || 587)
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Notu <no-reply@notu.local>',
    to,
    subject,
    html,
  })
}

export function resetPasswordEmail(name: string, link: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#17161D">
    <div style="font-weight:800;font-size:18px;margin-bottom:16px">
      <span style="display:inline-block;width:12px;height:12px;border-radius:4px;background:linear-gradient(135deg,#8B2FF2,#D926C8);margin-right:8px"></span>Notu
    </div>
    <p>Halo ${name},</p>
    <p>Kami menerima permintaan reset password akun <b>Notu</b> Anda. Klik tombol berikut (berlaku <b>1 jam</b>):</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:linear-gradient(135deg,#8B2FF2,#D926C8);color:#ffffff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">Reset Password</a>
    </p>
    <p style="color:#6F6E78;font-size:13px">Jika Anda tidak meminta reset ini, abaikan email ini — password Anda tidak berubah.</p>
  </div>`
}
