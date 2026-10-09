r"""Checks the /people API on a temporary copy of the backend (real data is untouched).
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
import process_video as pv
pv.YUNET_MODEL = os.path.join(here, 'models', os.path.basename(pv.YUNET_MODEL))  # models stay in backend/models
pv.SFACE_MODEL = os.path.join(here, 'models', os.path.basename(pv.SFACE_MODEL))
assert os.path.exists(os.path.join(here, 'test_images', 'no_face.jpeg'))
assert not pv.has_face(os.path.join(here, 'test_images', 'no_face.jpeg'))  # no face, Haar used to accept it
c = app.api.test_client()
r = c.get('/people'); people = r.get_json()
print('import:', [(p['id'], p['name'], p['photo']) for p in people])
assert {p['photo'] for p in people} == set(os.listdir('known_faces'))
face = open('known_faces/Akash.jpeg', 'rb').read()
blank = cv2.imencode('.png', np.full((200, 200, 3), 255, np.uint8))[1].tobytes()
r = c.post('/people', data={'name': 'Blank', 'photo': (io.BytesIO(blank), 'b.png')})
print('no face ->', r.status_code, r.get_json()); assert r.status_code == 400
assert not any(f.endswith('.tmp') for f in os.listdir('known_faces'))
r = c.post('/people', data={'name': '  ravi ', 'relation': 'Son', 'phone': '+91 90000 00000', 'photo': (io.BytesIO(face), 'r.JPEG')})
print('add ->', r.status_code, r.get_json()); assert r.status_code == 201 and r.get_json()['name'] == 'Ravi'
pid = r.get_json()['id']; assert os.path.exists(f'known_faces/{pid}.jpeg')
r = c.put(f'/people/{pid}', data={'relation': 'Grandson', 'photo': (io.BytesIO(cv2.imencode('.png', cv2.imread('known_faces/Akash.jpeg'))[1].tobytes()), 'x.png')})
print('edit ->', r.status_code, r.get_json()); assert r.get_json()['photo'] == f'{pid}.png' and not os.path.exists(f'known_faces/{pid}.jpeg')
print('known-faces ->', c.get('/known-faces').get_json()['faces'][-1])
assert c.get(f'/known-faces/{pid}.png').status_code == 200
r = c.delete(f'/people/{pid}'); assert r.status_code == 200 and not os.path.exists(f'known_faces/{pid}.png')
assert c.delete('/people/nope').status_code == 404
# faces-for-date maps detected ids to names
app._load_people = lambda: [{'id': 'jawed_karim', 'name': 'jawed karim', 'photo': 'x'}, {'id': 'ab12cd34', 'name': 'Ravi', 'relation': 'Son', 'photo': 'y'}]
app._videos_for_date = lambda d: [('v.mp4', {})]
os.makedirs('video_chunks/v_chunks', exist_ok=True)
json.dump({'content/v_chunks/c.mp4': ['jawed karim', 'ab12cd34', 'Unknown']}, open('video_chunks/v_chunks/c_faces.json', 'w'))  # same shape process_video writes
json.dump({'c': 'hello there my friend'}, open('video_chunks/v_chunks/full_transcript.json', 'w'))
os.environ['OPENAI_API_KEY'] = 'not_configured'
qs = c.post('/generate-questions', json={}).get_json()['questions']
print('generate-questions ->', qs[1])
assert qs[1]['answer'] == 'Jawed Karim, Ravi (son), Unknown'
print('faces-for-date ->', c.get('/faces-for-date?date=x').get_json()['detected'])
assert c.get('/faces-for-date?date=x').get_json()['detected'] == ['Jawed Karim', 'Ravi', 'Unknown']
# display names: id -> title-cased name (+ relation), never the raw id
people = [{'id': 'jawed_karim', 'name': 'jawed karim', 'relation': ''}, {'id': 'ab12cd34', 'name': 'dinesh', 'relation': 'Son'}]
assert app.display_name('jawed karim', people) == 'Jawed Karim'
assert app.display_name('AB12CD34', people) == 'Dinesh'
assert app.display_name('ab12cd34', people, relation=True) == 'Dinesh (son)'
assert app.display_name('Unknown', people) == 'Unknown'
assert app._title('mary mcDonald') == 'Mary McDonald'
print('ALL OK')
shutil.rmtree(tmp, ignore_errors=True)
