import io
import unittest
from unittest.mock import patch

import app


class SpeechAvailabilityTests(unittest.TestCase):
    def test_transcribe_without_key_returns_service_unavailable(self):
        with patch.object(app.client, 'api_key', 'not_configured'):
            response = app.api.test_client().post(
                '/transcribe', data={'audio': (io.BytesIO(b'audio'), 'answer.webm'), 'language': 'en-IN'}
            )
        self.assertEqual(response.status_code, 503)

    def test_transcribe_rejects_oversized_upload(self):
        payload = b'x' * (app.MAX_TRANSCRIPTION_BYTES + 1)
        with patch.object(app.client, 'api_key', 'test-key'):
            response = app.api.test_client().post(
                '/transcribe', data={'audio': (io.BytesIO(payload), 'answer.webm'), 'language': 'en-IN'}
            )
        self.assertEqual(response.status_code, 413)


if __name__ == '__main__':
    unittest.main()
