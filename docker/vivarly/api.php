<?php
require_once __DIR__ . '/ragflow_api.php';
require_once __DIR__ . '/db.php';

$action = $_GET['action'] ?? '';
$ragflow = new RAGFlowAPI();
$currentUser = $_SESSION['user'] ?? null;
require_once __DIR__ . '/access.php';
if (!in_array($action, ['login', 'register'], true)) {
    requirePortalLogin($currentUser);
}
$userManager = new UserManager();


// 辅助函数：检查管理员权限
function requireAdmin() {
    global $currentUser;
    if (($currentUser['role'] ?? '') !== 'admin') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['code' => 403, 'message' => '需要管理员权限']);
        exit;
    }
}

try {
    switch ($action) {
        // ==================== 用户认证 API ====================
        case 'register':
            header('Content-Type: application/json; charset=utf-8');
            $input = json_decode(file_get_contents('php://input'), true);
            $email = trim($input['email'] ?? '');
            $password = trim($input['password'] ?? '');
            $username = trim($input['username'] ?? '');
            $realName = trim($input['real_name'] ?? '');

            if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                echo json_encode(['code' => 400, 'message' => '请输入有效的电子邮件地址']);
                exit;
            }
            if (empty($password) || strlen($password) < 6) {
                echo json_encode(['code' => 400, 'message' => '密码不能少于 6 位']);
                exit;
            }

            echo json_encode($userManager->register($email, $password, $username, $realName));
            break;

        case 'login':
            header('Content-Type: application/json; charset=utf-8');
            $input = json_decode(file_get_contents('php://input'), true);
            $account = trim($input['account'] ?? $input['username'] ?? '');
            $password = trim($input['password'] ?? '');

            if (empty($account) || empty($password)) {
                echo json_encode(['code' => 400, 'message' => '账号/邮箱和密码不能为空']);
                exit;
            }

            $user = $userManager->findByAccount($account);
            if (!$user) {
                echo json_encode(['code' => 400, 'message' => '账号/邮箱或密码错误']);
                exit;
            }

            $isPasswordValid = false;
            if (password_verify($password, $user['password'])) {
                $isPasswordValid = true;
            } else if ($password === $user['password']) {
                $isPasswordValid = true;
                $userManager->updateUser($user['id'], ['password' => $password]);
            }

            if (!$isPasswordValid) {
                echo json_encode(['code' => 400, 'message' => '账号/邮箱或密码错误']);
                exit;
            }

            if (intval($user['status']) !== 1) {
                echo json_encode(['code' => 403, 'message' => '账号已被禁用']);
                exit;
            }

            unset($user['password']);
            session_regenerate_id(true);
            $_SESSION['user'] = $user;
            echo json_encode(['code' => 0, 'message' => '登录成功', 'data' => $user]);
            break;

        case 'logout':
            header('Content-Type: application/json; charset=utf-8');
            unset($_SESSION['user']);
            session_destroy();
            echo json_encode(['code' => 0, 'message' => '已退出登录']);
            break;

        // ==================== 用户管理 API ====================
        case 'user_list':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $page = intval($_GET['page'] ?? 1);
            $pageSize = intval($_GET['page_size'] ?? 20);
            $keywords = $_GET['keywords'] ?? '';
            echo json_encode(['code' => 0, 'data' => $userManager->getUserList($page, $pageSize, $keywords)]);
            break;

        case 'user_create':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            echo json_encode($userManager->createUser(
                trim($input['username'] ?? ''),
                trim($input['email'] ?? ''),
                trim($input['password'] ?? ''),
                trim($input['real_name'] ?? ''),
                trim($input['role'] ?? 'user')
            ));
            break;

        case 'user_update':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $id = intval($input['id'] ?? 0);
            if (!$id) {
                echo json_encode(['code' => 400, 'message' => '未指定用户 ID']);
                exit;
            }
            echo json_encode($userManager->updateUser($id, $input));
            break;

        case 'user_delete':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $id = intval($input['id'] ?? 0);
            echo json_encode($userManager->deleteUser($id));
            break;

        // ==================== 知识库 API ====================
        case 'dataset_list':
            header('Content-Type: application/json; charset=utf-8');
            $page = intval($_GET['page'] ?? 1);
            $pageSize = intval($_GET['page_size'] ?? 50);
            $keywords = $_GET['keywords'] ?? '';
            echo json_encode($ragflow->getDatasetList($page, $pageSize, $keywords));
            break;

        case 'dataset_create':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $name = trim($input['name'] ?? '');
            $description = trim($input['description'] ?? '');

            if (empty($name)) {
                echo json_encode(['code' => 400, 'message' => '知识库名称不能为空']);
                exit;
            }
            echo json_encode($ragflow->createDataset($name, $description));
            break;

        case 'dataset_update':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $datasetId = $input['dataset_id'] ?? '';
            $name = trim($input['name'] ?? '');
            $description = trim($input['description'] ?? '');

            if (empty($datasetId) || empty($name)) {
                echo json_encode(['code' => 400, 'message' => '知识库ID和名称不能为空']);
                exit;
            }
            echo json_encode($ragflow->updateDataset($datasetId, $name, $description));
            break;

        case 'dataset_delete':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $datasetId = $input['dataset_id'] ?? '';
            if (empty($datasetId)) {
                echo json_encode(['code' => 400, 'message' => '未指定知识库ID']);
                exit;
            }
            echo json_encode($ragflow->deleteDataset($datasetId));
            break;

        case 'dataset_graph':
            header('Content-Type: application/json; charset=utf-8');
            $datasetId = $_GET['dataset_id'] ?? '';
            if (empty($datasetId)) {
                echo json_encode(['code' => 400, 'message' => '未指定 dataset_id']);
                exit;
            }
            echo json_encode($ragflow->getDatasetGraph($datasetId));
            break;

        case 'dataset_run_graph':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $datasetId = $input['dataset_id'] ?? '';
            if (empty($datasetId)) {
                echo json_encode(['code' => 400, 'message' => '未指定 dataset_id']);
                exit;
            }
            echo json_encode($ragflow->runGraphRAG($datasetId));
            break;

        // ==================== 知识库内文件管理 API ====================
        case 'file_list':
            header('Content-Type: application/json; charset=utf-8');
            $datasetId = $_GET['dataset_id'] ?? '';
            if (empty($datasetId)) {
                echo json_encode(['code' => 400, 'message' => '未指定 dataset_id']);
                exit;
            }
            $page = intval($_GET['page'] ?? 1);
            $pageSize = intval($_GET['page_size'] ?? 50);
            $keywords = $_GET['keywords'] ?? '';
            $run = $_GET['run'] ?? '';
            $suffix = $_GET['suffix'] ?? '';
            echo json_encode($ragflow->getFileList($datasetId, $page, $pageSize, $keywords, $run, $suffix));
            break;

        case 'file_upload':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $datasetId = $_GET['dataset_id'] ?? '';
            if (empty($datasetId)) {
                echo json_encode(['code' => 400, 'message' => '未指定 dataset_id']);
                exit;
            }

            $uploadedFiles = [];
            $filePaths = [];
            
            if (isset($_FILES['files'])) {
                $files = $_FILES['files'];
                if (is_array($files['name'])) {
                    for ($i = 0; $i < count($files['name']); $i++) {
                        if ($files['error'][$i] === UPLOAD_ERR_OK) {
                            $tmpPath = $files['tmp_name'][$i];
                            $uploadedFiles[] = [
                                'name' => $files['name'][$i],
                                'tmp_path' => $tmpPath
                            ];
                            $filePaths[] = $tmpPath;
                        }
                    }
                } else {
                    if ($files['error'] === UPLOAD_ERR_OK) {
                        $uploadedFiles[] = [
                            'name' => $files['name'],
                            'tmp_path' => $files['tmp_name']
                        ];
                        $filePaths[] = $files['tmp_name'];
                    }
                }
            }

            if (empty($filePaths)) {
                echo json_encode(['code' => 400, 'message' => '没有有效的文件被上传']);
                exit;
            }

            $result = $ragflow->uploadDocuments($datasetId, $uploadedFiles, 'local');
            
            foreach ($uploadedFiles as $file) {
                if (file_exists($file['tmp_path'])) {
                    unlink($file['tmp_path']);
                }
            }

            echo json_encode($result);
            break;

        case 'file_update':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $datasetId = $input['dataset_id'] ?? '';
            $documentId = $input['document_id'] ?? '';
            unset($input['dataset_id'], $input['document_id']);

            if (empty($datasetId) || empty($documentId)) {
                echo json_encode(['code' => 400, 'message' => '缺少必要参数']);
                exit;
            }
            echo json_encode($ragflow->updateDocument($datasetId, $documentId, $input));
            break;

        case 'file_delete':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $datasetId = $input['dataset_id'] ?? '';
            $documentIds = $input['document_ids'] ?? [];
            $deleteAll = $input['delete_all'] ?? false;

            if (empty($datasetId)) {
                echo json_encode(['code' => 400, 'message' => '未指定 dataset_id']);
                exit;
            }
            echo json_encode($ragflow->deleteDocuments($datasetId, $documentIds, $deleteAll));
            break;

        case 'file_preview':
            $datasetId = $_GET['dataset_id'] ?? '';
            $docId = $_GET['doc_id'] ?? '';

            if (empty($datasetId) || empty($docId)) {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['code' => 400, 'message' => '缺少必要的参数']);
                exit;
            }

            $res = $ragflow->downloadDocumentStream($datasetId, $docId);
            if ($res['code'] === 200) {
                if (!empty($res['content_type'])) {
                    header('Content-Type: ' . $res['content_type']);
                }
                echo $res['body'];
            } else {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['code' => $res['code'], 'message' => '无法获取文件数据']);
            }
            break;

        case 'file_parse':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $datasetId = $input['dataset_id'] ?? '';
            $documentIds = $input['document_ids'] ?? [];

            if (empty($datasetId) || empty($documentIds)) {
                echo json_encode(['code' => 400, 'message' => '缺少必要参数']);
                exit;
            }
            echo json_encode($ragflow->parseDocuments($datasetId, $documentIds));
            break;

        case 'file_stop_parse':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $datasetId = $input['dataset_id'] ?? '';
            $documentIds = $input['document_ids'] ?? [];

            if (empty($datasetId) || empty($documentIds)) {
                echo json_encode(['code' => 400, 'message' => '缺少必要参数']);
                exit;
            }
            echo json_encode($ragflow->stopParsingDocuments($datasetId, $documentIds));
            break;

        case 'file_ingest':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $docIds = $input['doc_ids'] ?? [];
            $run = $input['run'] ?? '1';
            $delete = $input['delete'] ?? false;

            if (empty($docIds)) {
                echo json_encode(['code' => 400, 'message' => '请指定文档ID']);
                exit;
            }
            echo json_encode($ragflow->ingestDocuments($docIds, $run, $delete));
            break;

        // ==================== 全局文件管理 API ====================
        case 'files_list':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $parentId = $_GET['parent_id'] ?? null;
            $keywords = $_GET['keywords'] ?? '';
            $page = intval($_GET['page'] ?? 1);
            $pageSize = intval($_GET['page_size'] ?? 100);
            echo json_encode($ragflow->listFiles($parentId, $keywords, $page, $pageSize));
            break;

        case 'files_create_folder':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $name = trim($input['name'] ?? '');
            $parentId = $input['parent_id'] ?? null;

            if (empty($name)) {
                echo json_encode(['code' => 400, 'message' => '文件夹名称不能为空']);
                exit;
            }
            echo json_encode($ragflow->createFolder($name, $parentId));
            break;

        case 'files_upload':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            
            $parentId = $_POST['parent_id'] ?? null;
            $uploadedFiles = [];
            $filePaths = [];

            if (isset($_FILES['files'])) {
                $files = $_FILES['files'];
                if (is_array($files['name'])) {
                    for ($i = 0; $i < count($files['name']); $i++) {
                        if ($files['error'][$i] === UPLOAD_ERR_OK) {
                            $tmpPath = $files['tmp_name'][$i];
                            $uploadedFiles[] = [
                                'name' => $files['name'][$i],
                                'tmp_path' => $tmpPath
                            ];
                            $filePaths[] = $tmpPath;
                        }
                    }
                } else {
                    if ($files['error'] === UPLOAD_ERR_OK) {
                        $uploadedFiles[] = [
                            'name' => $files['name'],
                            'tmp_path' => $files['tmp_name']
                        ];
                        $filePaths[] = $files['tmp_name'];
                    }
                }
            }

            if (empty($filePaths)) {
                echo json_encode(['code' => 400, 'message' => '没有有效的文件被上传']);
                exit;
            }

            $result = $ragflow->uploadFiles($uploadedFiles, $parentId);
            
            foreach ($uploadedFiles as $file) {
                if (file_exists($file['tmp_path'])) {
                    unlink($file['tmp_path']);
                }
            }

            echo json_encode($result);
            break;

        case 'files_delete':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $fileIds = $input['file_ids'] ?? [];
            if (empty($fileIds)) {
                echo json_encode(['code' => 400, 'message' => '请指定要删除的文件ID']);
                exit;
            }
            echo json_encode($ragflow->deleteFiles($fileIds));
            break;

        case 'files_move':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $srcFileIds = $input['src_file_ids'] ?? [];
            $destFileId = $input['dest_file_id'] ?? null;
            $newName = $input['new_name'] ?? null;

            if (empty($srcFileIds)) {
                echo json_encode(['code' => 400, 'message' => '请指定要移动的文件ID']);
                exit;
            }
            echo json_encode($ragflow->moveFiles($srcFileIds, $destFileId, $newName));
            break;

        case 'files_download':
            requireAdmin();
            $fileId = $_GET['file_id'] ?? '';
            if (empty($fileId)) {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['code' => 400, 'message' => '请指定文件ID']);
                exit;
            }

            $res = $ragflow->downloadFile($fileId);
            if ($res['code'] === 200) {
                if (!empty($res['content_type'])) {
                    header('Content-Type: ' . $res['content_type']);
                }
                header('Content-Disposition: attachment; filename="' . $fileId . '"');
                echo $res['body'];
            } else {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['code' => $res['code'], 'message' => '无法下载文件']);
            }
            break;

        case 'files_parent':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $fileId = $_GET['file_id'] ?? '';
            if (empty($fileId)) {
                echo json_encode(['code' => 400, 'message' => '请指定文件ID']);
                exit;
            }
            echo json_encode($ragflow->getParentFolder($fileId));
            break;

        case 'files_ancestors':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $fileId = $_GET['file_id'] ?? '';
            if (empty($fileId)) {
                echo json_encode(['code' => 400, 'message' => '请指定文件ID']);
                exit;
            }
            echo json_encode($ragflow->getAncestors($fileId));
            break;

        case 'files_link_to_dataset':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $fileIds = $input['file_ids'] ?? [];
            $datasetId = $input['dataset_id'] ?? '';

            if (empty($fileIds)) {
                echo json_encode(['code' => 400, 'message' => '请指定要链接的文件/文件夹']);
                exit;
            }
            if (empty($datasetId)) {
                echo json_encode(['code' => 400, 'message' => '请指定目标知识库ID']);
                exit;
            }

            if (!is_array($fileIds)) {
                $fileIds = [$fileIds];
            }

            echo json_encode($ragflow->linkFilesToDatasets($fileIds, [$datasetId]));
            break;

        // ==================== 搜索应用管理 API ====================
        case 'search_app_list':
            header('Content-Type: application/json; charset=utf-8');
            $page = intval($_GET['page'] ?? 1);
            $pageSize = intval($_GET['page_size'] ?? 50);
            echo json_encode($ragflow->getSearchApps($page, $pageSize));
            break;

        case 'search_app_detail':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $searchId = $_GET['search_id'] ?? '';
            if (empty($searchId)) {
                echo json_encode(['code' => 400, 'message' => '请指定搜索应用ID']);
                exit;
            }
            echo json_encode($ragflow->getSearchAppDetail($searchId));
            break;

        case 'search_app_create':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $name = trim($input['name'] ?? '');
            $description = trim($input['description'] ?? '');

            if (empty($name)) {
                echo json_encode(['code' => 400, 'message' => '搜索应用名称不能为空']);
                exit;
            }
            echo json_encode($ragflow->createSearchApp($name, $description));
            break;

        case 'search_app_update':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $searchId = $input['search_id'] ?? '';
            $name = trim($input['name'] ?? '');
            $searchConfig = $input['search_config'] ?? [];

            if (empty($searchId)) {
                echo json_encode(['code' => 400, 'message' => '请指定搜索应用ID']);
                exit;
            }
            if (empty($name)) {
                echo json_encode(['code' => 400, 'message' => '搜索应用名称不能为空']);
                exit;
            }

            $payload = [
                'name' => $name,
                'search_config' => $searchConfig
            ];

            echo json_encode($ragflow->updateSearchApp($searchId, $payload));
            break;

        case 'search_app_delete':
            header('Content-Type: application/json; charset=utf-8');
            requireAdmin();
            $input = json_decode(file_get_contents('php://input'), true);
            $searchId = $input['search_id'] ?? '';

            if (empty($searchId)) {
                echo json_encode(['code' => 400, 'message' => '请指定搜索应用ID']);
                exit;
            }
            echo json_encode($ragflow->deleteSearchApp($searchId));
            break;

        case 'search_app_exec':
            header('Content-Type: application/json; charset=utf-8');
            $input = json_decode(file_get_contents('php://input'), true);
            $searchId = $input['search_id'] ?? '';
            $question = trim($input['question'] ?? '');

            if (empty($searchId) || empty($question)) {
                echo json_encode(['code' => 400, 'message' => '缺少搜索应用ID或提问内容']);
                exit;
            }

            $result = $ragflow->searchWithApp($searchId, $question);
            
            if (!isset($result['code'])) {
                $result = ['code' => 0, 'data' => $result];
            }
            
            echo json_encode($result);
            break;

        // ==================== 聊天应用 API ====================
        case 'chat_app_list':
            header('Content-Type: application/json; charset=utf-8');
            if (!$currentUser) {
                echo json_encode(['code' => 401, 'message' => '请先登录']);
                exit;
            }
            $page = intval($_GET['page'] ?? 1);
            $pageSize = intval($_GET['page_size'] ?? 50);
            $keywords = $_GET['keywords'] ?? '';
            echo json_encode($ragflow->getChatApps($page, $pageSize, $keywords));
            break;

        case 'chat_app_detail':
            header('Content-Type: application/json; charset=utf-8');
            $chatId = $_GET['chat_id'] ?? '';
            if (empty($chatId)) {
                echo json_encode(['code' => 400, 'message' => '未指定 chat_id']);
                exit;
            }
            echo json_encode($ragflow->getChatAppDetail($chatId));
            break;

        case 'chat_session_create':
            header('Content-Type: application/json; charset=utf-8');
            if (!$currentUser) {
                echo json_encode(['code' => 401, 'message' => '请先登录']);
                exit;
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $chatId = $input['chat_id'] ?? '';
            $name = trim($input['name'] ?? '');

            if (empty($chatId)) {
                echo json_encode(['code' => 400, 'message' => '未指定 chat_id']);
                exit;
            }

            $res = $ragflow->createChatSession($chatId, $name);
            if (($res['code'] === 0 || $res['code'] === 200) && !empty($res['data']['id'])) {
                $sessionId = $res['data']['id'];
                $userManager->bindUserSession($currentUser['id'], $chatId, $sessionId);
            }
            echo json_encode($res);
            break;

        case 'chat_session_list':
            header('Content-Type: application/json; charset=utf-8');
            if (!$currentUser) {
                echo json_encode(['code' => 401, 'message' => '请先登录']);
                exit;
            }
            $chatId = $_GET['chat_id'] ?? '';
            if (empty($chatId)) {
                echo json_encode(['code' => 400, 'message' => '未指定 chat_id']);
                exit;
            }

            $mySessionIds = $userManager->getUserSessionIds($currentUser['id'], $chatId);
            $sessions = [];
            foreach ($mySessionIds as $sessionId) {
                $res = $ragflow->getChatSessionMessages($chatId, $sessionId);
                if (($res['code'] ?? 500) !== 0) {
                    echo json_encode($res);
                    exit;
                }
                $session = $res['data'];
                unset($session['messages'], $session['reference']);
                $sessions[] = $session;
            }
            echo json_encode(['code' => 0, 'data' => $sessions]);
            break;

        case 'chat_session_detail':
            header('Content-Type: application/json; charset=utf-8');
            if (!$currentUser) {
                echo json_encode(['code' => 401, 'message' => '请先登录']);
                exit;
            }
            $chatId = $_GET['chat_id'] ?? '';
            $sessionId = $_GET['session_id'] ?? '';

            if (empty($chatId) || empty($sessionId)) {
                echo json_encode(['code' => 400, 'message' => '缺少必要参数']);
                exit;
            }

            $mySessionIds = $userManager->getUserSessionIds($currentUser['id'], $chatId);
            if (!in_array($sessionId, $mySessionIds)) {
                echo json_encode(['code' => 403, 'message' => '无权调阅此对话上下文']);
                exit;
            }

            echo json_encode($ragflow->getChatSessionMessages($chatId, $sessionId));
            break;

        case 'chat_session_delete':
            header('Content-Type: application/json; charset=utf-8');
            if (!$currentUser) {
                echo json_encode(['code' => 401, 'message' => '请先登录']);
                exit;
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $chatId = $input['chat_id'] ?? '';
            $sessionId = $input['session_id'] ?? '';

            if (empty($chatId) || empty($sessionId)) {
                echo json_encode(['code' => 400, 'message' => '缺少必要参数']);
                exit;
            }

            requirePortalSession($userManager, $currentUser, $chatId, $sessionId);
            $res = $ragflow->deleteChatSession($chatId, $sessionId);
            if (($res['code'] ?? 500) === 0) {
                $userManager->unbindUserSession($currentUser['id'], $sessionId);
            }
            echo json_encode($res);
            break;

        case 'chat_send':
            header('Content-Type: application/json; charset=utf-8');
            $input = json_decode(file_get_contents('php://input'), true);
            $chatId = $input['chat_id'] ?? '';
            $sessionId = $input['session_id'] ?? '';
            $question = trim($input['question'] ?? '');
            $stream = $input['stream'] ?? false;

            if (empty($chatId) || empty($sessionId) || empty($question)) {
                echo json_encode(['code' => 400, 'message' => '缺少必要参数']);
                exit;
            }

            requirePortalSession($userManager, $currentUser, $chatId, $sessionId);
            echo json_encode($ragflow->sendChatMessage($chatId, $sessionId, $question, $stream));
            break;

// ==================== Agent 管理 API ====================

case 'agent_list':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $page = intval($_GET['page'] ?? 1);
    $pageSize = intval($_GET['page_size'] ?? 50);
    $result = $ragflow->getAgentList($page, $pageSize);
    
    // 如果返回 401，直接返回错误信息
    if (isset($result['code']) && $result['code'] === 401) {
        echo json_encode($result);
        exit;
    }
    
    // 确保数据格式统一
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    
    // 如果 data 是对象但包含 canvas 字段（兼容处理）
    if (isset($result['data']['canvas']) && is_array($result['data']['canvas'])) {
        $result['data'] = $result['data']['canvas'];
    }
    
    echo json_encode($result);
    break;

case 'agent_detail':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $agentId = $_GET['agent_id'] ?? '';
    if (empty($agentId)) {
        echo json_encode(['code' => 400, 'message' => '请指定 Agent ID']);
        exit;
    }
    $result = $ragflow->getAgentDetail($agentId);
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    echo json_encode($result);
    break;

case 'agent_create':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $input = json_decode(file_get_contents('php://input'), true);
    $title = trim($input['title'] ?? $input['name'] ?? '');
    $description = trim($input['description'] ?? '');
    if (empty($title)) {
        echo json_encode(['code' => 400, 'message' => 'Agent 名称不能为空']);
        exit;
    }
    $result = $ragflow->createAgent($title, $description);
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    echo json_encode($result);
    break;

case 'agent_update':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $input = json_decode(file_get_contents('php://input'), true);
    $agentId = $input['agent_id'] ?? '';
    if (empty($agentId)) {
        echo json_encode(['code' => 400, 'message' => '请指定 Agent ID']);
        exit;
    }
    unset($input['agent_id']);
    $result = $ragflow->updateAgent($agentId, $input);
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    echo json_encode($result);
    break;

case 'agent_delete':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $input = json_decode(file_get_contents('php://input'), true);
    $agentId = $input['agent_id'] ?? '';
    if (empty($agentId)) {
        echo json_encode(['code' => 400, 'message' => '请指定 Agent ID']);
        exit;
    }
    $result = $ragflow->deleteAgent($agentId);
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    echo json_encode($result);
    break;

case 'agent_converse':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $input = json_decode(file_get_contents('php://input'), true);
    $agentId = $input['agent_id'] ?? '';
    $query = trim($input['query'] ?? '');
    $sessionId = $input['session_id'] ?? null;
    $stream = $input['stream'] ?? false;
    if (empty($agentId)) {
        echo json_encode(['code' => 400, 'message' => '请指定 Agent ID']);
        exit;
    }
    if (empty($query)) {
        $query = '请执行你的任务';
    }
    $result = $ragflow->converseAgent($agentId, $query, $stream, $sessionId);
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    echo json_encode($result);
    break;

case 'agent_converse_openai':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $input = json_decode(file_get_contents('php://input'), true);
    $agentId = $input['agent_id'] ?? '';
    $query = trim($input['query'] ?? '');
    $sessionId = $input['session_id'] ?? null;
    $stream = $input['stream'] ?? false;
    if (empty($agentId)) {
        echo json_encode(['code' => 400, 'message' => '请指定 Agent ID']);
        exit;
    }
    if (empty($query)) {
        $query = '请执行你的任务';
    }
    $result = $ragflow->converseAgentOpenAI($agentId, $query, $stream, $sessionId);
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    echo json_encode($result);
    break;

case 'agent_sessions':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $agentId = $_GET['agent_id'] ?? '';
    $page = intval($_GET['page'] ?? 1);
    $pageSize = intval($_GET['page_size'] ?? 20);
    if (empty($agentId)) {
        echo json_encode(['code' => 400, 'message' => '请指定 Agent ID']);
        exit;
    }
    $result = $ragflow->getAgentSessions($agentId, $page, $pageSize);
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    echo json_encode($result);
    break;

case 'agent_sessions_delete':
    header('Content-Type: application/json; charset=utf-8');
    requireAdmin();
    $input = json_decode(file_get_contents('php://input'), true);
    $agentId = $input['agent_id'] ?? '';
    $sessionIds = $input['session_ids'] ?? [];
    $deleteAll = $input['delete_all'] ?? false;
    if (empty($agentId)) {
        echo json_encode(['code' => 400, 'message' => '请指定 Agent ID']);
        exit;
    }
    $result = $ragflow->deleteAgentSessions($agentId, $sessionIds, $deleteAll);
    if (!isset($result['code'])) {
        $result = ['code' => 0, 'data' => $result];
    }
    echo json_encode($result);
    break;
    }
} catch (Throwable $e) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['code' => 500, 'message' => $e->getMessage()]);
}