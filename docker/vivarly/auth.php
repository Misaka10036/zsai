<?php
require_once __DIR__ . '/config.php';

function getCurrentUser() {
    return $_SESSION['user'] ?? null;
}

// 登录拦截器：未登录直接跳转至登录页
function checkAuth() {
    $user = getCurrentUser();
    if (!$user) {
        header("Location: /views/login.php");
        exit;
    }
    return $user;
}

// 管理员专用权限拦截器
function checkAdmin() {
    $user = checkAuth();
    if (($user['role'] ?? '') !== 'admin') {
        header("Location: /views/user/index.php");
        exit;
    }
    return $user;
}

// 普通用户校验与非法越权拦截器（如果管理员访问 user 页面，引导至 admin 页面）
function checkUserRole($requiredRole = 'user') {
    $user = checkAuth();
    if ($requiredRole === 'admin' && $user['role'] !== 'admin') {
        header("Location: /views/user/index.php");
        exit;
    }
    if ($requiredRole === 'user' && $user['role'] === 'admin') {
        // 如果管理员误入普通用户页面，可根据需求允许或自动重定向到管理后台
        // 此处允许管理员调阅，但角色标识不变
    }
    return $user;
}