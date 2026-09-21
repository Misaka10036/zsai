# Vivarly portal for RAGFlow v0.27.1

## Windows 本地启动

在项目根目录运行 `powershell -ExecutionPolicy Bypass -File .\start_frontend.ps1`，
同时启动原版 Vite 前端（`http://127.0.0.1:9222`）和本目录的智盛前端
（`http://127.0.0.1:8080`）。按 Ctrl+C 停止两个前端；后端需要单独启动。

可使用 `-Port 19222 -ZhishengPort 18081` 调整端口。端口占用时脚本会直接报错。
智盛前端默认连接 `http://127.0.0.1:9380`，可用 `-BackendUrl` 调整；此参数仅控制
智盛前端，原版 Vite 的代理仍由 `-ApiProxyScheme` 及 Vite 配置决定。
API key 和数据库设置继续从本目录 `config.local.php` 或环境变量读取。

本地智盛页面使用 Docker MySQL 中的 `vivarly_db` 数据库。宿主机连接地址为
`127.0.0.1:3307`，容器映射为 `3307:3306`，避免占用宿主机本地 MySQL 的 `3306`。
容器内的应用仍使用 `mysql:3306`。数据库保存在 Compose 的 `mysql_data` 卷中；
重建容器会保留该卷，勿使用 `docker compose down -v` 删除数据卷。
本地专用数据库账号仅授予 `vivarly_db` 的读写权限，密码保存在被 Git 忽略的
`config.local.php` 中，已有智盛登录账号保持不变。

脚本会查找 PATH 或 WinGet 安装目录中的 PHP，也可通过 `-PhpPath` 指定 `php.exe`。
需要 PHP 8.2+ 及 curl、fileinfo、pdo_mysql、session、mbstring 扩展。
运行日志保存在项目 `logs/frontend-时间戳/` 目录。
本地门户使用同源 Node 代理和三个 PHP worker（其中一个专供 Agent 取消），
避免长问答阻塞取消请求。Ctrl+C 会停止全部子进程。生产部署使用并发 PHP-FPM；
直接使用单个 `php -S` 进程无法及时取消正在执行的请求。

The browser calls `api.php`; PHP authenticates the portal user and calls RAGFlow
with the server-side API key. Logged-in portal users share the knowledge resources
of that API key's tenant. Chat sessions are private to their portal owner.
Knowledge/file mutations and Agent administration require the portal admin role.

## Configuration

Requires PHP 8.2+, cURL, fileinfo, PDO MySQL, and the portal's MySQL database.
Configure `RAGFLOW_BASE_URL`, `RAGFLOW_API_KEY`, `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, and `DB_PASS` in the PHP server environment. In Compose,
`RAGFLOW_BASE_URL=http://ragflow-cpu` reaches RAGFlow through its service name.
For a separate host, use the backend's reachable HTTP address; `localhost`
always refers to the PHP host or container itself.

For a local installation, `config.local.php` may return an associative array of
these values. Environment variables take precedence. This local file is excluded
from Git and Docker build contexts. Keep `DEBUG_MODE=0` outside development.
This repository's deployment initializes the portal schema through `schema.php`;
an existing desktop installation can retain its own database initialization.

Chat and Agent runs stream through PHP to the browser using the Python backend's
SSE protocol. Text, reasoning and references update as events arrive; Agent node
events appear in the execution log. Missing completion markers and backend errors
are reported while preserving partial output. Search SSE is still collected
server-side, including references. A new Agent starts with a valid Agent/Message canvas and
uses the tenant's configured default chat model. Agent runs create a session first,
reuse it across normal turns, and cancel through the Python task API. Protected
requests refresh the portal user's account status and role.

Uploads report per-file results and optionally submit successful documents for
parsing (enabled by default). Search applications require a dataset selection;
admins can edit their dataset binding in the portal. Chat displays source
references. PDF/text preview and optional search mindmaps use local browser assets;
other document formats offer the original download. PDF.js 2.16.105, its matching
worker, CMaps, fonts and licenses are bundled from the workspace dependency;
PDF loading disables JavaScript evaluation (`isEvalSupported: false`).

## Verification

From the repository root (PHP and Node must be on PATH):

```sh
python test/unit_test/vivarly/test_portal_contract.py
node test/unit_test/vivarly/portal-ui.test.cjs
node test/unit_test/vivarly/portal-workflows.test.cjs
node test/unit_test/vivarly/portal-streaming.test.cjs
```

The contract suite uses a local mock HTTP server and never mutates live datasets.
The UI suite uses the existing `web/node_modules` installation. These checks do
not replace deployment verification with a reachable RAGFlow service and MySQL.

具体修复与验证范围见 [FUNCTIONAL_CHECK.md](FUNCTIONAL_CHECK.md)。
