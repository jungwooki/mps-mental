import importlib.util
import json
import os
from pathlib import Path
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
import recording_api
import server
from vercel_handler import VercelHandler


class VercelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), VercelHandler)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:' + str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def request(self, path, data=None):
        try:
            with urllib.request.urlopen(urllib.request.Request(self.url + path, data=data)) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_all_deployment_entrypoints_load(self):
        for name in ('health', 'summary', 'transcribe', 'consultation-summary'):
            path = Path(__file__).parent.parent / 'api' / (name + '.py')
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            self.assertTrue(issubclass(module.handler, VercelHandler))

    def test_health_and_static_file_isolation(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fake-test-only'}):
            self.assertEqual(self.request('/api/health'), (200, {'ready': True, 'model': os.environ.get('OPENAI_MODEL', 'gpt-4.1-mini')}))
        for path in ('/.env', '/server.py', '/api/summary'):
            self.assertEqual(self.request(path)[0], 405)

    def test_summary_requires_login_and_returns_json(self):
        payload = {'player': {'id': 'p1'}, 'sessions': [{'id': 's1'}]}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fake-test-only'}):
            self.assertEqual(self.request('/api/summary', json.dumps(payload).encode())[0], 401)
        self.assertEqual(self.request('/api/transcribe', b'audio')[0], 400)

    def test_firebase_environment_credential(self):
        import firebase_admin
        from firebase_admin import auth, credentials
        app = MagicMock()
        claims = {'uid': 'coach', 'mentalCoach': True}
        with patch.object(recording_api, '_admin', None), patch.dict(os.environ, {'FIREBASE_SERVICE_ACCOUNT_JSON': '{"project_id":"mpsreserve"}'}), patch.object(credentials, 'Certificate') as certificate, patch.object(firebase_admin, 'initialize_app', return_value=app) as initialize, patch.object(auth, 'verify_id_token', return_value=claims):
            self.assertEqual(recording_api.claims_for('test-token'), claims)
            certificate.assert_called_once_with({'project_id': 'mpsreserve'})
            self.assertEqual(initialize.call_args.args[0], certificate.return_value)


if __name__ == '__main__':
    unittest.main()
