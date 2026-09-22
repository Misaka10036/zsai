"""Shared SeaFile HTTP client used by the data-source connector and the agent tool."""

from __future__ import annotations

import logging
from typing import Any, Optional

from common.data_source.exceptions import ConnectorMissingCredentialError
from common.data_source.seafile_week import (
    host_of,
    normalise_path,
    parse_mtime,
    rewrite_seafile_url_for_runtime,
)
from common.data_source.utils import rl_requests

__all__ = ["SeafileClient", "host_of", "normalise_path", "open_seafile_client", "parse_mtime"]

logger = logging.getLogger(__name__)


def open_seafile_client(config: dict) -> "SeafileClient":
    """Build a client that can browse libraries and directories.

    An account token wins over a repo token so the picker can open any library
    the account can see. A repo token alone stays limited to that library.
    """
    if not isinstance(config, dict):
        raise ValueError("config must be an object")
    url = str(config.get("seafile_url") or "").strip()
    credentials = config.get("credentials") or {}
    if not isinstance(credentials, dict):
        credentials = {}
    token = str(credentials.get("seafile_token") or "").strip()
    repo_token = str(credentials.get("repo_token") or "").strip()
    if not url:
        raise ValueError("Seafile URL is required.")
    if not token and not repo_token:
        raise ValueError("Seafile token is required.")
    return SeafileClient(url, token=token or None, repo_token=None if token else repo_token)


class SeafileClient:
    """Account-token (/api2) and repo-token (/api/v2.1/via-repo-token) HTTP client."""

    def __init__(
        self,
        seafile_url: str,
        token: Optional[str] = None,
        repo_token: Optional[str] = None,
        timeout: int = 60,
        download_hosts: Optional[list[str]] = None,
    ) -> None:
        rewritten, rewrite_hosts = rewrite_seafile_url_for_runtime(seafile_url or "")
        self.seafile_url = rewritten
        self.token = token
        self.repo_token = repo_token
        self.timeout = timeout
        allowed = {h.lower() for h in (download_hosts or []) if h}
        for extra in rewrite_hosts:
            allowed.add(extra)
        if self.seafile_url:
            base_host = host_of(self.seafile_url)
            if base_host:
                allowed.add(base_host)
        self.download_hosts = allowed

    @property
    def use_repo_token(self) -> bool:
        return self.repo_token is not None

    def account_headers(self) -> dict[str, str]:
        if not self.token:
            raise ConnectorMissingCredentialError("Account token not set")
        return {
            "Authorization": f"Token {self.token}",
            "Accept": "application/json",
        }

    def repo_token_headers(self) -> dict[str, str]:
        if not self.repo_token:
            raise ConnectorMissingCredentialError("Repo token not set")
        return {
            "Authorization": f"Bearer {self.repo_token}",
            "Accept": "application/json",
        }

    def account_get(self, endpoint: str, params: Optional[dict] = None):
        url = f"{self.seafile_url}/api2/{endpoint.lstrip('/')}"
        return rl_requests.get(
            url,
            headers=self.account_headers(),
            params=params,
            timeout=self.timeout,
        )

    def account_post(
        self,
        endpoint: str,
        params: Optional[dict] = None,
        data: Optional[dict] = None,
        json: Optional[dict] = None,
        files: Optional[dict] = None,
    ):
        url = f"{self.seafile_url}/api2/{endpoint.lstrip('/')}"
        return rl_requests.post(
            url,
            headers=self.account_headers(),
            params=params,
            data=data,
            json=json,
            files=files,
            timeout=self.timeout,
        )

    def repo_token_get(self, endpoint: str, params: Optional[dict] = None):
        url = f"{self.seafile_url}/api/v2.1/via-repo-token/{endpoint.lstrip('/')}"
        return rl_requests.get(
            url,
            headers=self.repo_token_headers(),
            params=params,
            timeout=self.timeout,
        )

    def repo_token_post(
        self,
        endpoint: str,
        params: Optional[dict] = None,
        data: Optional[dict] = None,
        json: Optional[dict] = None,
        files: Optional[dict] = None,
    ):
        url = f"{self.seafile_url}/api/v2.1/via-repo-token/{endpoint.lstrip('/')}"
        return rl_requests.post(
            url,
            headers=self.repo_token_headers(),
            params=params,
            data=data,
            json=json,
            files=files,
            timeout=self.timeout,
        )

    def list_libraries(self) -> list[dict]:
        resp = self.account_get("/repos/")
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, list) else []

    def get_repo_info(self, repo_id: Optional[str] = None) -> Optional[dict]:
        if self.use_repo_token:
            resp = self.repo_token_get("repo-info/")
            resp.raise_for_status()
            info = resp.json()
            return {
                "id": info.get("repo_id", repo_id),
                "name": info.get("repo_name", repo_id),
            }
        if not repo_id:
            return None
        resp = self.account_get(f"/repos/{repo_id}/")
        resp.raise_for_status()
        return resp.json()

    def list_dir(self, repo_id: str, path: str = "/") -> list[dict]:
        path = normalise_path(path)
        if self.use_repo_token:
            resp = self.repo_token_get("dir/", params={"path": path})
        else:
            resp = self.account_get(f"/repos/{repo_id}/dir/", params={"p": path})
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and "dirent_list" in data:
            return data["dirent_list"] or []
        return data if isinstance(data, list) else []

    def get_download_link(self, repo_id: str, path: str) -> Optional[str]:
        path = normalise_path(path)
        if self.use_repo_token:
            resp = self.repo_token_get("download-link/", params={"path": path})
        else:
            resp = self.account_get(f"/repos/{repo_id}/file/", params={"p": path, "reuse": 1})
        resp.raise_for_status()
        link = resp.text.strip().strip('"')
        return link or None

    def assert_download_host_allowed(self, url: str) -> None:
        if not self.download_hosts:
            return
        host = host_of(url)
        if not host or host not in self.download_hosts:
            raise ValueError(f"SeaFile download host {host!r} is not on the allowlist")

    def download(self, url: str, timeout: int = 120) -> bytes:
        self.assert_download_host_allowed(url)
        resp = rl_requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.content

    def open_download(self, url: str, timeout: int = 600):
        """Open a streaming download response; the caller must close it."""
        self.assert_download_host_allowed(url)
        resp = rl_requests.get(url, timeout=timeout, stream=True)
        resp.raise_for_status()
        return resp

    def _parse_link(self, resp) -> str:
        resp.raise_for_status()
        try:
            data = resp.json()
        except Exception:
            data = None
        if isinstance(data, str) and data.strip():
            link = data.strip()
        elif isinstance(data, dict):
            link = str(data.get("url") or data.get("upload_link") or data.get("link") or "").strip()
        else:
            link = (resp.text or "").strip().strip('"')
        if not link:
            raise ValueError("Seafile did not return an upload/update link.")
        rewritten, extra_hosts = rewrite_seafile_url_for_runtime(link)
        for host in extra_hosts:
            self.download_hosts.add(host.lower())
        return rewritten

    def get_upload_link(self, repo_id: str, parent_dir: str = "/") -> str:
        parent_dir = normalise_path(parent_dir)
        if self.use_repo_token:
            resp = self.repo_token_get("upload-link/", params={"path": parent_dir})
        else:
            resp = self.account_get(f"/repos/{repo_id}/upload-link/", params={"p": parent_dir})
        return self._parse_link(resp)

    def get_update_link(self, repo_id: str, parent_dir: str = "/") -> str:
        parent_dir = normalise_path(parent_dir)
        if self.use_repo_token:
            resp = self.repo_token_get("update-link/", params={"path": parent_dir})
        else:
            resp = self.account_get(f"/repos/{repo_id}/update-link/", params={"p": parent_dir})
        return self._parse_link(resp)

    def mkdir(self, repo_id: str, path: str) -> None:
        path = normalise_path(path)
        if path == "/":
            return
        if self.use_repo_token:
            resp = self.repo_token_post("dir/", params={"path": path}, data={"operation": "mkdir"})
        else:
            resp = self.account_post(f"/repos/{repo_id}/dir/", params={"p": path}, data={"operation": "mkdir"})
        if resp.status_code in {200, 201, 400, 409}:
            return
        resp.raise_for_status()

    def ensure_dir(self, repo_id: str, path: str) -> None:
        path = normalise_path(path)
        if path == "/":
            return
        current = ""
        for part in [p for p in path.split("/") if p]:
            current = f"{current}/{part}"
            try:
                self.list_dir(repo_id, current)
            except Exception:
                self.mkdir(repo_id, current)

    def file_exists(self, repo_id: str, path: str) -> bool:
        path = normalise_path(path)
        parent, name = path.rsplit("/", 1) if "/" in path.rstrip("/") else ("/", path.strip("/"))
        parent = parent or "/"
        try:
            entries = self.list_dir(repo_id, parent)
        except Exception:
            return False
        return any((entry.get("name") or "") == name and entry.get("type") == "file" for entry in entries)

    def upsert_file(
        self,
        repo_id: str,
        parent_dir: str,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, str]:
        from common.data_source.seafile_week import weekly_report_content_type

        parent_dir = normalise_path(parent_dir)
        filename = (filename or "").strip()
        if not filename or "/" in filename or "\\" in filename:
            raise ValueError(f"invalid Seafile filename {filename!r}")
        dest = filename if parent_dir == "/" else f"{parent_dir.rstrip('/')}/{filename}"
        if not dest.startswith("/"):
            dest = f"/{dest}"
        mime = (content_type or "").strip() or weekly_report_content_type(filename.rsplit(".", 1)[-1])
        self.ensure_dir(repo_id, parent_dir)
        exists = self.file_exists(repo_id, dest)
        if exists:
            link = self.get_update_link(repo_id, parent_dir)
            self.assert_download_host_allowed(link)
            resp = rl_requests.post(
                link,
                files={"file": (filename, content, mime)},
                data={"filename": filename, "target_file": dest},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            return {"action": "replaced", "path": dest}
        link = self.get_upload_link(repo_id, parent_dir)
        self.assert_download_host_allowed(link)
        upload_url = link if "ret-json" in link else f"{link}{'&' if '?' in link else '?'}ret-json=1"
        resp = rl_requests.post(
            upload_url,
            files={"file": (filename, content, mime)},
            data={"parent_dir": parent_dir, "replace": "1"},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return {"action": "created", "path": dest}
