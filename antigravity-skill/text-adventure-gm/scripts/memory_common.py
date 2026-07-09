"""
軽量 Memory Bank（TF-IDF）+ Saga ヘルパー。
Bannerlord ChatSyncAuto / CHIM 風の長期記憶の簡易版。ChromaDB 不要。
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MEMORY_FORMAT = "text-adventure-memory/1.0"
SAGA_FORMAT = "text-adventure-saga/1.0"
SAGA_INDEX_FORMAT = "text-adventure-saga-index/1.0"


def tokenize(text: str) -> list[str]:
    """英単語 + CJK 2文字バイグラムでトークン化"""
    text = (text or "").lower()
    tokens: list[str] = []
    tokens.extend(re.findall(r"[a-z0-9]+", text))
    for seq in re.findall(r"[\u3000-\u9fff\uff00-\uffef]+", text):
        if len(seq) == 1:
            tokens.append(seq)
        else:
            for i in range(len(seq) - 1):
                tokens.append(seq[i : i + 2])
    return tokens


def _tf(tokens: list[str]) -> dict[str, float]:
    if not tokens:
        return {}
    counts = Counter(tokens)
    total = float(len(tokens))
    return {t: counts[t] / total for t in counts}


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in set(a) | set(b))
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def sagas_dir(cwd: Path) -> Path:
    return cwd / "sagas"


def memories_dir(cwd: Path) -> Path:
    return cwd / "memories"


def load_saga_index(cwd: Path) -> dict[str, Any]:
    index_path = sagas_dir(cwd) / "index.json"
    if not index_path.is_file():
        return {"format": SAGA_INDEX_FORMAT, "chapters": [], "nextChapter": 1}
    try:
        raw = json.loads(index_path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            raw.setdefault("format", SAGA_INDEX_FORMAT)
            raw.setdefault("chapters", [])
            raw.setdefault("nextChapter", len(raw.get("chapters", [])) + 1)
            return raw
    except (json.JSONDecodeError, OSError):
        pass
    return {"format": SAGA_INDEX_FORMAT, "chapters": [], "nextChapter": 1}


def load_saga_chapter(cwd: Path, chapter_id: str) -> dict[str, Any] | None:
    path = sagas_dir(cwd) / f"{chapter_id}.json"
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else None
    except (json.JSONDecodeError, OSError):
        return None


def list_saga_chapters(cwd: Path) -> list[dict[str, Any]]:
    index = load_saga_index(cwd)
    out: list[dict[str, Any]] = []
    for cid in index.get("chapters", []):
        ch = load_saga_chapter(cwd, str(cid))
        if ch:
            out.append(ch)
    return out


def build_saga_context(cwd: Path, max_chapters: int = 2) -> str:
    """GM プロンプト用 — 直近の Saga 章を注入"""
    chapters = list_saga_chapters(cwd)
    if not chapters:
        return ""
    recent = chapters[-max_chapters:]
    parts = ["[Saga Archive — recent chapters]"]
    for ch in recent:
        title = ch.get("title") or ch.get("id") or "chapter"
        parts.append(f"--- {title} ---")
        parts.append(str(ch.get("content") or "").strip())
    return "\n".join(parts)


def collect_memory_chunks(cwd: Path) -> list[dict[str, str]]:
    """Saga / ロアブック / 動的プロフィール / 履歴からチャンクを収集"""
    chunks: list[dict[str, str]] = []

    for ch in list_saga_chapters(cwd):
        text = str(ch.get("content") or "").strip()
        if text:
            chunks.append({
                "id": f"saga:{ch.get('id', 'unknown')}",
                "source": "saga",
                "label": str(ch.get("title") or ch.get("id") or "saga"),
                "text": text,
            })

    for name in ("lorebook.json", "world_info.json"):
        p = cwd / name
        if not p.is_file():
            continue
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            entries = raw.get("entries", [])
            if isinstance(entries, list):
                for e in entries:
                    if e.get("enabled", True) is False:
                        continue
                    content = str(e.get("content") or "").strip()
                    if content:
                        chunks.append({
                            "id": f"lore:{e.get('id') or e.get('comment') or 'entry'}",
                            "source": "lorebook",
                            "label": str(e.get("comment") or e.get("id") or "lore"),
                            "text": content,
                        })
        except (json.JSONDecodeError, OSError):
            pass

    dyn_path = cwd / "characters" / "dynamic_profiles.json"
    if dyn_path.is_file():
        try:
            dyn = json.loads(dyn_path.read_text(encoding="utf-8"))
            if isinstance(dyn, dict):
                for cid, prof in dyn.items():
                    text = str(prof or "").strip()
                    if text:
                        chunks.append({
                            "id": f"dynamic:{cid}",
                            "source": "dynamic_profile",
                            "label": f"Character {cid}",
                            "text": text,
                        })
        except (json.JSONDecodeError, OSError):
            pass

    hist_path = cwd / "game_history.json"
    if hist_path.is_file():
        try:
            hist = json.loads(hist_path.read_text(encoding="utf-8"))
            if isinstance(hist, list):
                for entry in hist[-30:]:
                    if not isinstance(entry, dict):
                        continue
                    content = str(entry.get("content") or "").strip()
                    if len(content) < 40:
                        continue
                    eid = str(entry.get("id") or "turn")
                    sender = str(entry.get("sender") or entry.get("role") or "GM")
                    chunks.append({
                        "id": f"history:{eid}",
                        "source": "history",
                        "label": f"{sender} ({eid})",
                        "text": content,
                    })
        except (json.JSONDecodeError, OSError):
            pass

    return chunks


def rebuild_memory_index(cwd: Path, backend: str | None = None) -> Path:
    """memories/index.json を再構築。Chroma 有効時は chroma_db も更新"""
    mem_dir = memories_dir(cwd)
    mem_dir.mkdir(parents=True, exist_ok=True)
    chunks = collect_memory_chunks(cwd)
    from memory_chroma import rebuild_chroma_index, resolve_memory_backend

    resolved = resolve_memory_backend(backend)
    index = {
        "format": MEMORY_FORMAT,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "chunkCount": len(chunks),
        "backend": resolved,
        "chunks": chunks,
    }
    out = mem_dir / "index.json"
    out.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    if resolved == "chromadb":
        rebuild_chroma_index(cwd)
    return out


def load_memory_index(cwd: Path) -> list[dict[str, str]]:
    index_path = memories_dir(cwd) / "index.json"
    if index_path.is_file():
        try:
            raw = json.loads(index_path.read_text(encoding="utf-8"))
            chunks = raw.get("chunks", [])
            if isinstance(chunks, list) and chunks:
                return [c for c in chunks if isinstance(c, dict) and c.get("text")]
        except (json.JSONDecodeError, OSError):
            pass
    return collect_memory_chunks(cwd)


def _match_tfidf(chunks: list[dict[str, str]], hint_text: str, max_results: int) -> list[dict[str, str]]:
    """TF-IDF コサイン類似度（フォールバック）"""
    if not chunks:
        return []
    query_tokens = tokenize(hint_text)
    if not query_tokens:
        return []
    q_vec = _tf(query_tokens)
    scored: list[tuple[float, dict[str, str]]] = []
    for ch in chunks:
        text = str(ch.get("text") or "")
        score = _cosine(q_vec, _tf(tokenize(text)))
        if score > 0.01:
            scored.append((score, ch))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:max_results]]


def match_memories(
    cwd: Path,
    hint_text: str,
    max_results: int = 3,
    backend: str | None = None,
) -> list[dict[str, str]]:
    """関連メモリ top-N（Chroma 優先、失敗時 TF-IDF）"""
    from memory_chroma import match_chroma, resolve_memory_backend

    resolved = resolve_memory_backend(backend)
    if resolved == "chromadb":
        hits = match_chroma(cwd, hint_text, max_results=max_results)
        if hits:
            return hits
    chunks = load_memory_index(cwd)
    return _match_tfidf(chunks, hint_text, max_results)


def build_memory_context(
    cwd: Path,
    hint_text: str,
    max_results: int = 3,
    backend: str | None = None,
) -> str:
    matches = match_memories(cwd, hint_text, max_results=max_results, backend=backend)
    if not matches:
        return ""
    parts = ["[Memory Bank — relevant memories]"]
    for m in matches:
        parts.append(f"--- {m.get('label') or m.get('id')} ({m.get('source')}) ---")
        parts.append(str(m.get("text") or "").strip())
    return "\n".join(parts)