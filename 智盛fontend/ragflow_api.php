<?php
require_once __DIR__ . '/config.php';

class RAGFlowAPI {
    private $baseUrl;
    private $apiKey;

    public function __construct() {
        $this->baseUrl = rtrim(RAGFLOW_BASE_URL, '/');
        $this->apiKey = RAGFLOW_API_KEY;
    }

    private function request($endpoint, $method = 'GET', $data = null, $isMultipart = false) {
        $url = $this->baseUrl . $endpoint;
        $ch = curl_init();

        $headers = [
            'Authorization: Bearer ' . $this->apiKey
        ];

        $method = strtoupper($method);
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        if ($isMultipart) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        } else {
            $headers[] = 'Content-Type: application/json';
            if ($data !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data === [] ? new stdClass() : $data, JSON_THROW_ON_ERROR));
            } elseif (in_array($method, ['POST', 'DELETE', 'PUT', 'PATCH'])) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, '{}');
            }
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['code' => 500, 'message' => 'cURL Error: ' . $error];
        }

        // 尝试解析JSON
        $resData = json_decode($response, true);
        if (is_array($resData)) {
            if ($httpCode >= 400) return ['code' => $httpCode, 'message' => $resData['message'] ?? 'Backend request failed'];
            return isset($resData['code']) ? $resData : ['code' => 0, 'data' => $resData];
        }
        
        // 如果不是JSON，返回原始响应
        return ['code' => $httpCode >= 400 ? $httpCode : 502, 'message' => 'Backend returned a non-JSON response'];
    }

    // ==================== 知识库 API ====================

    public function getDatasetList($page = 1, $pageSize = 50, $keywords = '') {
        $params = ['page' => $page, 'page_size' => $pageSize];
        if (!empty($keywords)) $params['keywords'] = $keywords;
        return $this->request('/api/v1/datasets?' . http_build_query($params), 'GET');
    }

    public function getDatasetGraph($datasetId) {
        return $this->request("/api/v1/datasets/{$datasetId}/graph", 'GET');
    }

    public function runGraphRAG($datasetId) {
        return $this->request("/api/v1/datasets/{$datasetId}/index?type=graph", 'POST');
    }

    public function createDataset($name, $description = '', $permission = 'me') {
        return $this->request('/api/v1/datasets', 'POST', [
            'name' => $name,
            'description' => $description,
            'permission' => $permission
        ]);
    }

    public function updateDataset($datasetId, $name, $description = '') {
        return $this->request("/api/v1/datasets/{$datasetId}", 'PUT', [
            'name' => $name,
            'description' => $description
        ]);
    }

    public function deleteDataset($datasetId) {
        return $this->request('/api/v1/datasets', 'DELETE', ['ids' => [$datasetId]]);
    }

    // ==================== 知识库内文件管理 API ====================

    public function getFileList($datasetId, $page = 1, $pageSize = 50, $keywords = '', $run = null, $suffix = null) {
        $params = ['page' => $page, 'page_size' => $pageSize];
        if (!empty($keywords)) $params['keywords'] = $keywords;
        if ($run !== null && $run !== '') $params['run'] = $run;
        if ($suffix !== null && $suffix !== '') $params['suffix'] = $suffix;
        return $this->request("/api/v1/datasets/{$datasetId}/documents?" . http_build_query($params), 'GET');
    }

    // PHP's cURL array keys cannot represent repeated "file" fields. Send one
    // file per request and expose partial failures instead of dropping files.
    private function uploadBatch($endpoint, $files, $fields = []) {
        $uploaded = [];
        $errors = [];
        foreach ($files as $file) {
            $path = $file['tmp_path'];
            $name = basename(str_replace('\\', '/', $file['name']));
            if (!is_file($path) || $name === '') {
                $errors[] = ['name' => $name, 'message' => 'Invalid upload'];
                continue;
            }
            $payload = $fields;
            $payload['file'] = new CURLFile($path, mime_content_type($path) ?: 'application/octet-stream', $name);
            $result = $this->request($endpoint, 'POST', $payload, true);
            if (($result['code'] ?? 500) !== 0) {
                $errors[] = ['name' => $name, 'message' => $result['message'] ?? 'Upload failed'];
                continue;
            }
            $items = $result['data'] ?? [];
            if (isset($items['id'])) $items = [$items];
            $uploaded = array_merge($uploaded, $items);
        }
        if (!$files) return ['code' => 400, 'message' => 'No files supplied'];
        return ['code' => $errors ? 502 : 0, 'data' => $uploaded, 'errors' => $errors,
            'message' => $errors ? 'Some files failed to upload; successfully uploaded files are in data.' : ''];
    }

    public function uploadDocuments($datasetId, $files, $type = 'local') {
        $endpoint = "/api/v1/datasets/{$datasetId}/documents?type=" . rawurlencode($type);
        if ($type === 'local') return $this->uploadBatch($endpoint, $files);
        return $this->request($endpoint, 'POST', $files, $type === 'web');
    }

    public function updateDocument($datasetId, $documentId, $data) {
        return $this->request("/api/v1/datasets/{$datasetId}/documents/{$documentId}", 'PATCH', $data);
    }

    public function deleteDocuments($datasetId, $documentIds = [], $deleteAll = false) {
        $payload = [];
        if ($deleteAll) {
            $payload['delete_all'] = true;
        } else if (!empty($documentIds)) {
            $payload['ids'] = $documentIds;
        } else {
            return ['code' => 400, 'message' => '请指定要删除的文档ID或设置delete_all为true'];
        }
        return $this->request("/api/v1/datasets/{$datasetId}/documents", 'DELETE', $payload);
    }

    public function downloadDocumentStream($datasetId, $docId) {
        $url = $this->baseUrl . "/api/v1/datasets/{$datasetId}/documents/{$docId}";
        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->apiKey
        ]);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);

        $data = curl_exec($ch);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [
            'code' => $httpCode,
            'content_type' => $contentType,
            'body' => $data
        ];
    }

    public function parseDocuments($datasetId, $documentIds) {
        return $this->request("/api/v1/datasets/{$datasetId}/chunks", 'POST', [
            'document_ids' => $documentIds
        ]);
    }

    public function stopParsingDocuments($datasetId, $documentIds) {
        return $this->request("/api/v1/datasets/{$datasetId}/chunks", 'DELETE', [
            'document_ids' => $documentIds
        ]);
    }

    public function ingestDocuments($docIds, $run = '1', $delete = false) {
        return $this->request("/api/v1/documents/ingest", 'POST', [
            'doc_ids' => $docIds,
            'run' => $run,
            'delete' => $delete
        ]);
    }

    // ==================== 全局文件管理 API ====================

    public function listFiles($parentId = null, $keywords = '', $page = 1, $pageSize = 100) {
        $params = ['page' => $page, 'page_size' => $pageSize];
        if ($parentId !== null && $parentId !== '') {
            $params['parent_id'] = $parentId;
        }
        if (!empty($keywords)) {
            $params['keywords'] = $keywords;
        }
        return $this->request('/api/v1/files?' . http_build_query($params), 'GET');
    }

    public function createFolder($name, $parentId = null) {
        $payload = [
            'name' => $name,
            'type' => 'folder'
        ];
        if ($parentId !== null && $parentId !== '') {
            $payload['parent_id'] = $parentId;
        }
        return $this->request('/api/v1/files', 'POST', $payload);
    }

    public function uploadFiles($files, $parentId = null) {
        return $this->uploadBatch('/api/v1/files', $files, $parentId ? ['parent_id' => $parentId] : []);
    }

    public function deleteFiles($fileIds) {
        if (empty($fileIds)) {
            return ['code' => 400, 'message' => '请指定要删除的文件ID'];
        }
        if (!is_array($fileIds)) {
            $fileIds = [$fileIds];
        }
        return $this->request('/api/v1/files', 'DELETE', ['ids' => $fileIds]);
    }

    public function moveFiles($srcFileIds, $destFileId = null, $newName = null) {
        if (empty($srcFileIds)) {
            return ['code' => 400, 'message' => '请指定要移动的文件ID'];
        }
        if (!is_array($srcFileIds)) {
            $srcFileIds = [$srcFileIds];
        }
        $payload = ['src_file_ids' => $srcFileIds];
        if ($destFileId !== null && $destFileId !== '') {
            $payload['dest_file_id'] = $destFileId;
        }
        if ($newName !== null && $newName !== '') {
            $payload['new_name'] = $newName;
        }
        return $this->request('/api/v1/files/move', 'POST', $payload);
    }

    public function downloadFile($fileId) {
        $url = $this->baseUrl . "/api/v1/files/{$fileId}";
        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->apiKey
        ]);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);

        $data = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['code' => 500, 'message' => 'cURL Error: ' . $error];
        }

        return [
            'code' => $httpCode,
            'content_type' => $contentType,
            'body' => $data
        ];
    }

    public function getParentFolder($fileId) {
        return $this->request("/api/v1/files/{$fileId}/parent", 'GET');
    }

    public function getAncestors($fileId) {
        return $this->request("/api/v1/files/{$fileId}/ancestors", 'GET');
    }

    public function linkFilesToDatasets($fileIds, $datasetIds) {
        if (empty($fileIds) || empty($datasetIds)) {
            return ['code' => 400, 'message' => '请指定文件和知识库'];
        }
        if (!is_array($fileIds)) {
            $fileIds = [$fileIds];
        }
        if (!is_array($datasetIds)) {
            $datasetIds = [$datasetIds];
        }
        return $this->request('/api/v1/files/link-to-datasets', 'POST', [
            'file_ids' => $fileIds,
            'kb_ids' => $datasetIds
        ]);
    }

    // ==================== 搜索应用管理 API ====================

    public function getSearchApps($page = 1, $pageSize = 50) {
        $params = ['page' => $page, 'page_size' => $pageSize];
        return $this->request('/api/v1/searches?' . http_build_query($params), 'GET');
    }

    public function getSearchAppDetail($searchId) {
        return $this->request("/api/v1/searches/{$searchId}", 'GET');
    }

    public function createSearchApp($name, $description = '') {
        $payload = ['name' => $name];
        if (!empty($description)) {
            $payload['description'] = $description;
        }
        return $this->request('/api/v1/searches', 'POST', $payload);
    }

    public function updateSearchApp($searchId, $data) {
        return $this->request("/api/v1/searches/{$searchId}", 'PUT', $data);
    }

    public function deleteSearchApp($searchId) {
        return $this->request("/api/v1/searches/{$searchId}", 'DELETE');
    }

    /**
     * 执行搜索
     */
    public function searchWithApp($searchId, $question) {
        $ch = curl_init($this->baseUrl . "/api/v1/searches/{$searchId}/completions");
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(['question' => $question], JSON_THROW_ON_ERROR),
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $this->apiKey, 'Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 300,
        ]);
        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($error) return ['code' => 502, 'message' => 'Backend connection failed: ' . $error];
        $json = json_decode($raw, true);
        if ($status >= 400) return ['code' => $status, 'message' => $json['message'] ?? 'Search request failed'];
        if (is_array($json)) return isset($json['code']) ? $json : ['code' => 502, 'message' => 'Invalid search response'];

        $answer = '';
        $reference = [];
        $done = false;
        foreach (preg_split('/\r?\n/', $raw) as $line) {
            if (!str_starts_with($line, 'data:')) continue;
            $payload = trim(substr($line, 5));
            if ($payload === '[DONE]') { $done = true; break; }
            $event = json_decode($payload, true);
            if (!is_array($event)) return ['code' => 502, 'message' => 'Malformed search event'];
            if (($event['code'] ?? 0) !== 0) return $event;
            $data = $event['data'] ?? null;
            if ($data === true) { $done = true; break; }
            if (!is_array($data)) continue;
            $answer .= $data['answer'] ?? '';
            if (!empty($data['reference'])) $reference = $data['reference'];
        }
        if (!$done) return ['code' => 502, 'message' => 'Search response was interrupted'];
        foreach (['chunks', 'doc_aggs'] as $field) {
            $reference[$field] = array_values($reference[$field] ?? []);
        }
        return ['code' => 0, 'data' => ['answer' => $answer, 'reference' => $reference]];
    }

    // ==================== 模型管理 API ====================

    public function getModels($type = 'chat') {
        $params = ['type' => $type];
        return $this->request('/api/v1/models?' . http_build_query($params), 'GET');
    }

    public function getRerankModels() {
        return $this->request('/api/v1/models?type=rerank', 'GET');
    }

    public function getEmbeddingModels() {
        return $this->request('/api/v1/models?type=embedding', 'GET');
    }

    // ==================== 聊天助手 API ====================

    public function getChatApps($page = 1, $pageSize = 50, $keywords = '') {
        $params = ['page' => $page, 'page_size' => $pageSize];
        if (!empty($keywords)) $params['keywords'] = $keywords;
        return $this->request('/api/v1/chats?' . http_build_query($params), 'GET');
    }

    public function getChatAppDetail($chatId) {
        return $this->request("/api/v1/chats/{$chatId}", 'GET');
    }

    public function createChatSession($chatId, $name = '') {
        $payload = [];
        if (!empty($name)) {
            $payload['name'] = $name;
        }
        return $this->request("/api/v1/chats/{$chatId}/sessions", 'POST', $payload);
    }

    public function getChatSessions($chatId, $page = 1, $pageSize = 50) {
        $params = ['page' => $page, 'page_size' => $pageSize];
        return $this->request("/api/v1/chats/{$chatId}/sessions?" . http_build_query($params), 'GET');
    }

    public function getChatSessionMessages($chatId, $sessionId) {
        return $this->request("/api/v1/chats/{$chatId}/sessions/{$sessionId}", 'GET');
    }

    public function deleteChatSession($chatId, $sessionId) {
        return $this->request("/api/v1/chats/{$chatId}/sessions", 'DELETE', ['ids' => [$sessionId]]);
    }

    public function sendChatMessage($chatId, $sessionId, $question, $stream = false) {
        $payload = [
            'chat_id' => $chatId,
            'messages' => [['role' => 'user', 'content' => $question]],
            'session_id' => $sessionId,
            'stream' => false
        ];
        return $this->request('/api/v1/chat/completions', 'POST', $payload);
    }

    public function getAgentList($page = 1, $pageSize = 50) {
        $result = $this->request('/api/v1/agents?' . http_build_query(['page' => $page, 'page_size' => $pageSize]));
        if (($result['code'] ?? 500) === 0) $result['data'] = $result['data']['canvas'] ?? $result['data'];
        return $result;
    }

    public function getAgentDetail($agentId) {
        return $this->request('/api/v1/agents/' . $agentId);
    }

    public function createAgent($title, $description = '') {
        $dsl = json_decode(file_get_contents(__DIR__ . '/templates/agent-starter.json'), true, 512, JSON_THROW_ON_ERROR);
        return $this->request('/api/v1/agents', 'POST', ['title' => $title, 'description' => $description, 'dsl' => $dsl]);
    }

    public function updateAgent($agentId, $data) {
        return $this->request('/api/v1/agents/' . $agentId, 'PUT', $data);
    }

    public function deleteAgent($agentId) {
        return $this->request('/api/v1/agents/' . $agentId, 'DELETE');
    }

    public function converseAgent($agentId, $query, $stream = false, $sessionId = null) {
        $payload = ['agent_id' => $agentId, 'query' => $query, 'stream' => false];
        if ($sessionId) $payload['session_id'] = $sessionId;
        return $this->request('/api/v1/agents/chat/completions', 'POST', $payload);
    }

    public function converseAgentOpenAI($agentId, $query, $stream = false, $sessionId = null) {
        $payload = ['agent_id' => $agentId, 'openai-compatible' => true,
            'messages' => [['role' => 'user', 'content' => $query]], 'stream' => false];
        if ($sessionId) $payload['session_id'] = $sessionId;
        return $this->request('/api/v1/agents/chat/completions', 'POST', $payload);
    }

    public function getAgentSessions($agentId, $page = 1, $pageSize = 20) {
        return $this->request('/api/v1/agents/' . $agentId . '/sessions?' . http_build_query(['page' => $page, 'page_size' => $pageSize]));
    }

    public function deleteAgentSessions($agentId, $sessionIds = [], $deleteAll = false) {
        if (!$sessionIds && !$deleteAll) return ['code' => 400, 'message' => 'Session IDs required'];
        return $this->request('/api/v1/agents/' . $agentId . '/sessions', 'DELETE',
            $deleteAll ? ['delete_all' => true] : ['ids' => $sessionIds]);
    }
}
