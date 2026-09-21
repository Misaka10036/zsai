<?php

function refreshPortalUser($manager) {
    $sessionUser = $_SESSION['user'] ?? null;
    if (!$sessionUser) return null;
    $user = $manager->findById($sessionUser['id']);
    if (!$user || (int) $user['status'] !== 1) {
        unset($_SESSION['user']);
        return null;
    }
    unset($user['password']);
    $_SESSION['user'] = $user;
    return $user;
}

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
