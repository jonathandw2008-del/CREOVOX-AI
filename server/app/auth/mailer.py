from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger("creovox.mail")


def send_login_code(email: str, code: str) -> None:
    minutes = settings.otp_ttl_minutes
    if not settings.mail_enabled:
        banner = "=" * 60
        print(f"\n{banner}\n  CREOVOX sign-in code for {email}: {code}\n  (SMTP not configured, so the code is printed here. Expires in {minutes} min.)\n{banner}\n", flush=True)
        return

    msg = EmailMessage()
    msg["Subject"] = f"Your CREOVOX sign-in code: {code}"
    msg["From"] = settings.smtp_from
    msg["To"] = email
    msg.set_content(
        f"Your CREOVOX AI sign-in code is {code}\n\n"
        f"It expires in {minutes} minutes. If you didn't request it, you can ignore this email."
    )
    msg.add_alternative(
        f"""<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#0b0d12;color:#f5f2ee;border-radius:16px">
<p style="margin:0 0 8px;color:#ff8a3d;font-size:12px;letter-spacing:.2em;text-transform:uppercase">CREOVOX AI</p>
<h1 style="margin:0 0 16px;font-size:22px">Your sign-in code</h1>
<p style="font-size:34px;font-weight:700;letter-spacing:.3em;margin:0 0 16px">{code}</p>
<p style="color:#a7a9b0;font-size:14px;margin:0">It expires in {minutes} minutes. If you didn't request it, you can ignore this email.</p>
</div>""",
        subtype="html",
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
    log.info("Sent sign-in code to %s", email)
