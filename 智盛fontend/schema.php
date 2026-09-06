<?php

function vivarly_ensure_schema() {
    static $ready = false;
    if ($ready) {
        return;
    }

    $dsnRoot = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4';
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4',
    ];

    $root = new PDO($dsnRoot, DB_USER, DB_PASS, $options);
    $dbName = str_replace('`', '', DB_NAME);
    $root->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $root->exec("USE `{$dbName}`");

    $root->exec(
        "CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL,
            email VARCHAR(255) NOT NULL DEFAULT '',
            password VARCHAR(255) NOT NULL,
            real_name VARCHAR(128) NOT NULL DEFAULT '',
            role VARCHAR(16) NOT NULL DEFAULT 'user',
            status TINYINT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uk_username (username),
            KEY idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $root->exec(
        "CREATE TABLE IF NOT EXISTS user_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            chat_app_id VARCHAR(64) NOT NULL DEFAULT '',
            session_id VARCHAR(128) NOT NULL,
            created_at DATETIME NOT NULL,
            KEY idx_user_app (user_id, chat_app_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $count = (int) $root->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($count === 0) {
        $stmt = $root->prepare(
            "INSERT INTO users (username, email, password, real_name, role, status, created_at, updated_at)
             VALUES (:u, :e, :p, :r, 'admin', 1, NOW(), NOW())"
        );
        $stmt->execute([
            ':u' => VIVARLY_ADMIN_USER,
            ':e' => VIVARLY_ADMIN_EMAIL,
            ':p' => password_hash(VIVARLY_ADMIN_PASSWORD, PASSWORD_BCRYPT),
            ':r' => '管理员',
        ]);
    }

    $ready = true;
}
