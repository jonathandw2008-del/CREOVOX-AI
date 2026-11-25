"""On-disk layout for user media. All paths stored in the DB are relative to settings.storage_dir.

storage/
  {user_id}/assets/{asset_id}/source.<ext>   uploaded video
  {user_id}/assets/{asset_id}/proxy.mp4       browser-playable copy (when needed)
  {user_id}/assets/{asset_id}/poster.jpg
  {user_id}/projects/{project_id}/frames/*.jpg            thumbnail candidate frames
  {user_id}/projects/{project_id}/jobs/{job_id}/...       render / package outputs
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

from app.config import settings

SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")


def root() -> Path:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings.storage_dir.resolve()


def abs_path(rel: str | Path) -> Path:
    p = (root() / rel).resolve()
    if root() not in p.parents and p != root():
        raise ValueError("Path escapes storage root")
    return p


def rel_path(p: Path) -> str:
    return str(p.resolve().relative_to(root()))


def asset_dir(user_id: str, asset_id: str) -> Path:
    d = root() / user_id / "assets" / asset_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def project_dir(user_id: str, project_id: str) -> Path:
    d = root() / user_id / "projects" / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def frames_dir(user_id: str, project_id: str) -> Path:
    d = project_dir(user_id, project_id) / "frames"
    d.mkdir(parents=True, exist_ok=True)
    return d


def job_dir(user_id: str, project_id: str | None, job_id: str) -> Path:
    base = project_dir(user_id, project_id) if project_id else root() / user_id / "jobs"
    d = base / "jobs" / job_id if project_id else base / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def remove_tree(p: Path) -> None:
    shutil.rmtree(p, ignore_errors=True)


def safe_name(name: str) -> bool:
    return bool(SAFE_NAME.match(name)) and ".." not in name
