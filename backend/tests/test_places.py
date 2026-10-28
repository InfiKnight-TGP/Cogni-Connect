import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

import app
import auth
import db
from patient_storage import FILES, initialize_patient
from places import is_google_maps_url, is_open_at


class PlacesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self._cleanup)
        self.root = Path(self.temp.name)
        self.data_root = self.root / 'data'
        self.data_root.mkdir()
        config = patch.dict(app.api.config, {
            'TESTING': True,
            'AUTH_DATABASE': str(self.root / 'auth.db'),
            'PATIENT_DATA_ROOT': str(self.data_root),
            'STORAGE_MIGRATION': False,
            'AUTH_COOKIE_SECURE': False,
            'AUTH_DEMO': True,
            'AUTH_ORIGINS': ['http://localhost:3000'],
        })
        config.start()
        self.addCleanup(config.stop)
        limiter = patch.dict(app.api.extensions, {'auth_limits': auth.RateLimits()})
        limiter.start()
        self.addCleanup(limiter.stop)

        self.patient_ids = {
            'self': 'patient-self',
            'other': 'patient-other',
            'demo': 'patient-demo',
            'login': 'patient-login',
        }
        for name, patient_id in self.patient_ids.items():
            initialize_patient(self.data_root / patient_id, name)

        with app.api.app_context():
            connection = db.get_connection()
            for user_id, email, role, is_demo in (
                ('self-user', 'self@example.com', 'self', 0),
                ('other-user', 'other@example.com', 'self', 0),
                ('caregiver-user', 'caregiver@example.com', 'caregiver', 0),
                ('patient-user', 'patient@example.com', 'patient', 0),
                ('demo-user', 'demo@example.com', 'caregiver', 1),
            ):
                connection.execute(
                    'INSERT INTO users (id,email,name,password_hash,failed_logins,locked_until,created_at,is_demo,role,patient_id,otp_target) '
                    'VALUES (?,?,?,?,0,0,?,? ,?,NULL,?)',
                    (user_id, email, user_id, 'unused', auth.now(), is_demo, role, 'caregiver')
                )
            for name, patient_id, user_id, is_demo in (
                ('self', self.patient_ids['self'], 'self-user', 0),
                ('other', self.patient_ids['other'], 'other-user', 0),
                ('demo', self.patient_ids['demo'], 'demo-user', 1),
                ('login', self.patient_ids['login'], 'self-user', 0),
            ):
                connection.execute(
                    'INSERT INTO patients (id,name,pin_hash,created_by,created_at,is_demo) VALUES (?,?,?,?,?,?)',
                    (patient_id, name, None, user_id, auth.now(), is_demo)
                )
            connection.execute('UPDATE users SET patient_id=? WHERE id=?',
                               (self.patient_ids['self'], 'self-user'))
            connection.execute('UPDATE users SET patient_id=? WHERE id=?',
                               (self.patient_ids['other'], 'other-user'))
            connection.execute('UPDATE users SET patient_id=? WHERE id=?',
                               (self.patient_ids['login'], 'patient-user'))
            connection.execute('UPDATE users SET patient_id=? WHERE id=?',
                               (self.patient_ids['demo'], 'demo-user'))
            connection.execute('INSERT INTO patient_members VALUES (?,?,"owner")',
                               (self.patient_ids['self'], 'self-user'))
            connection.execute('INSERT INTO patient_members VALUES (?,?,"owner")',
                               (self.patient_ids['other'], 'other-user'))
            connection.execute('INSERT INTO patient_members VALUES (?,?,"caregiver")',
                               (self.patient_ids['self'], 'caregiver-user'))
            connection.execute('INSERT INTO patient_members VALUES (?,?,"owner")',
                               (self.patient_ids['demo'], 'demo-user'))
            connection.execute('INSERT INTO patient_members VALUES (?,?,"owner")',
                               (self.patient_ids['login'], 'patient-user'))
            tokens = {
                'self': auth.new_session('caregiver', user_id='self-user')[0],
                'other': auth.new_session('caregiver', user_id='other-user')[0],
                'caregiver': auth.new_session('caregiver', user_id='caregiver-user')[0],
                'device': auth.new_session('patient_device', patient_id=self.patient_ids['self'])[0],
                'patient_login': auth.new_session('patient_device', user_id='patient-user',
                                                  patient_id=self.patient_ids['login'])[0],
                'demo': auth.new_session('caregiver', user_id='demo-user')[0],
            }
        self.clients = {}
        for name, kind in (
            ('self', 'caregiver'), ('other', 'caregiver'), ('caregiver', 'caregiver'),
            ('device', 'patient_device'), ('patient_login', 'patient_device'), ('demo', 'caregiver'),
        ):
            client = app.api.test_client()
            client.set_cookie(auth.COOKIES[kind], tokens[name])
            self.clients[name] = client

    def _cleanup(self):
        db.close_connection()
        self.temp.cleanup()

    @staticmethod
    def place(name='Home', **overrides):
        result = {
            'name': name,
            'category': 'home',
            'mapsUrl': 'https://maps.app.goo.gl/eSt7vqF6MTX7NyHy8',
            'note': '',
            'hours': None,
        }
        result.update(overrides)
        return result

    def add_place(self, client=None, **overrides):
        return (client or self.clients['self']).post(
            '/places', json=self.place(**overrides)
        )

    @staticmethod
    def image_bytes(image_format='PNG'):
        content = io.BytesIO()
        Image.new('RGB', (40, 30), color='blue').save(content, format=image_format)
        return content.getvalue()

    def test_patient_storage_initializes_places_file(self):
        self.assertIn('places.json', FILES)
        self.assertEqual(json.loads((self.data_root / self.patient_ids['self'] / 'places.json').read_text(encoding='utf-8')), [])
        self.assertTrue((self.data_root / self.patient_ids['self'] / 'place_photos').is_dir())
        self.assertEqual(self.clients['self'].get('/places').json, [])

    def test_google_maps_url_allowlist(self):
        for url in (
            'https://maps.app.goo.gl/place',
            'https://maps.google.com/?q=place',
            'https://goo.gl/maps/place',
            'https://www.google.com/maps/place',
            'https://google.com/maps/place',
            'https://maps.app.goo.gl:443/place',
        ):
            with self.subTest(url=url):
                self.assertTrue(is_google_maps_url(url))
        for url in (
            'http://maps.app.goo.gl/place',
            'javascript:alert(1)',
            'https://maps.app.goo.gl.evil.com/place',
            'https://goo.gl/place',
            'https://www.google.com/search?q=place',
            'https://user:pass@maps.app.goo.gl/place',
            'https://maps.app.goo.gl:444/place',
            'https://maps.app.goo.gl\\@evil.com/place',
            'https://maps.app.goo.gl/' + 'a' * 300,
            'https://maps.app.goo.gl/place\n',
        ):
            with self.subTest(url=url):
                self.assertFalse(is_google_maps_url(url))

    def test_place_crud_for_self_and_caregiver(self):
        created = self.add_place(name='  Family home  ', note='Near the park')
        self.assertEqual(created.status_code, 201)
        place = created.json
        self.assertRegex(place['id'], r'^[0-9a-f]{32}$')
        self.assertEqual(place['name'], 'Family home')
        self.assertEqual(place['note'], 'Near the park')
        self.assertEqual(self.clients['self'].get('/places').json, [place])
        updated = self.clients['caregiver'].put(
            f"/places/{place['id']}", json={'name': 'Family house'}
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json['name'], 'Family house')
        self.assertEqual(self.clients['caregiver'].delete(f"/places/{place['id']}").status_code, 200)
        self.assertEqual(self.clients['self'].get('/places').json, [])

    def test_device_and_patient_login_can_read_but_cannot_mutate(self):
        created = self.add_place()
        place_id = created.json['id']
        for client_name in ('device', 'patient_login'):
            client = self.clients[client_name]
            with self.subTest(client=client_name):
                self.assertEqual(client.get('/places').status_code, 200)
                self.assertEqual(client.post('/places', json=self.place()).status_code, 403)
                self.assertEqual(client.put(f'/places/{place_id}', json={'name': 'Changed'}).status_code, 403)
                self.assertEqual(client.delete(f'/places/{place_id}').status_code, 403)
                self.assertEqual(client.post(f'/places/{place_id}/photo').status_code, 403)

    def test_other_patient_place_and_photo_are_not_disclosed(self):
        response = self.add_place()
        place_id = response.json['id']
        self.assertEqual(self.clients['other'].get('/places').json, [])
        self.assertEqual(self.clients['other'].put(f'/places/{place_id}', json={'name': 'Changed'}).status_code, 404)
        self.assertEqual(self.clients['other'].delete(f'/places/{place_id}').status_code, 404)

    def test_maps_url_and_place_fields_are_validated(self):
        for invalid in (
            {'mapsUrl': 'https://example.com'},
            {'mapsUrl': 'http://maps.app.goo.gl/place'},
            {'category': 'airport'},
            {'category': ['home']},
            {'name': ' '},
            {'name': 'x' * 61},
            {'note': 'x' * 121},
            {'extra': 'not permitted'},
        ):
            with self.subTest(invalid=invalid):
                response = self.add_place(**invalid)
                self.assertEqual(response.status_code, 400)
        self.assertEqual(self.clients['self'].get('/places').json, [])

    def test_self_and_caregiver_each_support_full_crud(self):
        for role in ('self', 'caregiver'):
            with self.subTest(role=role):
                client = self.clients[role]
                created = self.add_place(client, name=role)
                self.assertEqual(created.status_code, 201)
                path = f"/places/{created.json['id']}"
                self.assertEqual(client.put(path, json={'note': 'Updated'}).status_code, 200)
                self.assertEqual(client.delete(path).status_code, 200)

    def test_patient_cannot_be_selected_in_place_payload(self):
        result = self.add_place(patient_id=self.patient_ids['other'])
        self.assertEqual(result.status_code, 400)
        self.assertEqual(self.clients['self'].get('/places').json, [])
        self.assertEqual(self.clients['other'].get('/places').json, [])

    def test_other_patient_cannot_upload_photo(self):
        place_id = self.add_place().json['id']
        response = self.clients['other'].post(
            f'/places/{place_id}/photo',
            data={'photo': (io.BytesIO(self.image_bytes()), 'photo.png')},
        )
        self.assertEqual(response.status_code, 404)

    def test_photo_replacement_removes_old_photo(self):
        place_id = self.add_place().json['id']
        photos = []
        for role in ('self', 'caregiver'):
            response = self.clients[role].post(
                f'/places/{place_id}/photo',
                data={'photo': (io.BytesIO(self.image_bytes()), 'photo.png')},
            )
            self.assertEqual(response.status_code, 200)
            photos.append(response.json['photo'])
        self.assertNotEqual(*photos)
        folder = self.data_root / self.patient_ids['self'] / 'place_photos'
        self.assertFalse((folder / photos[0]).exists())
        self.assertTrue((folder / photos[1]).exists())
        self.assertEqual(self.clients['device'].get(f'/place-photos/{photos[0]}').status_code, 404)
        response = self.clients['device'].get(f'/place-photos/{photos[1]}')
        self.assertEqual(response.status_code, 200)
        response.close()

    def test_photo_rejects_unsupported_format_and_large_dimensions(self):
        place_id = self.add_place().json['id']
        large = io.BytesIO()
        Image.new('RGB', (8001, 1)).save(large, format='PNG')
        for content in (self.image_bytes('GIF'), large.getvalue()):
            response = self.clients['self'].post(
                f'/places/{place_id}/photo',
                data={'photo': (io.BytesIO(content), 'photo.png')},
            )
            self.assertEqual(response.status_code, 400)
        self.assertIsNone(self.clients['self'].get('/places').json[0]['photo'])

    def test_structured_hours_validation_and_past_midnight(self):
        place = self.place(hours={
            'opensAt': '20:00',
            'closesAt': '02:00',
            'closedDays': ['Sunday'],
        })
        response = self.clients['self'].post('/places', json=place)
        self.assertEqual(response.status_code, 201)
        saved = response.json
        self.assertTrue(is_open_at(saved, 'Monday', '23:00'))
        self.assertTrue(is_open_at(saved, 'Monday', '01:00'))
        self.assertFalse(is_open_at(saved, 'Sunday', '23:00'))
        self.assertFalse(is_open_at(saved, 'Monday', '12:00'))
        self.assertFalse(is_open_at(saved, 'Monday', '24:00'))
        for hours in (
            {'opensAt': '20:00', 'closesAt': ''},
            {'opensAt': '25:00', 'closesAt': '02:00'},
            {'opensAt': '20:00', 'closesAt': '02:00', 'closedDays': ['Funday']},
            {'opensAt': '20:00', 'closesAt': '02:00', 'closedDays': [{}]},
            {'opensAt': '', 'closesAt': '', 'closedDays': ['Monday', 'Monday']},
        ):
            with self.subTest(hours=hours):
                self.assertEqual(self.add_place(name='Invalid hours', hours=hours).status_code, 400)

    def test_photo_upload_serving_scoping_and_place_deletion(self):
        for image_format, extension in (('JPEG', 'jpg'), ('PNG', 'png'), ('WEBP', 'webp')):
            with self.subTest(image_format=image_format):
                place_id = self.add_place(name=f'{image_format} place').json['id']
                response = self.clients['self'].post(
                    f'/places/{place_id}/photo',
                    data={'photo': (io.BytesIO(self.image_bytes(image_format)), 'uploaded-image')},
                    content_type='multipart/form-data',
                )
                self.assertEqual(response.status_code, 200)
                filename = response.json['photo']
                self.assertRegex(filename, rf'^[0-9a-f]{{32}}\.{extension}$')
                photo_path = self.data_root / self.patient_ids['self'] / 'place_photos' / filename
                self.assertTrue(photo_path.is_file())
                served = self.clients['self'].get(f'/place-photos/{filename}')
                self.assertEqual(served.status_code, 200)
                served.close()
                self.assertEqual(self.clients['other'].get(f'/place-photos/{filename}').status_code, 404)
                self.assertEqual(self.clients['self'].delete(f'/places/{place_id}').status_code, 200)
                self.assertFalse(photo_path.exists())
                self.assertEqual(self.clients['self'].get(f'/place-photos/{filename}').status_code, 404)

    def test_photo_rejects_invalid_and_oversized_files(self):
        place_id = self.add_place().json['id']
        invalid = self.clients['self'].post(
            f'/places/{place_id}/photo',
            data={'photo': (io.BytesIO(b'not an image'), 'photo.png')},
            content_type='multipart/form-data',
        )
        self.assertEqual(invalid.status_code, 400)
        oversized = self.clients['self'].post(
            f'/places/{place_id}/photo',
            data={'photo': (io.BytesIO(b'x' * (5 * 1024 * 1024 + 1)), 'large.png')},
            content_type='multipart/form-data',
        )
        self.assertEqual(oversized.status_code, 413)

    def test_places_limits_endpoint(self):
        self_res = self.clients['self'].get('/places/limits')
        self.assertEqual(self_res.status_code, 200)
        self.assertEqual(self_res.json, {'limit': 30, 'demo': False})

        demo_res = self.clients['demo'].get('/places/limits')
        self.assertEqual(demo_res.status_code, 200)
        self.assertEqual(demo_res.json, {'limit': 12, 'demo': True})

    def test_normal_and_demo_place_caps(self):
        for index in range(30):
            response = self.add_place(name=f'Place {index}')
            self.assertEqual(response.status_code, 201)
        exceeded = self.add_place(name='Place 31')
        self.assertEqual(exceeded.status_code, 400)
        self.assertEqual(exceeded.json, {'error': 'You can save at most 30 places.'})

        for index in range(12):
            response = self.add_place(self.clients['demo'], name=f'Demo place {index}')
            self.assertEqual(response.status_code, 201)
        demo_exceeded = self.add_place(self.clients['demo'], name='Demo place 13')
        self.assertEqual(demo_exceeded.status_code, 400)
        self.assertEqual(demo_exceeded.json, {'error': 'You can save at most 12 places.'})

    def test_demo_mutations_are_rate_limited(self):
        with patch.object(auth.RateLimits, 'hit', return_value=False):
            response = self.add_place(self.clients['demo'])
        self.assertEqual(response.status_code, 429)

    def test_demo_reset_restores_empty_places(self):
        response = self.add_place(self.clients['demo'])
        place_id = response.json['id']
        self.assertTrue(response.status_code == 201)
        reset = self.clients['demo'].post('/demo/reset')
        self.assertEqual(reset.status_code, 200)
        places_file = self.data_root / self.patient_ids['demo'] / 'places.json'
        self.assertTrue(places_file.is_file())
        self.assertEqual(json.loads(places_file.read_text(encoding='utf-8')), [])
        self.assertNotIn(place_id, places_file.read_text(encoding='utf-8'))
