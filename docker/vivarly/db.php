<?php
require_once __DIR__ . '/config.php';

class DB {
    private static $pdo = null;

    public static function getConnection() {
        if (self::$pdo === null) {
            try {
                vivarly_ensure_schema();
                $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
                self::$pdo = new PDO($dsn, DB_USER, DB_PASS, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
                ]);
            } catch (PDOException $e) {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['code' => 500, 'message' => '数据库连接失败: ' . $e->getMessage()]);
                exit;
            }
        }
        return self::$pdo;
    }
}

class UserManager {
    private $db;

    public function __construct() {
        $this->db = DB::getConnection();
    }

    public function findByAccount($account) {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE username = :acc OR email = :acc LIMIT 1");
        $stmt->execute([':acc' => $account]);
        return $stmt->fetch();
    }

    public function findByEmail($email) {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        return $stmt->fetch();
    }

    public function register($email, $password, $username = '', $realName = '') {
        if (empty($username)) {
            $username = explode('@', $email)[0];
        }
        if ($this->findByEmail($email)) {
            return ['code' => 400, 'message' => '该电子邮件已被注册'];
        }
        if ($this->findByAccount($username)) {
            $username = $username . '_' . rand(100, 999);
        }

        $hashPassword = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare("INSERT INTO users (username, email, password, real_name, role, status, created_at, updated_at) VALUES (:u, :e, :p, :r, 'user', 1, NOW(), NOW())");
        $res = $stmt->execute([
            ':u' => $username,
            ':e' => $email,
            ':p' => $hashPassword,
            ':r' => $realName
        ]);

        return $res ? ['code' => 0, 'message' => '注册成功'] : ['code' => 500, 'message' => '注册失败，请稍后重试'];
    }

    public function getUserList($page = 1, $pageSize = 20, $keywords = '') {
        $offset = ($page - 1) * $pageSize;
        $where = "WHERE 1=1";
        $params = [];

        if (!empty($keywords)) {
            $where .= " AND (username LIKE :kw OR email LIKE :kw OR real_name LIKE :kw)";
            $params[':kw'] = "%{$keywords}%";
        }

        $countStmt = $this->db->prepare("SELECT COUNT(*) as total FROM users {$where}");
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];

        $sql = "SELECT id, username, email, real_name, role, status, created_at, updated_at FROM users {$where} ORDER BY id DESC LIMIT {$offset}, {$pageSize}";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $list = $stmt->fetchAll();

        return [
            'total' => intval($total),
            'page' => $page,
            'page_size' => $pageSize,
            'list' => $list
        ];
    }

    public function createUser($username, $email, $password, $realName = '', $role = 'user') {
        if (!empty($email) && $this->findByEmail($email)) {
            return ['code' => 400, 'message' => '电子邮件已被占用'];
        }
        if ($this->findByAccount($username)) {
            return ['code' => 400, 'message' => '用户名已被占用'];
        }

        $hashPassword = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare("INSERT INTO users (username, email, password, real_name, role, status, created_at, updated_at) VALUES (:u, :e, :p, :r, :role, 1, NOW(), NOW())");
        $res = $stmt->execute([
            ':u' => $username,
            ':e' => $email,
            ':p' => $hashPassword,
            ':r' => $realName,
            ':role' => in_array($role, ['admin', 'user']) ? $role : 'user'
        ]);

        return $res ? ['code' => 0, 'message' => '创建成功'] : ['code' => 500, 'message' => '创建失败'];
    }

    public function updateUser($id, $data) {
        $fields = [];
        $params = [':id' => $id];

        if (isset($data['real_name'])) {
            $fields[] = "real_name = :real_name";
            $params[':real_name'] = $data['real_name'];
        }
        if (isset($data['email'])) {
            $fields[] = "email = :email";
            $params[':email'] = $data['email'];
        }
        if (isset($data['role'])) {
            $fields[] = "role = :role";
            $params[':role'] = $data['role'];
        }
        if (isset($data['status'])) {
            $fields[] = "status = :status";
            $params[':status'] = intval($data['status']);
        }
        if (!empty($data['password'])) {
            $fields[] = "password = :password";
            $params[':password'] = password_hash($data['password'], PASSWORD_BCRYPT);
        }

        if (empty($fields)) {
            return ['code' => 400, 'message' => '没有可更新的内容'];
        }

        $fields[] = "updated_at = NOW()";
        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $this->db->prepare($sql);
        $res = $stmt->execute($params);

        return $res ? ['code' => 0, 'message' => '更新成功'] : ['code' => 500, 'message' => '更新失败'];
    }

    public function deleteUser($id) {
        $stmt = $this->db->prepare("DELETE FROM users WHERE id = :id");
        $res = $stmt->execute([':id' => $id]);
        return $res ? ['code' => 0, 'message' => '删除成功'] : ['code' => 500, 'message' => '删除失败'];
    }

    // ==================== Session 级多租户隔离方法 ====================

    // 将 Session 绑定给发起提问的当前用户/管理员
    public function bindUserSession($userId, $chatAppId, $sessionId) {
        $stmt = $this->db->prepare("INSERT INTO user_sessions (user_id, chat_app_id, session_id, created_at) VALUES (:uid, :appid, :sid, NOW())");
        return $stmt->execute([':uid' => $userId, ':appid' => $chatAppId, ':sid' => $sessionId]);
    }

    // 查询当前用户在指定 Chat App 下创建的 Session ID 数组
    public function getUserSessionIds($userId, $chatAppId = '') {
        $sql = "SELECT session_id FROM user_sessions WHERE user_id = :uid";
        $params = [':uid' => $userId];
        if (!empty($chatAppId)) {
            $sql .= " AND chat_app_id = :appid";
            $params[':appid'] = $chatAppId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    // 删除映射记录
    public function unbindUserSession($userId, $sessionId) {
        $stmt = $this->db->prepare("DELETE FROM user_sessions WHERE user_id = :uid AND session_id = :sid");
        return $stmt->execute([':uid' => $userId, ':sid' => $sessionId]);
    }
}