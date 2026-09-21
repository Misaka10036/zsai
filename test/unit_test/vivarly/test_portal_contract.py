"""Run with Python directly; exercises PHP cURL against a local mock, without RAGFlow/MySQL."""
import ast
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[3]
PORTAL = ROOT / '智盛fontend'


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
        cls.routes = []
        for source in (ROOT / 'api/apps/restful_apis').glob('*.py'):
            tree = ast.parse(source.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute) or node.func.attr != 'route':
                    continue
                if not node.args or not isinstance(node.args[0], ast.Constant):
                    continue
                route = '/api/v1' + node.args[0].value
                pattern = re.sub(r'<[^>]+>', '[^/]+', route)
                methods = next((ast.literal_eval(k.value) for k in node.keywords if k.arg == 'methods'), ['GET'])
                cls.routes.append((re.compile('^' + pattern + '$'), methods))
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

    def tearDown(self):
        for method, path, _, _ in self.server.requests:
            self.assertTrue(any(pattern.fullmatch(urlsplit(path).path) and method in methods
                                for pattern, methods in self.routes),
                            f'No Python backend route: {method} {path}')

    def test_portal_json_endpoints(self):
        calls = [
            ('getDatasetList', []), ('createDataset', ['name']), ('updateDataset', ['kb', 'name']),
            ('getFileList', ['kb']), ('deleteDocuments', ['kb', ['doc']]),
            ('parseDocuments', ['kb', ['doc']]), ('stopParsingDocuments', ['kb', ['doc']]),
            ('ingestDocuments', [['doc']]), ('listFiles', []), ('createFolder', ['folder']),
            ('deleteFiles', [['file']]), ('moveFiles', [['file'], 'folder']),
            ('getParentFolder', ['file']), ('getAncestors', ['file']),
            ('linkFilesToDatasets', [['file'], ['kb']]), ('getSearchApps', []),
            ('getSearchAppDetail', ['search']), ('createSearchApp', ['name', '', ['kb']]),
            ('updateSearchApp', ['search', {'name': 'name', 'search_config': {'kb_ids': ['kb']}}]),
            ('deleteSearchApp', ['search']), ('getModels', []), ('getRerankModels', []),
            ('getEmbeddingModels', []), ('getChatApps', []), ('getChatAppDetail', ['chat']),
            ('getChatSessions', ['chat']), ('getChatSessionMessages', ['chat', 'session']),
            ('getAgentList', []), ('getAgentDetail', ['agent']), ('updateAgent', ['agent', {'title': 'name'}]),
            ('deleteAgent', ['agent']), ('converseAgent', ['agent', 'hello']),
            ('getAgentSessions', ['agent']), ('deleteAgentSessions', ['agent', ['session']]),
        ]
        for method, args in calls:
            with self.subTest(method=method):
                self.reply({})
                self.assertEqual(self.call(method, *args)['code'], 0)

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

    def test_graph_submission_result_and_failures(self):
        for status, response in [
            (200, {'code': 0, 'data': {'task_id': 'task1'}}),
            (200, {'code': 102, 'message': 'No documents in Dataset kb'}),
            (200, {'code': 109, 'message': 'no authorization'}),
            (503, {'code': 503, 'message': 'Backend unavailable'}),
        ]:
            with self.subTest(status=status, response=response):
                self.reply(status=status, raw=json.dumps(response))
                self.assertEqual(self.call('runGraphRAG', 'kb'), response)

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

    def test_disabled_deleted_and_changed_role_are_refreshed(self):
        for user in [None, {'id': 1, 'status': 0, 'role': 'admin'},
                     {'id': 1, 'status': 1, 'role': 'user', 'password': 'private'}]:
            with self.subTest(user=user):
                code = ('require $argv[1]; '
                        '$_SESSION=["user"=>["id"=>1,"role"=>"admin"]]; '
                        'class Manager { function findById($id) { return json_decode($GLOBALS["argv"][2],true); } } '
                        '$user=refreshPortalUser(new Manager()); '
                        'echo json_encode(["user"=>$user,"session"=>$_SESSION["user"]??null]);')
                result = subprocess.run(['php', '-r', code, str(PORTAL / 'access.php'), json.dumps(user)],
                                        capture_output=True, text=True, encoding='utf-8', timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                data = json.loads(result.stdout)
                expected = {'id': 1, 'status': 1, 'role': 'user'} if user and user['status'] == 1 else None
                self.assertEqual(data, {'user': expected, 'session': expected})

    def test_search_creation_binds_datasets(self):
        self.reply({'search_id': 'search'})
        self.call('createSearchApp', 'name', 'description', ['kb'])
        self.assertEqual(json.loads(self.server.requests[0][3])['search_config'], {'kb_ids': ['kb']})
        self.assertEqual(self.call('createSearchApp', 'name')['code'], 400)
        self.assertEqual(len(self.server.requests), 1)

    def test_mindmap_uses_authenticated_chat_endpoint(self):
        self.reply({'search_config': {'kb_ids': ['kb']}})
        self.reply({'name': 'map', 'children': []})
        result = self.call('searchMindmap', 'search', 'question')
        self.assertEqual(result['data']['name'], 'map')
        self.assertEqual(self.server.requests[1][:2], ('POST', '/api/v1/chat/mindmap'))
        self.assertEqual(json.loads(self.server.requests[1][3]), {'search_id': 'search', 'question': 'question', 'kb_ids': ['kb']})

    def test_search_preserves_mindmap_events(self):
        self.reply(raw='data:{"code":0,"data":{"mindmap":{"name":"map"}}}\n\ndata:{"code":0,"data":true}\n\n')
        self.assertEqual(self.call('searchWithApp', 'search', 'question')['data']['mindmap'], {'name': 'map'})

    def test_agent_session_creation_and_cancel(self):
        self.reply({'id': 'session'})
        self.call('createAgentSession', 'agent')
        self.reply({'id': 'session', 'dialog_id': 'agent'})
        self.reply(True)
        self.assertEqual(self.call('cancelAgentSession', 'agent', 'session')['code'], 0)
        self.assertEqual([request[:2] for request in self.server.requests], [
            ('POST', '/api/v1/agents/agent/sessions'),
            ('GET', '/api/v1/agents/agent/sessions/session'),
            ('POST', '/api/v1/tasks/session/cancel'),
        ])

    def test_agent_cancel_does_not_cancel_unrelated_sessions(self):
        self.reply(status=403, raw='{"code":403,"message":"Session not found"}')
        self.assertEqual(self.call('cancelAgentSession', 'agent', 'other')['code'], 403)
        self.assertEqual(len(self.server.requests), 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
