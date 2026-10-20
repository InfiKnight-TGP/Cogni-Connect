"""Email verification codes; development logging must be explicitly enabled."""
from email.message import EmailMessage
import os
import smtplib
import ssl


class DeliveryError(Exception):
    pass


def send_code(email, code, purpose):
    user, password = os.getenv('SMTP_USER'), os.getenv('SMTP_PASS')
    if not user or not password:
        if os.getenv('COGNI_DEV_OTP') == '1':
            print(f'[CogniConnect development {purpose} code] {email}: {code}')
            return
        raise DeliveryError('Email delivery is not configured')
    message = EmailMessage()
    message['From'] = user
    message['To'] = email
    message['Subject'] = 'Your CogniConnect verification code'
    message.set_content(f'Your code is {code}. It expires in 5 minutes. Do not share it.')
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=ssl.create_default_context(), timeout=15) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise DeliveryError('Email delivery failed') from exc
