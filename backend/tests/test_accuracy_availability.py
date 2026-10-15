import unittest
from unittest.mock import patch

import app


class AccuracyAvailabilityTests(unittest.TestCase):
    def test_missing_key_never_fabricates_a_score(self):
        with patch.object(app.client, 'api_key', 'not_configured'):
            result = app.api.test_client().get('/accuracy?given=tea&real=tea')
        self.assertEqual(result.status_code, 503)
        self.assertIn('not been scored', result.get_json()['error'])

    def test_evaluator_error_and_invalid_score_are_not_cognitive_errors(self):
        for value in ('Error: offline', '100', '-1', None):
            with self.subTest(value=value), patch.object(app, 'gpt_accuracy', return_value=value):
                result = app.api.test_client().get('/accuracy?given=tea&real=tea')
                self.assertEqual(result.status_code, 503)

    def test_valid_evaluator_score_is_preserved(self):
        with patch.object(app, 'gpt_accuracy', return_value='8'):
            result = app.api.test_client().get('/accuracy?given=tea&real=tea')
        self.assertEqual(result.get_json(), 8)

    def test_missing_answers_are_rejected(self):
        client = app.api.test_client()
        self.assertEqual(client.get('/accuracy').status_code, 400)
        self.assertEqual(client.get('/accuracy?given=tea').status_code, 400)


if __name__ == '__main__':
    unittest.main()
