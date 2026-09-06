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
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            } elseif (in_array($method, ['POST', 'DELETE', 'PUT', 'PATCH'])) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, '{}');
            }
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

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
            return $resData;
        }
        
        // 如果不是JSON，返回原始响应
        return ['code' => $httpCode, 'message' => 'Raw response', 'raw' => $response];
    }

    // ==================== 知识库 API ====================

    public function getDatasetList($page = 1, $pageSize = 50, $keywords = '') {
        $params = ['page' => $page, 'page_size' => $pageSize];
        if (!empty($keywords)) $params['keywords'] = $keywords;
        return $this->request('/api/v1/datasets?' . http_build_query($params), 'GET');
    }

    public function getDatasetGraph($datasetId) {
        return $this->request("/api/v1/datasets/{$datasetId}/knowledge_graph", 'GET');
    }

    public function runGraphRAG($datasetId) {
        return $this->request("/api/v1/datasets/{$datasetId}/run_graphrag", 'POST');
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
        return $this->request("/api/v1/datasets/{$datasetId}", 'DELETE');
    }

    // ==================== 知识库内文件管理 API ====================

    public function getFileList($datasetId, $page = 1, $pageSize = 50, $keywords = '', $run = null, $suffix = null) {
        $params = ['page' => $page, 'page_size' => $pageSize];
        if (!empty($keywords)) $params['keywords'] = $keywords;
        if ($run !== null && $run !== '') $params['run'] = $run;
        if ($suffix !== null && $suffix !== '') $params['suffix'] = $suffix;
        return $this->request("/api/v1/datasets/{$datasetId}/documents?" . http_build_query($params), 'GET');
    }

    public function uploadDocuments($datasetId, $filePaths, $type = 'local') {
        $url = $this->baseUrl . "/api/v1/datasets/{$datasetId}/documents";
        if ($type === 'local') {
            $url .= '?type=local';
        } elseif ($type === 'web') {
            $url .= '?type=web';
        } elseif ($type === 'empty') {
            $url .= '?type=empty';
        }

        $ch = curl_init();
        $headers = [
            'Authorization: Bearer ' . $this->apiKey
        ];

        $postFields = [];

        if ($type === 'local') {
            $headers[] = 'Content-Type: multipart/form-data';
            if (!is_array($filePaths)) {
                $filePaths = [$filePaths];
            }
            foreach ($filePaths as $index => $filePath) {
                if (file_exists($filePath)) {
                    $fieldName = 'file';
                    if ($index > 0) {
                        $fieldName = 'file[' . $index . ']';
                    }
                    $postFields[$fieldName] = new CURLFile($filePath);
                }
            }
        } elseif ($type === 'web') {
            $headers[] = 'Content-Type: multipart/form-data';
            $postFields['name'] = $filePaths['name'] ?? 'webpage';
            $postFields['url'] = $filePaths['url'] ?? '';
        } elseif ($type === 'empty') {
            $headers[] = 'Content-Type: application/json';
            $postFields = json_encode(['name' => $filePaths['name'] ?? 'empty.txt']);
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        
        if ($type === 'empty') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        } else {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        }
        
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['code' => 500, 'message' => 'cURL Error: ' . $error];
        }

        $resData = json_decode($response, true);
        return $resData ?: ['code' => $httpCode, 'message' => 'Raw response: ' . $response, 'raw' => $response];
    }

    public function updateDocument($datasetId, $documentId, $data) {
        return $this->request("/api/v1/datasets/{$datasetId}/documents/{$documentId}", 'PUT', $data);
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

    public function uploadFiles($filePaths, $parentId = null) {
        $url = $this->baseUrl . '/api/v1/files';
        $ch = curl_init();

        $headers = [
            'Authorization: Bearer ' . $this->apiKey
        ];
        $headers[] = 'Content-Type: multipart/form-data';

        $postFields = [];
        if (!is_array($filePaths)) {
            $filePaths = [$filePaths];
        }
        foreach ($filePaths as $index => $filePath) {
            if (file_exists($filePath)) {
                $fieldName = 'file';
                if ($index > 0) {
                    $fieldName = 'file[' . $index . ']';
                }
                $postFields[$fieldName] = new CURLFile($filePath);
            }
        }
        if ($parentId !== null && $parentId !== '') {
            $postFields['parent_id'] = $parentId;
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['code' => 500, 'message' => 'cURL Error: ' . $error];
        }

        $resData = json_decode($response, true);
        return $resData ?: ['code' => $httpCode, 'message' => 'Raw response: ' . $response, 'raw' => $response];
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
        $url = $this->baseUrl . "/api/v1/searches/{$searchId}/completions";
        $ch = curl_init();

        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json',
            'Accept: application/json'
        ];

        $payload = ['question' => $question];

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);

        $rawResponse = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['code' => 500, 'message' => 'cURL Error: ' . $curlError];
        }

        $directJson = json_decode($rawResponse, true);
        if (is_array($directJson)) {
            if (isset($directJson['code']) || isset($directJson['data'])) {
                return $directJson;
            }
            if (isset($directJson['answer']) || isset($directJson['choices'])) {
                return ['code' => 0, 'data' => $directJson];
            }
            return ['code' => 0, 'data' => $directJson];
        }

        // 尝试解析SSE格式
        if (strpos($rawResponse, 'data:') !== false) {
            $lines = explode("\n", $rawResponse);
            $answer = '';
            $reference = null;
            $chunks = [];
            $docAggs = [];

            foreach ($lines as $line) {
                $line = trim($line);
                if (strpos($line, 'data:') === 0) {
                    $jsonStr = trim(substr($line, 5));
                    if ($jsonStr === '[DONE]') {
                        break;
                    }
                    $jsonData = json_decode($jsonStr, true);
                    if (is_array($jsonData)) {
                        if (isset($jsonData['data']) && is_array($jsonData['data'])) {
                            $innerData = $jsonData['data'];
                            if (isset($innerData['answer'])) {
                                $answer .= $innerData['answer'];
                            }
                            if (isset($innerData['reference'])) {
                                $reference = $innerData['reference'];
                            }
                        } elseif (isset($jsonData['answer'])) {
                            $answer .= $jsonData['answer'];
                        }
                        if (isset($jsonData['choices']) && is_array($jsonData['choices'])) {
                            foreach ($jsonData['choices'] as $choice) {
                                if (isset($choice['delta']['content'])) {
                                    $answer .= $choice['delta']['content'];
                                }
                                if (isset($choice['delta']['reference'])) {
                                    $reference = $choice['delta']['reference'];
                                }
                            }
                        }
                    }
                }
            }

            if ($reference && isset($reference['chunks'])) {
                $chunks = $reference['chunks'];
                if (is_array($chunks) && !isset($chunks[0])) {
                    $chunks = array_values($chunks);
                }
            }
            if ($reference && isset($reference['doc_aggs'])) {
                $docAggs = $reference['doc_aggs'];
                if (is_array($docAggs) && !isset($docAggs[0])) {
                    $docAggs = array_values($docAggs);
                }
            }

            return [
                'code' => 0,
                'data' => [
                    'answer' => $answer ?: '未找到匹配结果。',
                    'reference' => [
                        'chunks' => $chunks,
                        'doc_aggs' => $docAggs
                    ],
                    'chunks' => $chunks,
                    'doc_aggs' => $docAggs
                ]
            ];
        }

        return [
            'code' => 0,
            'data' => [
                'answer' => $rawResponse,
                'raw' => $rawResponse
            ]
        ];
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
        return $this->request("/api/v1/chats/{$chatId}/sessions/{$sessionId}", 'DELETE');
    }

    public function sendChatMessage($chatId, $sessionId, $question, $stream = false) {
        $payload = [
            'question' => $question,
            'session_id' => $sessionId,
            'stream' => $stream
        ];
        return $this->request("/api/v1/chats/{$chatId}/completions", 'POST', $payload);
    }

// ==================== Agent 管理 API ====================

/**
 * 获取 Agent 列表
 * GET /api/v1/agents
 */
public function getAgentList($page = 1, $pageSize = 50) {
    $params = ['page' => $page, 'page_size' => $pageSize];
    $result = $this->request('/api/v1/agents?' . http_build_query($params), 'GET');
    
    // 如果返回的是错误或非JSON，返回空列表
    if (!is_array($result) || isset($result['raw'])) {
        return ['code' => 0, 'data' => [], 'message' => 'Agent API 不可用'];
    }
    
    // RAGFlow 0.26.4 返回的数据在 data.canvas 中
    if (isset($result['data']['canvas']) && is_array($result['data']['canvas'])) {
        $result['data'] = $result['data']['canvas'];
    } 
    // 如果 data 直接是数组
    else if (isset($result['data']) && is_array($result['data']) && !isset($result['data']['canvas'])) {
        // 检查是否直接是数组
        if (isset($result['data'][0]) || empty($result['data'])) {
            // 已经是数组格式，保持不变
        }
    }
    // 如果 data 是对象且包含 list 字段
    else if (isset($result['data']['list']) && is_array($result['data']['list'])) {
        $result['data'] = $result['data']['list'];
    }
    // 如果 data 是对象且包含 agents 字段
    else if (isset($result['data']['agents']) && is_array($result['data']['agents'])) {
        $result['data'] = $result['data']['agents'];
    }
    
    return $result;
}

/**
 * 获取单个 Agent 详情
 * GET /api/v1/agents/{agent_id}
 */
public function getAgentDetail($agentId) {
    $result = $this->request('/api/v1/agents/' . $agentId, 'GET');
    if (!is_array($result) || isset($result['raw'])) {
        return ['code' => 0, 'data' => null, 'message' => 'Agent 详情获取失败'];
    }
    return $result;
}

/**
 * 创建 Agent
 * POST /api/v1/agents
 */
public function createAgent($title, $description = '') {
    $payload = [
        'title' => $title
    ];
    if (!empty($description)) {
        $payload['description'] = $description;
    }
    $result = $this->request('/api/v1/agents', 'POST', $payload);
    if (!is_array($result) || isset($result['raw'])) {
        return ['code' => 500, 'message' => '创建 Agent 失败'];
    }
    return $result;
}

/**
 * 更新 Agent
 * PUT /api/v1/agents/{agent_id}
 */
public function updateAgent($agentId, $data) {
    $result = $this->request('/api/v1/agents/' . $agentId, 'PUT', $data);
    if (!is_array($result) || isset($result['raw'])) {
        return ['code' => 500, 'message' => '更新 Agent 失败'];
    }
    return $result;
}

/**
 * 删除 Agent
 * DELETE /api/v1/agents/{agent_id}
 */
public function deleteAgent($agentId) {
    $result = $this->request('/api/v1/agents/' . $agentId, 'DELETE');
    if (!is_array($result) || isset($result['raw'])) {
        return ['code' => 500, 'message' => '删除 Agent 失败'];
    }
    return $result;
}

/**
 * 与 Agent 对话（标准模式）
 * POST /api/v1/agents/chat/completions
 */
public function converseAgent($agentId, $query, $stream = false, $sessionId = null) {
    $payload = [
        'agent_id' => $agentId,
        'query' => $query,
        'stream' => $stream
    ];
    if ($sessionId !== null) {
        $payload['session_id'] = $sessionId;
    }
    $result = $this->request('/api/v1/agents/chat/completions', 'POST', $payload);
    
    if (!is_array($result) || isset($result['raw'])) {
        return [
            'code' => 0, 
            'data' => [
                'session_id' => 'sim_' . time(),
                'data' => [
                    'content' => "Agent 执行完成（模拟模式）\n\n问题: " . $query
                ]
            ],
            'message' => '使用模拟模式'
        ];
    }
    return $result;
}

/**
 * 与 Agent 对话（OpenAI 兼容模式）
 * POST /api/v1/agents_openai/{agent_id}/chat/completions
 */
public function converseAgentOpenAI($agentId, $query, $stream = false, $sessionId = null) {
    $payload = [
        'model' => 'model',
        'messages' => [
            ['role' => 'user', 'content' => $query]
        ],
        'stream' => $stream
    ];
    if ($sessionId !== null) {
        $payload['session_id'] = $sessionId;
    }
    $result = $this->request('/api/v1/agents_openai/' . $agentId . '/chat/completions', 'POST', $payload);
    
    if (!is_array($result) || isset($result['raw'])) {
        return [
            'code' => 0,
            'data' => [
                'session_id' => 'sim_' . time(),
                'choices' => [
                    [
                        'message' => [
                            'content' => "Agent 执行完成（模拟模式）\n\n问题: " . $query
                        ]
                    ]
                ]
            ],
            'message' => '使用模拟模式'
        ];
    }
    return $result;
}

/**
 * 获取 Agent 会话列表
 * GET /api/v1/agents/{agent_id}/sessions
 */
public function getAgentSessions($agentId, $page = 1, $pageSize = 20) {
    $params = ['page' => $page, 'page_size' => $pageSize];
    $result = $this->request('/api/v1/agents/' . $agentId . '/sessions?' . http_build_query($params), 'GET');
    if (!is_array($result) || isset($result['raw'])) {
        return ['code' => 0, 'data' => [], 'message' => '暂无会话记录'];
    }
    return $result;
}

/**
 * 删除 Agent 会话
 * DELETE /api/v1/agents/{agent_id}/sessions
 */
public function deleteAgentSessions($agentId, $sessionIds = [], $deleteAll = false) {
    $payload = [];
    if ($deleteAll) {
        $payload['delete_all'] = true;
    } else if (!empty($sessionIds)) {
        $payload['ids'] = $sessionIds;
    } else {
        return ['code' => 400, 'message' => '请指定要删除的会话ID'];
    }
    $result = $this->request('/api/v1/agents/' . $agentId . '/sessions', 'DELETE', $payload);
    if (!is_array($result) || isset($result['raw'])) {
        return ['code' => 500, 'message' => '删除会话失败'];
    }
    return $result;
}
}