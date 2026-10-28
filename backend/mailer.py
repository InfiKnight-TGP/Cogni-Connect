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
        if os.getenv('COGNI_DEV_OTP', '0') == '1':
            print(f'[CogniConnect development {purpose} code] {email}: {code}')
            return
        raise DeliveryError('Email is not configured')
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


def send_alert(email, patient_name, created_at, device_label, location=None):
    user, password = os.getenv('SMTP_USER'), os.getenv('SMTP_PASS')
    if not user or not password:
        return False
    message = EmailMessage()
    message['From'] = user
    message['To'] = email
    message['Subject'] = f'CogniConnect caregiver alert for {patient_name}'
    body = [
        f'Caregiver alert for {patient_name}.',
        f'Time: {created_at}',
        f'Device: {device_label or "Patient device"}',
    ]
    if location:
        body.append(f'Location: https://maps.google.com/?q={location["lat"]},{location["lng"]}')
        if location.get('accuracy') is not None:
            body.append(f'Location accuracy: {location["accuracy"]} metres')
    body.append('This alert was raised in CogniConnect. Contact the patient directly if needed.')
    message.set_content('\n'.join(body))
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=ssl.create_default_context(), timeout=15) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise DeliveryError('Alert email delivery failed') from exc
    return True
