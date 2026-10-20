"""Check people CRUD against a temporary copy of one patient's data."""
import io
import shutil
import unittest
from pathlib import Path
from patient_storage import cli_data_dir


def main():
    base, _ = cli_data_dir()
    from tests.auth_support import setup_auth
    import app
    import process_video as pv
    import cv2
    import numpy as np
    fixture = unittest.TestCase()
    setup_auth(fixture)
    try:
        photos = base / 'known_faces'
        shutil.copytree(photos, app.KNOWN_FACES_FOLDER, dirs_exist_ok=True)
        if (base / 'people.json').exists():
            shutil.copy2(base / 'people.json', app.PEOPLE_FILE)
        else:
            Path(app.PEOPLE_FILE).unlink(missing_ok=True)
        client = fixture.auth_client
        assert isinstance(client.get('/people').get_json(), list)
        blank = cv2.imencode('.png', np.full((200, 200, 3), 255, np.uint8))[1].tobytes()
        assert client.post('/people', data={'name': 'Blank', 'photo': (io.BytesIO(blank), 'blank.png')}).status_code == 400
        photo = next((p for p in photos.iterdir() if p.suffix.lower() in ('.png', '.jpg', '.jpeg') and pv.has_face(str(p))), None)
        if photo is None:
            raise RuntimeError('Add a usable face photo to this patient before running CRUD checks')
        response = client.post('/people', data={'name': 'Test person', 'photo': (io.BytesIO(photo.read_bytes()), photo.name)})
        assert response.status_code == 201, response.get_json()
        person = response.get_json()
        assert client.put('/people/' + person['id'], data={'relation': 'Friend'}).status_code == 200
        assert client.get('/known-faces/' + person['photo']).status_code == 200
        assert client.delete('/people/' + person['id']).status_code == 200
        assert client.get('/known-faces/' + person['photo']).status_code == 404
        print('People checks passed using temporary data.')
    finally:
        fixture.doCleanups()


if __name__ == '__main__':
    main()
