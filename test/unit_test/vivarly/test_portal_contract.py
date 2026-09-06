"""Run with Python directly; exercises PHP cURL against a local mock, without RAGFlow/MySQL."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


ROOT = Path(__file__).resolve().parents[3]
PORTAL = ROOT / 'docker/vivarly'


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def dispatch(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        self.server.requests.append((self.command, self.path, dict(self.headers), body))
        status, content_type, response = self.server.replies.pop(0)
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.end_headers()
        self.wfile.write(response.encode())

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = dispatch


class PortalContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.server.requests = []
        self.server.replies = []

    def reply(self, data=None, status=200, raw=None):
        self.server.replies.append((status, 'application/json' if raw is None else 'text/event-stream',
                                    json.dumps({'code': 0, 'data': data}) if raw is None else raw))

    def call(self, method, *args):
        env = dict(os.environ, RAGFLOW_BASE_URL=f'http://127.0.0.1:{self.server.server_port}',
                   RAGFLOW_API_KEY='contract-test-key', DEBUG_MODE='0',
                   NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost',
                   HTTP_PROXY='', HTTPS_PROXY='', ALL_PROXY='', http_proxy='', https_proxy='', all_proxy='')
        code = 'require $argv[1]; $api = new RAGFlowAPI(); echo json_encode($api->{$argv[2]}(...json_decode($argv[3], true)));'
        result = subprocess.run(['php', '-r', code, str(PORTAL / 'ragflow_api.php'), method, json.dumps(args)],
                                env=env, capture_output=True, text=True, encoding='utf-8', timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_delete_dataset_collection(self):
        self.reply(True)
        self.assertEqual(self.call('deleteDataset', 'dataset')['code'], 0)
        method, path, headers, body = self.server.requests[0]
        self.assertEqual((method, path), ('DELETE', '/api/v1/datasets'))
        self.assertEqual(json.loads(body), {'ids': ['dataset']})
        self.assertEqual(headers['Authorization'], 'Bearer contract-test-key')

    def test_delete_session_collection(self):
        self.reply(True)
        self.call('deleteChatSession', 'chat', 'session')
        method, path, _, body = self.server.requests[0]
        self.assertEqual((method, path), ('DELETE', '/api/v1/chats/chat/sessions'))
        self.assertEqual(json.loads(body), {'ids': ['session']})

    def test_document_patch(self):
        self.reply({})
        self.call('updateDocument', 'kb', 'doc', {'name': 'new.pdf'})
        self.assertEqual(self.server.requests[0][:2], ('PATCH', '/api/v1/datasets/kb/documents/doc'))

    def test_graph_current_routes(self):
        self.reply({})
        self.call('getDatasetGraph', 'kb')
        self.reply({})
        self.call('runGraphRAG', 'kb')
        self.assertEqual([r[:2] for r in self.server.requests],
                         [('GET', '/api/v1/datasets/kb/graph'), ('POST', '/api/v1/datasets/kb/index?type=graph')])

    def test_chat_current_payload(self):
        self.reply({'answer': 'hello'})
        self.call('sendChatMessage', 'chat', 'session', 'hello', True)
        method, path, _, body = self.server.requests[0]
        self.assertEqual((method, path), ('POST', '/api/v1/chat/completions'))
        self.assertEqual(json.loads(body), {'chat_id': 'chat', 'session_id': 'session',
                                          'messages': [{'role': 'user', 'content': 'hello'}], 'stream': False})

    def test_empty_session_payload_is_object(self):
        self.reply({'id': 'session'})
        self.call('createChatSession', 'chat')
        self.assertEqual(json.loads(self.server.requests[0][3]), {})

    def test_agent_creation_contains_executable_canvas(self):
        self.reply({'id': 'agent'})
        self.call('createAgent', 'test', 'description')
        payload = json.loads(self.server.requests[0][3])
        self.assertEqual(payload['title'], 'test')
        dsl = payload['dsl']
        self.assertEqual(dsl['components']['begin']['obj']['component_name'], 'Begin')
        for component in dsl['components'].values():
            for target in component['downstream']:
                self.assertIn(target, dsl['components'])
        for edge in dsl['graph']['edges']:
            self.assertIn(edge['source'], dsl['components'])
            self.assertIn(edge['target'], dsl['components'])

    def test_agent_openai_uses_current_route(self):
        self.reply({})
        self.call('converseAgentOpenAI', 'agent', 'hello')
        self.assertEqual(self.server.requests[0][:2], ('POST', '/api/v1/agents/chat/completions'))
        self.assertTrue(json.loads(self.server.requests[0][3])['openai-compatible'])

    def test_agent_failure_never_simulated(self):
        self.reply(status=502, raw='<html>Bad gateway</html>')
        result = self.call('converseAgent', 'agent', 'hello')
        self.assertEqual(result['code'], 502)
        self.assertNotIn('sim_', json.dumps(result))

    def test_malformed_success_is_failure(self):
        self.reply(raw='<html>login page</html>')
        self.assertEqual(self.call('getAgentList')['code'], 502)

    def test_http_failure_not_hidden_by_json(self):
        self.reply({}, status=403)
        self.assertEqual(self.call('getAgentList')['code'], 403)

    def test_multi_upload_retains_both_original_names(self):
        with tempfile.TemporaryDirectory() as directory:
            files = []
            for i, name in enumerate(['report.md', 'data.csv']):
                p = Path(directory) / f'php{i}.tmp'
                p.write_text(f'file content {i}')
                files.append({'tmp_path': str(p), 'name': name})
                self.reply([{'id': str(i)}])
            result = self.call('uploadDocuments', 'kb', files)
            self.assertEqual(result['data'], [{'id': '0'}, {'id': '1'}])
            for request, name in zip(self.server.requests, ['report.md', 'data.csv']):
                self.assertEqual(request[:2], ('POST', '/api/v1/datasets/kb/documents?type=local'))
                self.assertIn(f'name="file"; filename="{name}"'.encode(), request[3])
                self.assertNotIn(b'name="file[', request[3])

    def test_upload_partial_failure_retains_success(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'file.tmp'
            p.write_text('hello')
            files = [{'tmp_path': str(p), 'name': 'one.md'}, {'tmp_path': str(p), 'name': 'two.md'}]
            self.reply([{'id': 'one'}])
            self.reply(status=400, raw='{"code":400,"message":"rejected"}')
            result = self.call('uploadFiles', files, 'folder')
            self.assertNotEqual(result['code'], 0)
            self.assertEqual(result['data'], [{'id': 'one'}])
            self.assertEqual(result['errors'][0]['name'], 'two.md')
            self.assertIn(b'name="parent_id"', self.server.requests[0][3])

    def test_search_delta_and_references(self):
        events = [{'code': 0, 'data': {'answer': 'hello '}}, {'code': 0, 'data': {'answer': 'world'}},
                  {'code': 0, 'data': {'answer': '', 'reference': {'chunks': {'a': {'id': 'a'}}}, 'final': True}},
                  {'code': 0, 'data': True}]
        self.reply(raw=''.join('data:' + json.dumps(e) + '\n\n' for e in events))
        result = self.call('searchWithApp', 'search', 'question')
        self.assertEqual(result['data']['answer'], 'hello world')
        self.assertEqual(result['data']['reference']['chunks'], [{'id': 'a'}])

    def test_search_error_propagated(self):
        self.reply(raw='data:{"code":500,"message":"model failed","data":{"answer":"error"}}\n\n')
        self.assertEqual(self.call('searchWithApp', 'search', 'question')['code'], 500)

    def test_search_interruption_is_error(self):
        self.reply(raw='data:{"code":0,"data":{"answer":"partial"}}\n\n')
        self.assertEqual(self.call('searchWithApp', 'search', 'question')['code'], 502)

    def test_anonymous_request_denied_before_database(self):
        code = '$_GET["action"]="dataset_list"; require $argv[1];'
        result = subprocess.run(['php', '-r', code, str(PORTAL / 'api.php')], capture_output=True, text=True,
                                encoding='utf-8', timeout=10)
        self.assertEqual(json.loads(result.stdout)['code'], 401)

    def test_session_ownership(self):
        for session, expected in [('mine', 0), ('someone-else', 403)]:
            code = ('require $argv[1]; class Manager { function getUserSessionIds($user,$chat) { return ["mine"]; } } '
                    'requirePortalSession(new Manager(), ["id"=>1], "chat", $argv[2]); echo "{\\"code\\":0}";')
            result = subprocess.run(['php', '-r', code, str(PORTAL / 'access.php'), session],
                                    capture_output=True, text=True, encoding='utf-8', timeout=10)
            self.assertEqual(json.loads(result.stdout)['code'], expected)


if __name__ == '__main__':
    unittest.main(verbosity=2)
