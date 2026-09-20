#!/usr/bin/env python3
"""
Shared helpers for local-LLM GM bridges (Ollama, KoboldCPP).
Reads workspace context, calls an LLM, rolls {{DICE:...}} markers, writes game_state.json.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

# Saga 章 + TF-IDF Memory Bank（CHIM / Bannerlord 風）
from memory_common import build_memory_context, build_saga_context, rebuild_memory_index


DICE_PATTERN = re.compile(r"\{\{DICE:([^}]+)\}\}", re.IGNORECASE)


def add_player_action_args(parser: Any) -> None:
    """--action または --action-file（プライバシー推奨）"""
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--action", help="Player action text (avoid on shared hosts)")
    group.add_argument("--action-file", help="UTF-8 file containing player action")


def read_player_action(args: Any) -> str:
    if getattr(args, "action_file", None):
        text = Path(args.action_file).read_text(encoding="utf-8")
    else:
        text = args.action or ""
    text = text.strip()
    if not text:
        raise ValueError("Player action is empty")
    return text


def log_player_action_redacted(action: str, prefix: str = "") -> None:
    label = f"{prefix} " if prefix else ""
    print(f"{label}player action: [redacted, length={len(action)}]", flush=True)
JSON_FENCE_PATTERN = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)

_JSON_SCHEMA = """
JSON schema (Persist-Before-Narrate: output CHANGES only; LoreRelay applies patches):
{
  "entries": [{
    "id": "turn-N",
    "role": "gm",
    "sender": "Game Master",
    "content": "(full narrative after dice results are final)",
    "imagePrompt": "(optional English prompt for scene image)"
  }],
  "status": {
    "location": "...",
    "time": "...",
    "hp": { "current": 20, "max": 20 },
    "mp": { "current": 10, "max": 10 },
    "condition": ["..."],
    "inventory": ["..."],
    "skills": ["..."],
    "funds": "..."
  },
  "options": ["option1", "option2", "option3"],
  "theme": "fantasy",
  "bgm": "track_id",
  "mood": "tense",
  "sfx": "door_open",
  "profileUpdates": [
    { "characterId": "alice", "dynamicProfile": "Relationship changed... / Learned that..." }
  ],
  "gameOver": {
    "active": true,
    "message": "Ending narrative...",
    "victory": false
  }
}
theme: fantasy / cyberpunk / scifi / ff14 / postapoc / modern
When HP reaches 0 or story ends, set gameOver.active=true and options=[].
"""

SYSTEM_PROMPTS: dict[str, str] = {
    "ja": f"""あなたはテキストアドベンチャーのゲームマスター（GM）です。
プレイヤーの行動に対してリアルな描写・NPC反応・環境変化を返してください。

【乱数ルール】公平な乱数が必要な場面では {{DICE:1d20}} のようにマーカーを出力してください。

【出力形式】
1. 日本語のナラティブを書く
2. 最後に ```json ブロックを1つ付ける
3. NPCとプレイヤーの関係性が変わった場合や、NPCが重要な事実を知った場合は、profileUpdatesフィールドにその情報を出力して記憶を更新してください。
{_JSON_SCHEMA}
""",
    "en": f"""You are a text-adventure Game Master (GM).
Respond to player actions with vivid narrative, NPC reactions, and environmental changes.

[Dice] When fair randomness is needed, output markers like {{DICE:1d20}} — the system rolls real dice.

[Output]
1. Write narrative in English
2. End with one ```json block
3. If an NPC's relationship with the player changes or they learn important facts, output their updated status in the profileUpdates field.
{_JSON_SCHEMA}
""",
    "zh-CN": f"""你是文字冒险游戏的游戏主持人（GM）。
根据玩家行动写出生动的叙事、NPC 反应与环境变化。

【骰子】需要公平随机数时输出 {{DICE:1d20}} 等标记，系统会真实掷骰。

【输出】
1. 用简体中文写叙事
2. 最后附一个 ```json 代码块
3. 如果NPC与玩家的关系发生变化，或者NPC了解到重要事实，请在profileUpdates字段中输出其更新后的状态。
{_JSON_SCHEMA}
""",
    "zh-TW": f"""你是文字冒險遊戲的遊戲主持人（GM）。
根據玩家行動寫出生動的敘事、NPC 反應與環境變化。

【骰子】需要公平隨機數時輸出 {{DICE:1d20}} 等標記，系統會真實擲骰。

【輸出】
1. 用繁體中文寫敘事
2. 最後附一個 ```json 程式碼區塊
3. 如果NPC與玩家的關係發生變化，或者NPC瞭解到重要事實，請在profileUpdates字段中輸出其更新後的狀態。
{_JSON_SCHEMA}
""",
}

USER_PROMPT_TAIL: dict[str, tuple[str, str]] = {
    "ja": (
        "上記の行動に対して1ターン進め、game_state.json 用の JSON ブロックを出力してください。",
        "テキストアドベンチャーを開始または続行し、1ターン分のナラティブと JSON を出力してください。",
    ),
    "en": (
        "Advance one turn for the action above and output the JSON block for game_state.json.",
        "Start or continue the text adventure — output one turn of narrative and JSON.",
    ),
    "zh-CN": (
        "根据上述行动推进一个回合，并输出 game_state.json 用的 JSON 代码块。",
        "开始或继续文字冒险，输出一个回合的叙事与 JSON。",
    ),
    "zh-TW": (
        "根據上述行動推進一個回合，並輸出 game_state.json 用的 JSON 程式碼區塊。",
        "開始或繼續文字冒險，輸出一個回合的敘事與 JSON。",
    ),
}

DEFAULT_OPTIONS: dict[str, list[str]] = {
    "ja": ["周囲を調べる", "慎重に進む", "別の行動を試す"],
    "en": ["Search the area", "Proceed carefully", "Try something else"],
    "zh-CN": ["调查周围", "谨慎前进", "尝试其他行动"],
    "zh-TW": ["調查周圍", "謹慎前進", "嘗試其他行動"],
}


def normalize_locale(raw: str | None) -> str:
    v = (raw or "en").strip()
    if v in SYSTEM_PROMPTS:
        return v
    low = v.lower().replace("_", "-")
    if low == "zh-tw":
        return "zh-TW"
    if low == "zh-cn":
        return "zh-CN"
    return "en"


def load_game_rules(cwd: Path) -> dict[str, Any]:
    data = load_json_file(cwd / "game_rules.json")
    if isinstance(data, dict):
        return data
    return {
        "enableRpgMechanics": True,
        "defaultMaxHp": 100,
        "defaultMaxMp": 50,
        "diceDifficulty": "Normal",
    }


def game_rules_prompt_addon(cwd: Path) -> str:
    rules = load_game_rules(cwd)
    if not rules.get("enableRpgMechanics", True):
        return (
            "\n[Game Rules] RPG mechanics (HP/MP tracking) are DISABLED. "
            "Focus on narrative; omit numeric combat stats unless requested.\n"
        )
    hp = rules.get("defaultMaxHp", 100)
    mp = rules.get("defaultMaxMp", 50)
    diff = rules.get("diceDifficulty", "Normal")
    return (
        f"\n[Game Rules] RPG mechanics ENABLED. Default max HP={hp}, MP={mp}. "
        f"Dice difficulty tone: {diff}. Update status fields only when changed.\n"
    )


def get_system_prompt(locale: str | None = None, cwd: Path | None = None) -> str:
    base = SYSTEM_PROMPTS.get(normalize_locale(locale), SYSTEM_PROMPTS["en"])
    if cwd is not None:
        return base + game_rules_prompt_addon(cwd)
    return base


def resolve_skill_root() -> Path:
    here = Path(__file__).resolve().parent
    return here.parent


def resolve_dice_script() -> Path:
    return Path(__file__).resolve().parent / "dice.py"


def resolve_python() -> str:
    return os.environ.get("TA_GM_PYTHON", sys.executable)


def load_json_file(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def load_scenario(cwd: Path) -> dict | None:
    scenario = load_json_file(cwd / "scenario.json")
    return scenario if isinstance(scenario, dict) else None


def load_game_state(cwd: Path) -> dict | None:
    state = load_json_file(cwd / "game_state.json")
    return state if isinstance(state, dict) else None


def get_latest_image_path(cwd: Path) -> Path | None:
    """Extracts the absolute path to the latestImage from game_state.json, if it exists."""
    state = load_game_state(cwd)
    if not state:
        return None
    image_path = state.get("latestImage")
    if not image_path:
        return None
    p = Path(image_path)
    if not p.is_absolute():
        p = cwd / p
    if p.is_file():
        return p
    return None


def load_party_characters(cwd: Path) -> list[dict]:
    char_dir = cwd / "characters"
    if not char_dir.is_dir():
        return []
    
    party_ids = []
    party_json = char_dir / "party.json"
    if party_json.is_file():
        try:
            loaded = json.loads(party_json.read_text(encoding="utf-8"))
            if isinstance(loaded, list):
                party_ids.extend(loaded)
        except (json.JSONDecodeError, OSError):
            pass
            
    active_txt = char_dir / "active_character.txt"
    if active_txt.is_file():
        try:
            active_id = active_txt.read_text(encoding="utf-8").strip()
            if active_id and active_id not in party_ids:
                # Active character is treated as a party member for prompt inclusion
                party_ids.insert(0, active_id)
        except OSError:
            pass

    chars = []
    dyn_profiles = {}
    dyn_path = char_dir / "dynamic_profiles.json"
    if dyn_path.is_file():
        try:
            loaded_dyn = json.loads(dyn_path.read_text(encoding="utf-8"))
            if isinstance(loaded_dyn, dict):
                dyn_profiles = loaded_dyn
        except (json.JSONDecodeError, OSError):
            pass

    for pid in party_ids:
        char_file = char_dir / f"{pid}.json"
        c = load_json_file(char_file)
        if c:
            c["_id"] = pid
            if pid in dyn_profiles:
                c["dynamicProfile"] = dyn_profiles[pid]
            chars.append(c)
    return chars


def next_turn_id(cwd: Path) -> str:
    hist_path = cwd / "game_history.json"
    hist = load_json_file(hist_path)
    if isinstance(hist, list) and hist:
        return f"turn-{len(hist) + 1}"

    state = load_game_state(cwd)
    if state and isinstance(state.get("entries"), list) and state["entries"]:
        last_id = str(state["entries"][-1].get("id", "turn-0"))
        match = re.search(r"(\d+)$", last_id)
        n = int(match.group(1)) + 1 if match else 1
        return f"turn-{n}"
    return "turn-1"


def roll_dice(notation: str, dice_script: Path) -> str:
    py = resolve_python()
    proc = subprocess.run(
        [py, str(dice_script), notation.strip()],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "dice error").strip()
        raise RuntimeError(f"dice.py failed for {notation}: {err}")
    return proc.stdout.strip()


def substitute_dice_markers(text: str, dice_script: Path, max_rounds: int = 20) -> str:
    """Replace {{DICE:1d20}} markers with real rolls (re-scan after each replacement)."""
    for _ in range(max_rounds):
        match = DICE_PATTERN.search(text)
        if not match:
            break
        notation = match.group(1).strip()
        rolled = roll_dice(notation, dice_script)
        text = text[: match.start()] + rolled + text[match.end() :]
    return text


def extract_json_block(text: str) -> dict | None:
    fence = JSON_FENCE_PATTERN.search(text)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass

    # Fallback: last top-level JSON object in the response
    start = text.rfind("{")
    while start >= 0:
        depth = 0
        for i in range(start, len(text)):
            ch = text[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start : i + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break
        start = text.rfind("{", 0, start)
    return None


def strip_json_from_narrative(text: str) -> str:
    text = JSON_FENCE_PATTERN.sub("", text)
    # Remove trailing bare JSON object if present
    start = text.rfind("{")
    if start >= 0:
        maybe = text[start:]
        try:
            json.loads(maybe)
            text = text[:start]
        except json.JSONDecodeError:
            pass
    return text.strip()


def load_lorebook_entries(cwd: Path) -> list[dict]:
    for name in ("lorebook.json", "world_info.json"):
        p = cwd / name
        if not p.is_file():
            continue
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(raw.get("entries"), list):
                return [e for e in raw["entries"] if e.get("enabled", True)]
        except (json.JSONDecodeError, OSError):
            pass
    return []


MAX_REGEX_PATTERN_LEN = 200
MAX_REGEX_TEST_TEXT_LEN = 8000


def _is_quantifier_start(pattern: str, index: int) -> int:
    if index >= len(pattern):
        return 0
    ch = pattern[index]
    if ch in "*+?":
        return 1
    if ch == "{":
        close = pattern.find("}", index)
        if close > index:
            return close - index + 1
    return 0


def _scan_char_class(pattern: str, index: int) -> int:
    i = index + 1
    if i < len(pattern) and pattern[i] == "^":
        i += 1
    while i < len(pattern):
        if pattern[i] == "\\":
            i += 2
            continue
        if pattern[i] == "]":
            return i + 1
        i += 1
    return len(pattern)


def _find_group_end(pattern: str, open_index: int) -> int:
    depth = 1
    i = open_index + 1
    while i < len(pattern) and depth > 0:
        if pattern[i] == "\\":
            i += 2
            continue
        if pattern[i] == "[":
            i = _scan_char_class(pattern, i)
            continue
        if pattern[i] == "(":
            depth += 1
            i += 1
            continue
        if pattern[i] == ")":
            depth -= 1
            i += 1
            continue
        i += 1
    return i


def _group_body_flags(pattern: str, start: int, end: int) -> tuple[bool, bool]:
    has_quantifier = False
    has_alternation = False
    i = start
    while i < end:
        if pattern[i] == "\\":
            i += 2
            q = _is_quantifier_start(pattern, i)
            if q > 0:
                has_quantifier = True
                i += q
            continue
        if pattern[i] == "|":
            has_alternation = True
            i += 1
            continue
        if pattern[i] == "[":
            i = _scan_char_class(pattern, i)
            q = _is_quantifier_start(pattern, i)
            if q > 0:
                has_quantifier = True
                i += q
            continue
        if pattern[i] == "(":
            close = _find_group_end(pattern, i)
            inner_q, inner_alt = _group_body_flags(pattern, i + 1, close - 1)
            has_quantifier = has_quantifier or inner_q
            has_alternation = has_alternation or inner_alt
            i = close
            q = _is_quantifier_start(pattern, i)
            if q > 0:
                has_quantifier = True
                i += q
            continue
        i += 1
        q = _is_quantifier_start(pattern, i)
        if q > 0:
            has_quantifier = True
            i += q
    return has_quantifier, has_alternation


def _group_body_start(pattern: str, open_index: int) -> int:
    start = open_index + 1
    if start < len(pattern) and pattern[start] == "?" and start + 1 < len(pattern):
        spec = pattern[start + 1]
        if spec == ":":
            return start + 2
        if spec in "=!":
            return start + 2
        if spec == "<" and start + 2 < len(pattern):
            nxt = pattern[start + 2]
            if nxt in "=!":
                return start + 3
    return start


def is_potentially_evil_regex(pattern: str) -> bool:
    """Escape-aware ReDoS guard aligned with lorebookMatcher.ts."""
    if re.search(r"[+*?]\s*[+*?{]", pattern):
        return True
    if re.search(r"(?:\.\s*[+*?]|\.\s*\{[^}]+\}){3,}", pattern):
        return True

    i = 0
    while i < len(pattern):
        if pattern[i] == "\\":
            i += 2
            continue
        if pattern[i] == "[":
            i = _scan_char_class(pattern, i)
            q = _is_quantifier_start(pattern, i)
            if q > 0:
                i += q
            continue
        if pattern[i] == "(":
            body_start = _group_body_start(pattern, i)
            close = _find_group_end(pattern, i)
            inner_q, inner_alt = _group_body_flags(pattern, body_start, close - 1)
            if inner_q or inner_alt:
                j = close
                while j < len(pattern) and pattern[j].isspace():
                    j += 1
                if _is_quantifier_start(pattern, j) > 0:
                    return True
            i = close
            q = _is_quantifier_start(pattern, i)
            if q > 0:
                i += q
            continue
        if pattern[i] == ".":
            i += 1
            q = _is_quantifier_start(pattern, i)
            if q > 0:
                i += q
            continue
        i += 1
        q = _is_quantifier_start(pattern, i)
        if q > 0:
            i += q
    return False


def _match_lore_key(key: str, text: str, text_lower: str, use_regex: bool) -> bool:
    k = str(key).strip()
    if not k:
        return False
    if use_regex:
        if len(k) > MAX_REGEX_PATTERN_LEN:
            return k.lower() in text_lower
        try:
            m = re.match(r"^/(.+)/([gimsuy]*)$", k, re.DOTALL)
            pattern_body = m.group(1) if m else k
            if is_potentially_evil_regex(pattern_body):
                return k.lower() in text_lower
            scan_text = text[:MAX_REGEX_TEST_TEXT_LEN] if len(text) > MAX_REGEX_TEST_TEXT_LEN else text
            if m:
                pattern, flags = m.group(1), m.group(2) or "i"
                flag_val = re.IGNORECASE if "i" in flags else 0
                return re.search(pattern, scan_text, flags=flag_val) is not None
            return re.search(k, scan_text, re.IGNORECASE) is not None
        except re.error:
            return k.lower() in text_lower
    return k.lower() in text_lower


def match_lorebook(entries: list[dict], text: str, max_entries: int = 5) -> list[dict]:
    """ST-compatible lorebook matching (regex keys, secondary_keys AND, insertion_order sort)."""
    text_lower = text.lower()
    hits: list[tuple[int, dict]] = []
    for entry in entries:
        use_regex = entry.get("use_regex") is True
        keys = entry.get("keys") or []
        if isinstance(keys, str):
            keys = [keys]
        primary_hit = any(
            _match_lore_key(str(k), text, text_lower, use_regex)
            for k in keys
            if str(k).strip()
        )
        if not primary_hit:
            continue
        secondary = entry.get("secondary_keys") or []
        if isinstance(secondary, str):
            secondary = [secondary]
        if secondary:
            secondary_hit = any(
                _match_lore_key(str(k), text, text_lower, use_regex)
                for k in secondary
                if str(k).strip()
            )
            if not secondary_hit:
                continue
        sort_key = int(entry.get("insertion_order") if entry.get("insertion_order") is not None else entry.get("priority") or 0)
        hits.append((sort_key, entry))
    hits.sort(key=lambda x: -x[0])
    return [e for _, e in hits[:max_entries]]


def build_character_context(cwd: Path) -> str:
    chars = load_party_characters(cwd)
    if not chars:
        return ""
    lines = ["[Party Members / Active Characters]"]
    for char in chars:
        lines.append(f"--- {char.get('name', 'Unknown')} ---")
        lines.append(f"Description: {char.get('description', '')}")
        lines.append(f"Personality: {char.get('personality', '')}")
        if char.get("dynamicProfile"):
            lines.append(f"Dynamic memory: {char['dynamicProfile']}")
        st = char.get("stSource") or {}
        if st.get("first_mes"):
            lines.append(f"Opening line hint: {st['first_mes']}")
    lines.append("Instruction: Have these characters react, converse with each other, and respond to the player's actions in character.")
    return "\n".join(lines)


def build_lorebook_context(cwd: Path, hint_text: str) -> str:
    matches = match_lorebook(load_lorebook_entries(cwd), hint_text)
    if not matches:
        return ""
    parts = ["[Lorebook — matched entries]"]
    for e in matches:
        parts.append(f"--- {e.get('comment') or e.get('id') or 'entry'} ---")
        parts.append(str(e.get("content") or "").strip())
    return "\n".join(parts)


def build_user_prompt(
    cwd: Path, player_action: str, is_continuation: bool, locale: str | None = None
) -> str:
    parts: list[str] = []
    scenario = load_scenario(cwd)
    if scenario:
        setup = scenario.get("setup", {})
        parts.append("【読み込み済みシナリオ】")
        for key in ("world", "protagonist", "tone", "rules"):
            if setup.get(key):
                parts.append(f"- {key}: {setup[key]}")

    state = load_game_state(cwd)
    current_theme = state.get("theme", "fantasy") if state else "fantasy"

    if state:
        parts.append("\n【前ターンの game_state.json（参考）】")
        parts.append(json.dumps(state, ensure_ascii=False, indent=2))
        if state.get("summary"):
            parts.append(f"\n【これまでのあらすじ】\n{state['summary']}")

    chars = load_party_characters(cwd)
    if chars:
        parts.append("\n【現在の同行メンバー / パーティー】")
        for char in chars:
            parts.append(f"- 名前: {char.get('name', 'Unknown')} (ID: {char.get('_id', 'unknown')})")
            parts.append(f"  設定: {char.get('description', '')}")
            parts.append(f"  性格: {char.get('personality', '')}")
            if char.get('dynamicProfile'):
                parts.append(f"  現在の関係性・記憶 (Dynamic Profile): {char['dynamicProfile']}")
        parts.append(f"※指示: 現在の世界観（テーマ: {current_theme}）に合わせて、彼らの服装や装備を適応させてください。また、プレイヤーの行動に対して彼ら同士が掛け合いや会話をする様子も描写に含めてください。")

    turn_id = next_turn_id(cwd)
    parts.append(f"\n【今ターンの entries[0].id】 {turn_id}")
    parts.append(f"\n【プレイヤーの行動】\n{player_action}")

    state = load_game_state(cwd)
    recent = ""
    if state and isinstance(state.get("entries"), list):
        non_excluded = [e for e in state["entries"] if isinstance(e, dict) and not e.get("excludedFromPrompt", False)]
        recent = "\n".join(
            str(e.get("content", ""))
            for e in non_excluded[-3:]
        )
    hint = f"{recent}\n{player_action}"
    saga_ctx = build_saga_context(cwd, max_chapters=2)
    if saga_ctx:
        parts.append(f"\n{saga_ctx}")
    memory_ctx = build_memory_context(cwd, hint, max_results=3)
    if memory_ctx:
        parts.append(f"\n{memory_ctx}")
    lore_ctx = build_lorebook_context(cwd, hint)
    if lore_ctx:
        parts.append(f"\n{lore_ctx}")

    loc = normalize_locale(locale)
    cont_tail, start_tail = USER_PROMPT_TAIL.get(loc, USER_PROMPT_TAIL["en"])
    parts.append(f"\n{cont_tail if is_continuation else start_tail}")
    return "\n".join(parts)


def merge_game_state(
    cwd: Path,
    llm_json: dict | None,
    narrative: str,
    turn_id: str,
    locale: str | None = None,
) -> dict:
    prev = load_game_state(cwd) or {}
    merged: dict[str, Any] = {}

    if llm_json:
        merged.update({k: v for k, v in llm_json.items() if k != "entries"})

    # Carry forward status fields the model omitted
    if "status" not in merged and prev.get("status"):
        merged["status"] = prev["status"]
    elif isinstance(merged.get("status"), dict) and isinstance(prev.get("status"), dict):
        for key, val in prev["status"].items():
            merged["status"].setdefault(key, val)

    for key in ("theme", "bgm", "mood", "sfx", "latestImage"):
        if key not in merged and key in prev:
            merged[key] = prev[key]

    content = narrative
    if llm_json and llm_json.get("entries"):
        entry0 = llm_json["entries"][0]
        if isinstance(entry0, dict) and entry0.get("content"):
            content = str(entry0["content"])

    entry: dict[str, Any] = {
        "id": turn_id,
        "role": "gm",
        "sender": "Game Master",
        "content": content,
    }
    if llm_json and llm_json.get("entries"):
        e0 = llm_json["entries"][0]
        if isinstance(e0, dict):
            if e0.get("image"):
                entry["image"] = e0["image"]
            if e0.get("imagePrompt"):
                entry["imagePrompt"] = e0["imagePrompt"]

    merged["entries"] = [entry]

    if "options" not in merged or not merged["options"]:
        loc = normalize_locale(locale)
        merged["options"] = prev.get("options") or DEFAULT_OPTIONS.get(loc, DEFAULT_OPTIONS["en"])

    return merged


def write_game_state(cwd: Path, state: dict) -> Path:
    out = cwd / "game_state.json"
    out.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


PATCHABLE_STATE_KEYS = (
    "status",
    "options",
    "theme",
    "bgm",
    "mood",
    "sfx",
    "latestImage",
    "background",
    "sprite",
    "hiddenDice",
    "gameOver",
    "summary",
    "diceRequest",
)


def load_dice_ledger(cwd: Path) -> list[dict]:
    data = load_json_file(cwd / "dice_ledger.json")
    return data if isinstance(data, list) else []


def build_state_patch(prev: dict, merged: dict) -> list[dict]:
    """Diff prev vs merged (excluding entries) into JSON Patch ops for the extension."""
    patches: list[dict] = []
    for key in PATCHABLE_STATE_KEYS:
        if key not in merged:
            continue
        new_val = merged[key]
        old_val = prev.get(key)
        if new_val == old_val:
            continue
        op = "add" if key not in prev else "replace"
        patches.append({"op": op, "path": f"/{key}", "value": new_val})
    return patches


def write_turn_result(cwd: Path, turn_result: dict) -> Path:
    out = cwd / "turn_result.json"
    tmp = cwd / "turn_result.json.tmp"
    payload = json.dumps(turn_result, ensure_ascii=False, indent=2)
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(out)
    return out


def process_profile_updates(cwd: Path, updates: list[dict]):
    char_dir = cwd / "characters"
    if not char_dir.is_dir():
        char_dir.mkdir(parents=True, exist_ok=True)
    
    dyn_path = char_dir / "dynamic_profiles.json"
    dyn_profiles = {}
    if dyn_path.is_file():
        try:
            dyn_profiles = json.loads(dyn_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    updated = False
    for up in updates:
        cid = up.get("characterId")
        prof = up.get("dynamicProfile")
        if cid and prof:
            dyn_profiles[cid] = prof
            updated = True
    
    if updated:
        dyn_path.write_text(json.dumps(dyn_profiles, ensure_ascii=False, indent=2), encoding="utf-8")
        rebuild_memory_index(cwd)
        print(f"[Dynamic Profiles] Updated memory for {len(updates)} characters.")


def process_llm_response(cwd: Path, raw_text: str, locale: str | None = None) -> dict:
    dice_script = resolve_dice_script()
    text_with_dice = substitute_dice_markers(raw_text, dice_script)
    llm_json = extract_json_block(text_with_dice)
    narrative = strip_json_from_narrative(text_with_dice)
    
    if llm_json:
        if llm_json.get("entries"):
            # Re-run dice substitution on JSON content field too
            for entry in llm_json.get("entries", []):
                if isinstance(entry, dict) and entry.get("content"):
                    entry["content"] = substitute_dice_markers(str(entry["content"]), dice_script)
            narrative = llm_json["entries"][0].get("content", narrative)
            
        if llm_json.get("profileUpdates") and isinstance(llm_json["profileUpdates"], list):
            process_profile_updates(cwd, llm_json["profileUpdates"])
            # Remove profileUpdates from state so it's not permanently retained
            del llm_json["profileUpdates"]

    turn_id = next_turn_id(cwd)
    prev = load_game_state(cwd) or {}
    merged = merge_game_state(cwd, llm_json, narrative, turn_id, locale=locale)

    content = narrative
    if llm_json and llm_json.get("entries"):
        entry0 = llm_json["entries"][0]
        if isinstance(entry0, dict) and entry0.get("content"):
            content = str(entry0["content"])

    state_patch = build_state_patch(prev, merged)

    gm_entry: dict[str, Any] = {}
    if llm_json and llm_json.get("entries"):
        e0 = llm_json["entries"][0]
        if isinstance(e0, dict):
            if e0.get("imagePrompt"):
                gm_entry["imagePrompt"] = str(e0["imagePrompt"])[:2000]
            if e0.get("image"):
                gm_entry["image"] = str(e0["image"])

    media: dict[str, Any] = {}
    for key in ("bgm", "mood", "sfx"):
        if merged.get(key):
            media[key] = merged[key]
    if gm_entry.get("imagePrompt"):
        media["imagePrompt"] = gm_entry["imagePrompt"]

    turn_result: dict[str, Any] = {
        "turnId": turn_id,
        "narration": content,
        "statePatch": state_patch,
        "diceLedger": load_dice_ledger(cwd),
    }
    if gm_entry:
        turn_result["gmEntry"] = gm_entry
    if media:
        turn_result["media"] = media

    lore_hits = match_lorebook(load_lorebook_entries(cwd), content)
    if lore_hits:
        turn_result["triggeredLore"] = [
            str(e.get("comment") or e.get("id") or "entry") for e in lore_hits
        ]

    write_turn_result(cwd, turn_result)

    legacy = os.environ.get("TA_LEGACY_WRITE_GAME_STATE", "").strip().lower()
    if legacy in ("1", "true", "yes"):
        write_game_state(cwd, merged)

    return merged