import json
import os
from pathlib import Path
import sys
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch, MagicMock
from http.server import ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).parent.parent))
import server
import recording_api as api

class RecordingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
        cls.url='http://127.0.0.1:'+str(cls.http.server_port)
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close()
    def setUp(self):
        server.Handler.last_requests.clear()
    def request(self,path,body=b'audio',headers=None):
        req=urllib.request.Request(self.url+'/api/'+path,data=body,headers={'Authorization':'Bearer token','X-Player-ID':'p1','X-Session-ID':'s1','Content-Type':'audio/webm',**(headers or {})})
        try:
            with urllib.request.urlopen(req) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as error:return error.code,json.load(error)
    def test_transcription_then_summary_binding(self):
        summary={k:[] for k in api.KEYS}
        with patch.object(api,'authorize',return_value={'uid':'coach'}),patch.object(api,'transcribe',return_value='실수 후 집중력이 떨어집니다.'),patch.object(api,'summarize',return_value=summary):
            status,result=self.request('transcribe');self.assertEqual(status,200);self.assertEqual(result['playerId'],'p1');self.assertEqual(result['sessionId'],'s1')
            status,result=self.request('consultation-summary',json.dumps({'transcript':'기록'}).encode());self.assertEqual(status,200);self.assertEqual(result['summary'],summary)
    def test_no_auth_and_missing_session(self):
        with patch.object(api,'claims_for',side_effect=api.APIError(401,'login')):
            self.assertEqual(self.request('transcribe',headers={'Authorization':''})[0],401)
        self.assertEqual(self.request('transcribe',headers={'X-Session-ID':''})[0],400)
    def test_cross_player_denied(self):
        with patch.object(api,'claims_for',return_value={'uid':'coach','mentalPlayerIds':['p2']}):
            self.assertEqual(self.request('transcribe')[0],403)
    def test_session_mismatch_denied(self):
        response=MagicMock();response.__enter__.return_value.read.return_value=b'{"fields":{"playerId":{"stringValue":"p2"}}}'
        with patch.object(api,'claims_for',return_value={'uid':'coach','mentalPlayerIds':['p1']}),patch.object(api.urllib.request,'urlopen',return_value=response):
            with self.assertRaises(api.APIError) as error:api.authorize('token','p1',['s1'])
            self.assertEqual(error.exception.status,403)
    def test_origin_denied(self):
        self.assertEqual(self.request('transcribe',headers={'Origin':'https://foreign.example'})[0],403)
    def test_stt_sdk_korean_and_summary_schema(self):
        client=MagicMock();client.audio.transcriptions.create.return_value.text='훈련 3회, CDM'
        value={k:[] for k in api.KEYS};client.responses.create.return_value.output_text=json.dumps(value);client.responses.create.return_value.status='completed'
        with patch.dict(os.environ, {'OPENAI_TRANSCRIBE_MODEL':'gpt-4o-transcribe'}),patch.object(api,'client',return_value=client):
            self.assertEqual(api.transcribe(b'audio','audio/mp4'),'훈련 3회, CDM');self.assertEqual(api.summarize('훈련 3회'),value)
        stt=client.audio.transcriptions.create.call_args.kwargs;self.assertEqual(stt['language'],'ko');self.assertEqual(stt['file'][0],'consultation.mp4')
        request=client.responses.create.call_args.kwargs;self.assertFalse(request['store']);self.assertTrue(request['text']['format']['strict'])
    def test_failures_safe_and_invalid_model_output(self):
        with patch.object(api,'client',side_effect=api.APIError(503,'not ready')):
            with self.assertRaises(api.APIError):api.transcribe(b'audio','audio/webm')
        client=MagicMock();client.responses.create.return_value.status='incomplete'
        with patch.object(api,'client',return_value=client):
            with self.assertRaises(api.APIError) as error:api.summarize('민감한 녹취')
            self.assertNotIn('민감한',error.exception.message)
    def test_diarization_preserves_speakers_without_guessing_roles(self):
        client=MagicMock()
        client.audio.transcriptions.create.return_value.segments=[MagicMock(speaker='A',text='실수했습니다.',start=0,end=1),MagicMock(speaker='B',text='다음 행동을 정해봅시다.',start=1,end=3),MagicMock(speaker='A',text='호흡하겠습니다.',start=3,end=4)]
        with patch.dict(os.environ,{'OPENAI_TRANSCRIBE_MODEL':'gpt-4o-transcribe-diarize'}),patch.object(api,'client',return_value=client):
            value=api.transcribe(b'audio','audio/webm')
        self.assertEqual([s['label'] for s in value['segments']],['화자 1','화자 2','화자 1'])
        self.assertTrue(value['diarized'])
        options=client.audio.transcriptions.create.call_args.kwargs
        self.assertEqual(options['response_format'],'diarized_json')
        self.assertEqual(options['chunking_strategy'],'auto')
        self.assertNotIn('prompt',options)

    def test_unsupported_audio(self):
        with self.assertRaises(api.APIError):api.transcribe(b'audio','text/plain')

if __name__=='__main__':unittest.main()
