# Vivarly portal for RAGFlow v0.27.1

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

The portal currently returns complete JSON answers, not browser-streamed chat.
Search SSE is collected server-side, including references; interrupted or failed
streams return errors. A new Agent starts with a valid Agent/Message canvas and
uses the tenant's configured default chat model.

## Verification

From the repository root (PHP and Node must be on PATH):

```sh
python test/unit_test/vivarly/test_portal_contract.py
node test/unit_test/vivarly/portal-ui.test.cjs
```

The contract suite uses a local mock HTTP server and never mutates live datasets.
The UI suite uses the existing `web/node_modules` installation. These checks do
not replace deployment verification with a reachable RAGFlow service and MySQL.
