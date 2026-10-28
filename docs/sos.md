# SOS alerts

SOS is a helper for a paired patient device or patient login to alert linked caregivers. It does not contact emergency services. In an emergency, call 112 yourself.

The backend stores alerts in each patient's `alerts.json` file. A real alert may email every linked caregiver when SMTP is configured; email failures do not prevent alert creation. Test alerts stay local and never send email. Locations are optional per alert, visible only to linked caregivers, removed after 30 days, and alerts are deleted after 90 days. Alerts are limited to one per minute and five per hour per session.

Cross-device delivery requires both devices to reach the same hosted backend over HTTPS. Browser geolocation requires HTTPS or localhost; if permission is denied or on an insecure origin, the alert is sent without location. Browser notifications require the caregiver's alert page or app tab to remain open and notification permission to be enabled. SOS is a helper for linked caregivers, not emergency services, and does not call or test emergency numbers.
