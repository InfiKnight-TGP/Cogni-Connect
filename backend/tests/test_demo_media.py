import json
from pathlib import Path
import tempfile
import unittest

from seed_demo_media import seed_demo_media


class DemoMediaTests(unittest.TestCase):
    def test_seed_is_idempotent_and_copies_only_zoo_media(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'data' / '3865510069ba412f9e988094019fcef6'; destination = root / 'demo'
            (source / 'content').mkdir(parents=True); (source / 'video_chunks' / 'Me at the zoo_chunks').mkdir(parents=True); (source / 'frames' / 'Me-at-the-zoo').mkdir(parents=True); (source / 'known_faces').mkdir(parents=True)
            (source / 'content' / 'Me_at_the_zoo.mp4').write_bytes(b'zoo'); (source / 'video_chunks' / 'Me at the zoo_chunks' / 'chunk_0000_0010.mp4').write_bytes(b'chunk'); (source / 'video_chunks' / 'Me at the zoo_chunks' / 'full_transcript.json').write_text('{}', encoding='utf-8'); (source / 'video_chunks' / 'Me at the zoo_chunks' / 'chunk_0000_0010_faces.json').write_text('{"x":["jawed_karim"]}', encoding='utf-8'); (source / 'frames' / 'Me-at-the-zoo' / '1.jpg').write_bytes(b'frame'); (source / 'known_faces' / 'jawed_karim.jpg').write_bytes(b'face'); (source / 'known_faces' / 'private.jpg').write_bytes(b'private')
            source_before = {path.relative_to(source): path.read_bytes() for path in source.rglob('*') if path.is_file()}
            (destination / 'people.json').parent.mkdir(parents=True); (destination / 'people.json').write_text(json.dumps([{'id': 'existing', 'name': 'Existing', 'photo': 'existing.jpg'}]), encoding='utf-8')
            self.assertTrue(seed_demo_media(destination, root))
            first = json.loads((destination / 'memories.json').read_text(encoding='utf-8'))
            self.assertEqual(len(first), 1); self.assertEqual(next(iter(first.values()))['title'], 'Me at the zoo')
            self.assertTrue((destination / 'video_chunks' / 'Me_at_the_zoo_chunks' / 'full_transcript.json').exists())
            people = json.loads((destination / 'people.json').read_text(encoding='utf-8'))
            self.assertEqual({person['id'] for person in people}, {'existing', 'jawed_karim'})
            self.assertTrue(seed_demo_media(destination, root))
            self.assertEqual(len(json.loads((destination / 'memories.json').read_text(encoding='utf-8'))), 1)
            self.assertEqual(source_before, {path.relative_to(source): path.read_bytes() for path in source.rglob('*') if path.is_file()})

    def test_missing_source_skips_cleanly(self):
        with tempfile.TemporaryDirectory() as temp:
            self.assertFalse(seed_demo_media(Path(temp) / 'demo', Path(temp) / 'backend'))

