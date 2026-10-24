from tests.auth_support import setup_auth
import io
import unittest
from unittest.mock import MagicMock, patch

import app


class SpeechAvailabilityTests(unittest.TestCase):
    def setUp(self):
        setup_auth(self, "patient_device")

    def test_transcribe_without_key_returns_service_unavailable(self):
        with patch.object(app, 'client', MagicMock(api_key='not_configured')):
            response = self.auth_client.post(
                '/transcribe', data={'audio': (io.BytesIO(b'audio'), 'answer.webm'), 'language': 'en-IN'}
            )
        self.assertEqual(response.status_code, 503)

    def test_transcribe_rejects_oversized_upload(self):
        payload = b'x' * (app.MAX_TRANSCRIPTION_BYTES + 1)
        with patch.object(app, 'client', MagicMock(api_key='test-key')):
            response = self.auth_client.post(
                '/transcribe', data={'audio': (io.BytesIO(payload), 'answer.webm'), 'language': 'en-IN'}
            )
        self.assertEqual(response.status_code, 413)


if __name__ == '__main__':
    unittest.main()
