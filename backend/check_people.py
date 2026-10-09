"""Checks the /people API on a temporary copy of the backend (real data is untouched).
Run: .venv\Scripts\python check_people.py"""
import io, os, sys, json, shutil, tempfile
import cv2, numpy as np

here = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp()
for f in ('app.py', 'process_video.py', 'games.json'):
    shutil.copy(os.path.join(here, f), tmp)
shutil.copytree(os.path.join(here, 'known_faces'), os.path.join(tmp, 'known_faces'))
os.chdir(tmp)
sys.path.insert(0, tmp)
import app
c = app.api.test_client()
r = c.get('/people'); people = r.get_json()
print('import:', [(p['id'], p['name'], p['photo']) for p in people])
assert {p['photo'] for p in people} == set(os.listdir('known_faces'))
face = open('known_faces/Akash.jpeg', 'rb').read()
blank = cv2.imencode('.png', np.full((200, 200, 3), 255, np.uint8))[1].tobytes()
r = c.post('/people', data={'name': 'Blank', 'photo': (io.BytesIO(blank), 'b.png')})
print('no face ->', r.status_code, r.get_json()); assert r.status_code == 400
assert not any(f.endswith('.tmp') for f in os.listdir('known_faces'))
r = c.post('/people', data={'name': 'Ravi', 'relation': 'Son', 'phone': '+91 90000 00000', 'photo': (io.BytesIO(face), 'r.JPEG')})
print('add ->', r.status_code, r.get_json()); assert r.status_code == 201
pid = r.get_json()['id']; assert os.path.exists(f'known_faces/{pid}.jpeg')
r = c.put(f'/people/{pid}', data={'relation': 'Grandson', 'photo': (io.BytesIO(cv2.imencode('.png', cv2.imread('known_faces/Akash.jpeg'))[1].tobytes()), 'x.png')})
print('edit ->', r.status_code, r.get_json()); assert r.get_json()['photo'] == f'{pid}.png' and not os.path.exists(f'known_faces/{pid}.jpeg')
print('known-faces ->', c.get('/known-faces').get_json()['faces'][-1])
assert c.get(f'/known-faces/{pid}.png').status_code == 200
r = c.delete(f'/people/{pid}'); assert r.status_code == 200 and not os.path.exists(f'known_faces/{pid}.png')
assert c.delete('/people/nope').status_code == 404
# faces-for-date maps detected ids to names
app._load_people = lambda: [{'id': 'jawed_karim', 'name': 'Jawed', 'photo': 'x'}, {'id': 'ab12cd34', 'name': 'Ravi', 'photo': 'y'}]
app._videos_for_date = lambda d: [('v.mp4', {})]
os.makedirs('video_chunks/v_chunks', exist_ok=True)
json.dump({'1': ['jawed karim', 'ab12cd34', 'Unknown']}, open('video_chunks/v_chunks/c_faces.json', 'w'))
print('faces-for-date ->', c.get('/faces-for-date?date=x').get_json()['detected'])
assert c.get('/faces-for-date?date=x').get_json()['detected'] == ['Jawed', 'Ravi', 'Unknown']
print('ALL OK')
shutil.rmtree(tmp, ignore_errors=True)
