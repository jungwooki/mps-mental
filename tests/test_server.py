# coding: utf-8
import importlib.util
import json
import os
import sys
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).parent.parent))
spec = importlib.util.spec_from_file_location('mental_server', Path(__file__).parent.parent / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:' + str(cls.http.server_port) + '/mps-mental/api/summary'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def setUp(self):
        server.Handler.last_requests.clear()
        self.payload = {'player': {'id': 'test-player', 'name': 'Test Athlete'},
                        'sessions': [{'id': 's1', 'note': 'coaching note'}]}

    def request(self, payload=None, token='Bearer test-token'):
        data = json.dumps(payload or self.payload).encode()
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = token
        req = urllib.request.Request(self.url, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_missing_api_key(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
            self.assertEqual(self.request()[0], 503)

    def test_authentication_required(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fake-test-only'}):
            self.assertEqual(self.request(token='')[0], 401)

    def test_maximum_four(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fake-test-only'}):
            self.payload['sessions'] *= 5
            self.assertEqual(self.request()[0], 400)

    def test_response_and_openai_contract(self):
        replies = [{'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': 'Mock summary'}]}]}]
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fake-test-only'}), patch.object(server.recording_api, 'authorize', return_value={'uid':'test-user'}), patch.object(server, 'post_json', side_effect=replies) as api:
            status, result = self.request()
            self.assertEqual(status, 200)
            self.assertEqual(result['text'], 'Mock summary')
            request = api.call_args_list[0].args[1]
            self.assertFalse(request['store'])
            self.assertEqual(json.loads(request['input'])['sessions'][0]['note'], 'coaching note')
            self.assertIn('instructions', request)

    def test_invalid_firebase_token(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fake-test-only'}), patch.object(server.recording_api, 'authorize', side_effect=server.recording_api.APIError(401,'invalid token')):
            self.assertEqual(self.request()[0], 401)

    def test_unexpected_handler_error_returns_json(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY':'fake-test-only'}), patch.object(server.recording_api, 'authorize', side_effect=RuntimeError('private request detail')):
            status, result = self.request()
            self.assertEqual(status, 500)
            self.assertIn('error', result)
            self.assertNotIn('private request detail', result['error'])

    def test_no_output_is_failure(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'fake-test-only'}), patch.object(server.recording_api, 'authorize', return_value={'uid':'test-user'}), patch.object(server, 'post_json', return_value={'output': []}):
            self.assertEqual(self.request()[0], 502)


if __name__ == '__main__':
    unittest.main()
