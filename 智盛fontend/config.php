<?php
define('PROJECT_ROOT', __DIR__);

$vivarlyLocalConfig = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];

function vivarly_env($name, $default = '') {
    global $vivarlyLocalConfig;
    $value = getenv($name);
    if ($value === false || $value === '') {
        return $vivarlyLocalConfig[$name] ?? $default;
    }
    return $value;
}

define('RAGFLOW_BASE_URL', rtrim(vivarly_env('RAGFLOW_BASE_URL', 'http://ragflow-cpu'), '/'));
define('RAGFLOW_API_KEY', vivarly_env('RAGFLOW_API_KEY', ''));

define('DB_HOST', vivarly_env('DB_HOST', 'mysql'));
define('DB_PORT', vivarly_env('DB_PORT', '3306'));
define('DB_NAME', vivarly_env('DB_NAME', 'vivarly_db'));
define('DB_USER', vivarly_env('DB_USER', 'root'));
define('DB_PASS', vivarly_env('DB_PASS', 'infini_rag_flow'));
define('VIVARLY_ADMIN_USER', vivarly_env('VIVARLY_ADMIN_USER', 'admin'));
define('VIVARLY_ADMIN_PASSWORD', vivarly_env('VIVARLY_ADMIN_PASSWORD', 'admin123'));
define('VIVARLY_ADMIN_EMAIL', vivarly_env('VIVARLY_ADMIN_EMAIL', 'admin@localhost'));

define('DEBUG_MODE', vivarly_env('DEBUG_MODE', '0') === '1');

if (DEBUG_MODE) {
    ini_set('display_errors', 1);
    error_reporting(E_ALL);
}

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
    session_start();
}

require_once __DIR__ . '/schema.php';
