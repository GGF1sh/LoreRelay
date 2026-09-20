"""Deterministic character portrait artifact adoption for LoreRelay MEDIA-M1.1."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import time


CHARACTER_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_IMAGE_BYTES = 64 * 1024 * 1024


class PortraitAdoptionError(ValueError):
    """Expected validation/adoption failure that must not mutate character state."""


def _is_under(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _write_json_atomic(target: Path, payload: dict) -> None:
    temp = target.with_name(f"{target.name}.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, target)
    finally:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass


def _version_token(source: Path, created_at: str) -> str:
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    digest.update(created_at.encode("utf-8"))
    return digest.hexdigest()[:16]


def adopt_character_portrait(
    workspace: str | os.PathLike[str],
    character_id: str,
    artifact_path: str | os.PathLike[str],
    created_at: str,
) -> dict:
    """Adopt exactly one generated artifact and atomically update one character JSON."""
    if not CHARACTER_ID_RE.fullmatch(str(character_id or "")):
        raise PortraitAdoptionError("invalid characterId")

    workspace_path = Path(workspace).expanduser().resolve(strict=True)
    if not workspace_path.is_dir():
        raise PortraitAdoptionError("workspace is not a directory")

    source_input = Path(artifact_path).expanduser()
    if source_input.is_symlink():
        raise PortraitAdoptionError("portrait artifact must not be a symbolic link")
    source = source_input.resolve(strict=True)
    if not source.is_file() or not _is_under(source, workspace_path):
        raise PortraitAdoptionError("portrait artifact must be a file inside the workspace")
    extension = source.suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise PortraitAdoptionError("portrait artifact type is not allowed")
    if source.stat().st_size <= 0 or source.stat().st_size > MAX_IMAGE_BYTES:
        raise PortraitAdoptionError("portrait artifact size is invalid")

    characters_dir = (workspace_path / "characters").resolve(strict=True)
    if not characters_dir.is_dir() or not _is_under(characters_dir, workspace_path):
        raise PortraitAdoptionError("workspace characters directory is missing")
    character_json = characters_dir / f"{character_id}.json"
    if character_json.is_symlink() or not character_json.is_file():
        raise PortraitAdoptionError("character profile does not exist")
    try:
        character = json.loads(character_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PortraitAdoptionError(f"character profile is unreadable: {error}") from error
    if not isinstance(character, dict) or character.get("id") != character_id:
        raise PortraitAdoptionError("character profile does not belong to characterId")

    previous_portrait = character.get("portrait") if isinstance(character.get("portrait"), str) else None
    token = _version_token(source, created_at)
    destination = characters_dir / f"{character_id}_portrait_{token}{extension}"
    created_destination = False
    try:
        if source != destination:
            with destination.open("xb") as destination_handle, source.open("rb") as source_handle:
                shutil.copyfileobj(source_handle, destination_handle)
            created_destination = True
        character["portrait"] = str(destination)
        _write_json_atomic(character_json, character)
    except Exception:
        if created_destination:
            try:
                destination.unlink(missing_ok=True)
            except OSError:
                pass
        raise

    # Cleanup runs only after the authoritative JSON update succeeds. It is
    # limited to this character's versioned generated portraits.
    owned_pattern = re.compile(
        rf"^{re.escape(character_id)}_portrait_[0-9a-f]{{16}}\.(?:png|jpe?g|webp)$",
        re.IGNORECASE,
    )
    cleaned_paths: list[str] = []
    for candidate in characters_dir.iterdir():
        if candidate == destination or candidate.is_symlink() or not candidate.is_file():
            continue
        if owned_pattern.fullmatch(candidate.name):
            try:
                candidate.unlink()
                cleaned_paths.append(str(candidate))
            except OSError:
                pass

    # Native portrait generation writes scene_<uuid>.png into characters/.
    # Remove only that exact generated source shape after successful adoption.
    if source != destination and source.parent == characters_dir and re.fullmatch(r"scene_[0-9a-f]{8}\.png", source.name):
        try:
            source.unlink()
            cleaned_paths.append(str(source))
        except OSError:
            pass

    return {
        "success": True,
        "outputPath": str(destination),
        "createdAt": created_at,
        "characterId": character_id,
        "previousPortraitPath": previous_portrait,
        "cleanedPaths": cleaned_paths,
    }
