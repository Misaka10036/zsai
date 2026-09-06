#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You can obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""Make NLTK tokenizer/wordnet data available to host and Docker runtimes."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import zipfile
from pathlib import Path
from urllib.request import urlopen

logger = logging.getLogger(__name__)

_REQUIRED = (
    ("punkt_tab", "tokenizers/punkt_tab.zip", "tokenizers/punkt_tab"),
    ("punkt", "tokenizers/punkt.zip", "tokenizers/punkt"),
    ("wordnet", "corpora/wordnet.zip", "corpora/wordnet"),
)

_PACKAGE_MIRRORS = (
    "https://ghfast.top/https://github.com/nltk/nltk_data/raw/gh-pages/packages/{package}",
    "https://ghfast.top/https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/{package}",
    "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/{package}",
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def candidate_data_dirs() -> list[Path]:
    env = (os.environ.get("NLTK_DATA") or "").strip()
    root = _repo_root()
    dirs: list[Path] = []
    if env:
        dirs.append(Path(env))
    dirs.extend((root / "nltk_data", root / "ragflow_deps" / "nltk_data"))
    seen: set[str] = set()
    unique: list[Path] = []
    for path in dirs:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def _register_paths() -> None:
    import nltk

    for path in candidate_data_dirs():
        text = str(path)
        if text not in nltk.data.path:
            nltk.data.path.insert(0, text)


def _download_dir() -> Path:
    env = (os.environ.get("NLTK_DATA") or "").strip()
    dest = Path(env) if env else _repo_root() / "nltk_data"
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def _has_resource(find_path: str) -> bool:
    import nltk

    try:
        nltk.data.find(find_path)
        return True
    except (LookupError, OSError, zipfile.BadZipFile):
        return False


def _download_with_curl(url: str, zip_path: Path) -> bool:
    curl = shutil.which("curl")
    if not curl:
        return False
    result = subprocess.run(
        [curl, "-fsSL", "--connect-timeout", "15", "--max-time", "90", "-o", str(zip_path), url],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0 and zip_path.exists() and zip_path.stat().st_size > 0


def _download_with_urllib(url: str, zip_path: Path) -> bool:
    with urlopen(url, timeout=20) as resp:
        payload = resp.read()
    if not payload:
        return False
    zip_path.write_bytes(payload)
    return zip_path.stat().st_size > 0


def _fetch_zip(package_path: str, dest_dir: Path) -> bool:
    dest_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dest_dir / Path(package_path).name
    for template in _PACKAGE_MIRRORS:
        url = template.format(package=package_path)
        try:
            zip_path.unlink(missing_ok=True)
            if _download_with_curl(url, zip_path) or _download_with_urllib(url, zip_path):
                with zipfile.ZipFile(zip_path) as archive:
                    archive.extractall(dest_dir)
                zip_path.unlink(missing_ok=True)
                logger.info("Installed NLTK package %s from %s", package_path, url)
                return True
        except Exception as exc:
            logger.warning("Failed to fetch NLTK package %s from %s: %s", package_path, url, exc)
            zip_path.unlink(missing_ok=True)
    return False


def ensure_nltk_data() -> Path:
    """Register local NLTK dirs and download any missing tokenizer/wordnet data."""
    dest = _download_dir()
    dest.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("NLTK_DATA", str(dest))
    _register_paths()

    for name, package_path, find_path in _REQUIRED:
        if _has_resource(find_path):
            continue
        logger.info("NLTK resource %s is missing; downloading into %s", name, dest)
        parent = dest / Path(package_path).parent
        if not _fetch_zip(package_path, parent) or not _has_resource(find_path):
            logger.error("NLTK resource %s is still missing after download attempts", name)
    return dest
