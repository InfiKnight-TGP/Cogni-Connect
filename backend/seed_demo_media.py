"""Install the local, ignored zoo fixture into the shared demo patient only."""
from datetime import datetime
import json
from pathlib import Path
import shutil
import uuid


def _source_root(backend_root: Path):
    candidates = [
        backend_root / 'data' / '3865510069ba412f9e988094019fcef6',
        backend_root / 'pre-migration-backup',
    ]
    for root in candidates:
        content = root / 'content' / 'Me_at_the_zoo.mp4'
        chunks = next(root.glob('video_chunks/*_chunks'), None) if (root / 'video_chunks').is_dir() else None
        if content.exists() and chunks and any(chunks.glob('*.mp4')) and (chunks / 'full_transcript.json').exists():
            return root, content, chunks
    return None


def seed_demo_media(base_dir, backend_root=None):
    base = Path(base_dir).resolve()
    backend = Path(backend_root or Path(__file__).resolve().parent).resolve()
    source = _source_root(backend)
    if not source:
        print('Demo zoo media skipped: place Me_at_the_zoo.mp4 and its processed *_chunks folder with transcript/faces under backend/sample_data/demo_media/.')
        return False
    source_root, source_video, source_chunks = source
    # Remove old auto-discovered zoo aliases from the demo destination. They were
    # never user-created memories and must not reappear as separate cards.
    canonical = 'Me_at_the_zoo.mp4'
    for folder_name in ('content', 'video_chunks', 'frames'):
        folder = base / folder_name
        if not folder.exists():
            continue
        for item in list(folder.iterdir()):
            lowered = item.name.lower()
            if item.resolve() == source_chunks.resolve():
                continue
            if 'me-at-the-zoo' in lowered or 'me at the zoo' in lowered or ('yt​​down.com' in lowered) or ('ytdown.com' in lowered):
                if item.name != canonical and item.name != 'Me_at_the_zoo_chunks':
                    shutil.rmtree(item, ignore_errors=True) if item.is_dir() else item.unlink(missing_ok=True)
    # Only these files are copied. No source patient metadata or unrelated photos are copied.
    (base / 'content').mkdir(parents=True, exist_ok=True)
    (base / 'video_chunks').mkdir(parents=True, exist_ok=True)
    (base / 'frames').mkdir(parents=True, exist_ok=True)
    (base / 'known_faces').mkdir(parents=True, exist_ok=True)
    destination_video = base / 'content' / 'Me_at_the_zoo.mp4'
    if source_video.resolve() != destination_video.resolve():
        shutil.copy2(source_video, destination_video)
    destination_chunks = base / 'video_chunks' / 'Me_at_the_zoo_chunks'
    if source_chunks.resolve() != destination_chunks.resolve():
        if destination_chunks.exists(): shutil.rmtree(destination_chunks)
        shutil.copytree(source_chunks, destination_chunks)
    frame_source = next((path for path in (source_root / 'frames').glob('*') if 'zoo' in path.name.lower()), None) if (source_root / 'frames').is_dir() else None
    if frame_source and frame_source.is_dir():
        destination_frames = base / 'frames' / 'Me_at_the_zoo_chunks'
        if frame_source.resolve() != destination_frames.resolve():
            if destination_frames.exists(): shutil.rmtree(destination_frames)
            shutil.copytree(frame_source, destination_frames)
    face_source = source_root / 'known_faces' / 'jawed_karim.jpg'
    destination_face = base / 'known_faces' / 'jawed_karim.jpg'
    if face_source.exists() and face_source.resolve() != destination_face.resolve(): shutil.copy2(face_source, destination_face)
    people_path = base / 'people.json'
    try: people = json.loads(people_path.read_text(encoding='utf-8')) if people_path.exists() else []
    except (OSError, ValueError, TypeError): people = []
    if not any(person.get('id') == 'jawed_karim' for person in people):
        people.append({'id': 'jawed_karim', 'name': 'Jawed Karim', 'relation': 'Friend', 'phone': '', 'photo': 'jawed_karim.jpg'})
        people_path.write_text(json.dumps(people, ensure_ascii=False, indent=2), encoding='utf-8')
    today = datetime.now().astimezone().date().isoformat()
    journals_path = base / 'video_journals.json'
    journals = json.loads(journals_path.read_text(encoding='utf-8')) if journals_path.exists() else {}
    journals['Me_at_the_zoo.mp4'] = {'title': 'Me at the zoo', 'entry': 'A day at the zoo, looking at the elephants', 'note': 'A day at the zoo, looking at the elephants', 'timestamp': datetime.now().isoformat(), 'video_path': 'content/Me_at_the_zoo.mp4', 'date': today}
    journals_path.write_text(json.dumps(journals, ensure_ascii=False, indent=2), encoding='utf-8')
    sample_qas = backend / 'sample_data' / 'qas.json'
    if sample_qas.exists(): shutil.copy2(sample_qas, base / 'qas.json')
    memories_path = base / 'memories.json'
    memories = json.loads(memories_path.read_text(encoding='utf-8')) if memories_path.exists() else {}
    memories = {key: row for key, row in memories.items() if not (isinstance(row, dict) and row.get('filename') != canonical and 'zoo' in str(row.get('filename', '')).lower())}
    memory_id = next((key for key, row in memories.items() if isinstance(row, dict) and row.get('filename') == 'Me_at_the_zoo.mp4'), uuid.uuid4().hex)
    memories[memory_id] = {'filename': 'Me_at_the_zoo.mp4', 'title': 'Me at the zoo', 'date': today, 'note': 'A day at the zoo, looking at the elephants', 'status': 'ready', 'createdAt': datetime.now().timestamp()}
    memories_path.write_text(json.dumps(memories, ensure_ascii=False, indent=2), encoding='utf-8')
    # Generate a cached thumbnail from the first processed chunk when OpenCV is available.
    try:
        import cv2
        chunk = next(destination_chunks.glob('*.mp4'))
        cap = cv2.VideoCapture(str(chunk)); ok, frame = cap.read(); cap.release()
        if ok:
            thumb_dir = base / 'memory_thumbnails'; thumb_dir.mkdir(exist_ok=True)
            cv2.imwrite(str(thumb_dir / f'{memory_id}.png'), frame)
    except Exception as exc:
        print(f'Demo zoo thumbnail generation skipped: {exc}')
    return True


if __name__ == '__main__':
    import os
    target = Path(os.environ.get('DEMO_PATIENT_DATA', ''))
    raise SystemExit(0 if target and seed_demo_media(target) else 1)
