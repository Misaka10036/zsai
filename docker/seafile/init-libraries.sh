#!/usr/bin/env bash
set -euo pipefail

URL="${SEAFILE_URL:-http://seafile}"
EMAIL="${SEAFILE_ADMIN_EMAIL:-ragflow@localhost}"
PASSWORD="${SEAFILE_ADMIN_PASSWORD:-infini_rag_flow}"
DAILY_LIB="${SEAFILE_DAILY_LIBRARY:-日报}"
WEEKLY_LIB="${SEAFILE_WEEKLY_LIBRARY:-周报}"
DATABASE_LIB="${SEAFILE_DATABASE_LIBRARY:-数据库镜像}"

echo "Waiting for Seafile API at ${URL} ..."
ready=0
for _ in $(seq 1 90); do
  if curl -sf "${URL}/api2/ping/" | grep -q pong; then
    ready=1
    break
  fi
  sleep 10
done
if [ "$ready" -ne 1 ]; then
  echo "Seafile API did not become ready." >&2
  exit 1
fi

token=""
for _ in $(seq 1 30); do
  body="$(curl -sf -X POST --data-urlencode "username=${EMAIL}" --data-urlencode "password=${PASSWORD}" "${URL}/api2/auth-token/" || true)"
  token="$(printf '%s' "$body" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [ -n "$token" ]; then
    break
  fi
  sleep 5
done
if [ -z "$token" ]; then
  echo "Could not obtain a Seafile admin token." >&2
  exit 1
fi

ensure_library() {
  local name="$1"
  local repos
  repos="$(curl -sf -H "Authorization: Token ${token}" -H "Accept: application/json" "${URL}/api2/repos/" || true)"
  if printf '%s' "$repos" | grep -F "\"${name}\"" >/dev/null; then
    echo "Seafile library already exists: ${name}"
    return 0
  fi
  curl -sf -X POST \
    -H "Authorization: Token ${token}" \
    --data-urlencode "name=${name}" \
    "${URL}/api2/repos/" >/dev/null
  echo "Created Seafile library: ${name}"
}

ensure_library "$DAILY_LIB"
ensure_library "$WEEKLY_LIB"
ensure_library "$DATABASE_LIB"
echo "Seafile daily-report, weekly-report, and database-snapshot libraries are ready."
