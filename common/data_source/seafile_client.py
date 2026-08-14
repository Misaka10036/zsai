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

__all__ = ["SeafileClient", "host_of", "normalise_path", "parse_mtime"]

logger = logging.getLogger(__name__)


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

    def repo_token_get(self, endpoint: str, params: Optional[dict] = None):
        url = f"{self.seafile_url}/api/v2.1/via-repo-token/{endpoint.lstrip('/')}"
        return rl_requests.get(
            url,
            headers=self.repo_token_headers(),
            params=params,
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
