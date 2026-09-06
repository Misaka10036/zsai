<?php

function requirePortalLogin($user) {
    if (!$user) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['code' => 401, 'message' => '请先登录']);
        exit;
    }
}

function requirePortalSession($manager, $user, $chatId, $sessionId) {
    requirePortalLogin($user);
    if (!in_array($sessionId, $manager->getUserSessionIds($user['id'], $chatId), true)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['code' => 403, 'message' => '无权访问此会话']);
        exit;
    }
}
