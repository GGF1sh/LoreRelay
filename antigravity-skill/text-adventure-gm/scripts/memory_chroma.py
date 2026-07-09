"""
オプション ChromaDB バックエンド（embedding 検索）。
pip install chromadb が無い場合は TF-IDF にフォールバックする。

保存先: memories/chroma_db/
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any




def chroma_available() -> bool:
    try:
        import chromadb  # noqa: F401
        return True
    except ImportError:
        return False


def resolve_memory_backend(requested: str | None = None) -> str:
    """
    tfidf | chromadb | auto
    auto = chromadb が import できれば chromadb、でなければ tfidf
    """
    raw = (requested or os.environ.get("TA_MEMORY_BACKEND") or "auto").strip().lower()
    if raw == "chromadb":
        return "chromadb" if chroma_available() else "tfidf"
    if raw == "auto":
        return "chromadb" if chroma_available() else "tfidf"
    return "tfidf"


def chroma_store_path(cwd: Path) -> Path:
    return cwd / "memories" / "chroma_db"


def rebuild_chroma_index(cwd: Path) -> bool:
    """ChromaDB コレクションを全チャンクで再構築"""
    if not chroma_available():
        print("[Memory] chromadb not installed — skipping Chroma rebuild.", flush=True)
        return False

    import chromadb
    from memory_common import collect_memory_chunks

    chunks = collect_memory_chunks(cwd)
    store = chroma_store_path(cwd)
    store.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(store))

    try:
        client.delete_collection("text_adventure_memory")
    except Exception:
        pass

    collection = client.get_or_create_collection(
        name="text_adventure_memory",
        metadata={"hnsw:space": "cosine"},
    )

    if not chunks:
        print("[Memory] Chroma index empty (no chunks).", flush=True)
        return True

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, str]] = []
    for i, ch in enumerate(chunks):
        cid = str(ch.get("id") or f"chunk-{i}")
        if cid in ids:
            cid = f"{cid}-{i}"
        ids.append(cid)
        documents.append(str(ch.get("text") or ""))
        metadatas.append({
            "source": str(ch.get("source") or ""),
            "label": str(ch.get("label") or cid),
        })

    batch = 100
    for start in range(0, len(ids), batch):
        end = start + batch
        collection.add(
            ids=ids[start:end],
            documents=documents[start:end],
            metadatas=metadatas[start:end],
        )

    print(f"[Memory] Chroma index rebuilt ({len(ids)} chunks).", flush=True)
    return True


def match_chroma(cwd: Path, hint_text: str, max_results: int = 3) -> list[dict[str, str]]:
    """embedding 類似度で top-N を返す（Chroma 未導入時は空リスト）"""
    if not chroma_available() or not hint_text.strip():
        return []

    import chromadb

    store = chroma_store_path(cwd)
    if not store.is_dir():
        return []

    client = chromadb.PersistentClient(path=str(store))
    try:
        collection = client.get_collection("text_adventure_memory")
    except Exception:
        return []

    if collection.count() == 0:
        return []

    res = collection.query(
        query_texts=[hint_text],
        n_results=min(max_results, collection.count()),
    )

    out: list[dict[str, str]] = []
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    ids = (res.get("ids") or [[]])[0]
    for i, doc in enumerate(docs):
        if not doc:
            continue
        meta: dict[str, Any] = metas[i] if i < len(metas) else {}
        out.append({
            "id": ids[i] if i < len(ids) else f"chroma-{i}",
            "source": str(meta.get("source") or "chroma"),
            "label": str(meta.get("label") or "memory"),
            "text": str(doc),
        })
    return out