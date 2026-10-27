"""Validation and opening-hours helpers for saved patient places."""
import re
from urllib.parse import urlsplit


CATEGORIES = {'home', 'shop', 'doctor', 'temple', 'family', 'park', 'other'}
WEEKDAYS = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
_TIME_PATTERN = re.compile(r'^(?:[01]\d|2[0-3]):[0-5]\d$')


def is_google_maps_url(value):
    if not isinstance(value, str) or not value or len(value) > 300:
        return False
    if '\\' in value or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value):
        return False
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return False
    if parsed.scheme.lower() != 'https' or not parsed.netloc or parsed.username is not None or parsed.password is not None:
        return False
    if port not in (None, 443):
        return False
    host = parsed.hostname
    if host not in {'maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com'}:
        return False
    if host in {'goo.gl', 'www.google.com', 'google.com'} and not parsed.path.startswith('/maps'):
        return False
    return True


def validate_hours(hours):
    if hours is None:
        return None
    if not isinstance(hours, dict) or set(hours) - {'opensAt', 'closesAt', 'closedDays'}:
        raise ValueError('Hours must include opening times and closed days.')
    opens_at = hours.get('opensAt', '')
    closes_at = hours.get('closesAt', '')
    closed_days = hours.get('closedDays', [])
    if not isinstance(opens_at, str) or not isinstance(closes_at, str):
        raise ValueError('Opening and closing times must use HH:MM.')
    if bool(opens_at) != bool(closes_at):
        raise ValueError('Set both opening and closing times, or leave both empty.')
    if opens_at and (not _TIME_PATTERN.fullmatch(opens_at) or not _TIME_PATTERN.fullmatch(closes_at)):
        raise ValueError('Opening and closing times must use HH:MM.')
    if not isinstance(closed_days, list) or any(
        not isinstance(day, str) or day not in WEEKDAYS for day in closed_days
    ):
        raise ValueError('Choose valid closed days.')
    if len(set(closed_days)) != len(closed_days):
        raise ValueError('A closed day can only be selected once.')
    if not opens_at and not closed_days:
        return None
    return {'opensAt': opens_at, 'closesAt': closes_at, 'closedDays': closed_days}


def validate_place_fields(payload, existing=None):
    if not isinstance(payload, dict):
        raise ValueError('Place details are required.')
    allowed = {'name', 'category', 'mapsUrl', 'note', 'hours'}
    if set(payload) - allowed:
        raise ValueError('Place details contain an unknown field.')
    result = {
        key: (existing or {}).get(key)
        for key in allowed
        if key in (existing or {})
    }
    for field in ('name', 'category', 'mapsUrl'):
        if field in payload:
            result[field] = payload[field]
        elif existing is None:
            raise ValueError('Name, category, and Google Maps link are required.')

    name = result.get('name')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 60:
        raise ValueError('Name must be between 1 and 60 characters.')
    name = name.strip()
    if any(ord(char) < 32 or ord(char) == 127 for char in name):
        raise ValueError('Name must not contain control characters.')
    result['name'] = name

    if not isinstance(result.get('category'), str) or result['category'] not in CATEGORIES:
        raise ValueError('Choose a valid category.')
    if not is_google_maps_url(result.get('mapsUrl')):
        raise ValueError('Please paste a link from Google Maps (the Share button).')

    note = payload.get('note', (existing or {}).get('note', ''))
    if not isinstance(note, str) or len(note) > 120:
        raise ValueError('Note must be 0 to 120 characters.')
    if any(ord(char) < 32 and char not in '\t\n\r' or ord(char) == 127 for char in note):
        raise ValueError('Note must not contain control characters.')
    result['note'] = note.strip()
    if 'hours' in payload:
        result['hours'] = validate_hours(payload['hours'])
    elif existing is not None:
        result['hours'] = existing.get('hours')
    else:
        result['hours'] = None
    return result


def is_open_at(place, weekday, local_time):
    if weekday not in WEEKDAYS or not isinstance(local_time, str) or not _TIME_PATTERN.fullmatch(local_time):
        return False
    hours = place.get('hours') if isinstance(place, dict) else None
    if not isinstance(hours, dict) or weekday in hours.get('closedDays', []):
        return False
    opens_at, closes_at = hours.get('opensAt'), hours.get('closesAt')
    if not isinstance(opens_at, str) or not isinstance(closes_at, str):
        return False
    if not _TIME_PATTERN.fullmatch(opens_at) or not _TIME_PATTERN.fullmatch(closes_at):
        return False
    if opens_at == closes_at:
        return True
    if closes_at < opens_at:
        return local_time >= opens_at or local_time < closes_at
    return opens_at <= local_time < closes_at
