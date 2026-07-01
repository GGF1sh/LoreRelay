# AI Handover Document (LoreRelay)

他の AI（Claude, ChatGPT, Grok, Gemini, Antigravity など）にこのプロジェクトを引き継ぐための共通ドキュメントです。新しい AI に作業させる場合は、以下を順に読み込ませてください。

1. 本ファイル（`AI_HANDOVER.md`）— プロジェクト概要
2. **`AI_HANDOVER_PROMPTS.md`** — どの AI に何を読ませ、どのプロンプトを渡すか
3. `AI_COLLABORATION.md` — 複数 AI で作業するときの書き込みルール
4. `AI_SHARED_LOG.md` — 先頭の **Current Snapshot** と直近ログ
5. `CHANGELOG.md` — 実装済み変更の履歴
6. `AI_ROADMAP.md` — フェーズ完了状況と次タスクの黒板
7. （必要に応じて）`C:\AI\GROK_CODE_REVIEW.md` / `GEMINI_REVIEW.md` / `CLAUDE_REVIEW.md`

> [!IMPORTANT]
> **実装の正本は `CHANGELOG.md` とソースコードです。**
> レビュー文書は議論の記録を含むため、古い「未対応」記述が残る場合があります。作業開始前に `AI_SHARED_LOG.md` の **Current Snapshot** と `CHANGELOG.md` の最新セクション（現在 **v1.10.0**）を確認してください。作業の切り出しは **`AI_HANDOVER_PROMPTS.md`** を参照。

---

## 1. プロジェクトの目的

ローカルファーストの **AI ゲームマスター（GM）UI**。LLM を GM として使い、リッチな Webview でテキストアドベンチャー / TRPG 風の体験を提供する VSCode 拡張（LoreRelay）です。

- **Hacker Edition:** ユーザー環境を自由に組み合わせる（Grok / Ollama / 手動コピペ / Antigravity など）
- **追加 API コスト不要（デフォルト）:** 既存サブスクやローカル LLM をそのまま GM に利用可能
- **リポジトリ:** https://github.com/GGF1sh/LoreRelay

---

## 2. 全体アーキテクチャ

### A. GM スキル（AI 側の指示書）

- **場所:** `C:\AI\TextAdventureGMSkill\`（`SKILL.md`, `scripts/`）
- **役割:** GM としての振る舞い、ダイス、画像生成、**毎ターンの状態出力**
- **正規出力:** `turn_result.json`（Persist-Before-Narrate）→ 拡張が `statePatch` を適用して `game_state.json` にマージ
- **フォールバック:** `game_state.json` 直書き（手動コピペ・レガシー GM）— `turnResultFallback` が合成

### B. VSCode 拡張（表示用 UI）

- **場所:** `C:\AI\text-adventure-vsce\`
- **役割:** `turn_result.json` / `game_state.json` を監視し Webview を更新
- **主要サブシステム（v1.10.0 時点）:**
  - GM Bridge（Grok / vscode-lm / Ollama / KoboldCPP / OpenRouter / clipboard / command）
  - Agentic GM（State Referee → Narrator、optional）
  - Quest Board（Event-to-Quest）
  - Git Timeline（ターン分岐）
  - Turn Inspector / state journal
  - World Forge + Emergent Simulation + Event Log
  - Visual Memory / Soulgaze（VLM）
  - Cartography（Mermaid / Parchment / ComfyUI / ピン）
  - Remote Play（HMAC 署名メディア URL）
  - SillyTavern 互換インポート、シナリオパック

詳細: [`docs/WORLD_AND_VISUAL_MEMORY.md`](docs/WORLD_AND_VISUAL_MEMORY.md) · [`README.md`](README.md)

**Webview タブ不具合の教訓（2026-06）:** 右タブが真っ黒になる症状は HTML の閉じタグ欠落で pane がネストされるケースがある。`index.html` 編集後は `npm test`（`validate_webview_html_structure.js`）と、必要なら Webview DevTools で親チェーンを確認。詳細は [`docs/WEBVIEW_TAB_DOM_POSTMORTEM.md`](docs/WEBVIEW_TAB_DOM_POSTMORTEM.md)。

---

## 3. データフロー（Persist-Before-Narrate）

```
[User] Webview で行動入力
    ↓
[GM] 推論 · dice.py · comfyui_generate.py（任意）
    ↓
[GM] turn_result.json を書き込み（statePatch + narration + gmEntry）
    ↓
[Extension] 検証 · game_state.json へマージ · state_journal.ndjson 追記
    ↓
[Webview] 自動更新（Inspector / World / Gallery など）
```

**ワークスペースの主要ファイル**

| ファイル | 役割 |
|---------|------|
| `turn_result.json` | 毎ターンの GM 出力（正規） |
| `game_state.json` | UI が描画する統合状態 |
| `world_forge.json` / `world_state.json` | 静的設計 / 動的シミュレーション |
| `visual_memory.json` | VLM 情景記憶 |
| `world_map.png` / `world_map.layout.png` | Cartography（任意） |

### Grok Build 連携（推奨構成）

```
[Webview] 選択肢 / 自由入力
    → postMessage → extension.ts
    → grok -p "..." --cwd <workspace> --yolo [--continue]
    → turn_result.json / game_state.json
    → FileSystemWatcher → Webview 更新
```

設定: `textAdventure.grokBridge.*` · 詳細 [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md)

---

## 4. AI への指示

- **作業ルール:** `AI_COLLABORATION.md` を読み、作業後に `AI_SHARED_LOG.md` へ追記
- **最新状態:** `CHANGELOG.md` 最新セクション + `package.json` の version
- **テスト:** `npm run compile && npm test`（Cartography / Remote Play / World 含む 30+ スクリプト）
- **乱数:** AI は推論で乱数を作らず `dice.py` を実行
- **GM ルール変更:** `TextAdventureGMSkill/SKILL.md`
- **UI 変更:** `webview/`（ビルドは `npm run build:webview`）
- **レビュー文書:** 未対応項目は `GROK_CODE_REVIEW.md` 等のサマリーを確認（古い記述は CHANGELOG で上書き判断）

### 4.0 Private Scenario Vault

Private/local scenario vaults are intentionally outside the public repository scope. Do not read, edit, summarize, index, or mention private scenario contents in shared docs unless the user explicitly asks for that local-only work.

### 4.1 現在の主な残件（2026-07-01 / v1.10.0）

| 優先度 | 内容 |
|--------|------|
| 手動確認 | [`testing_checklist.md`](testing_checklist.md) — Agentic GM E2E、Git Timeline 分岐→復元 |
| 公開・見せ方 | README の **実スクショ / GIF**（現状は `docs/assets/*.svg` モック） |
| UX polish（任意） | Start Hub から Quest/World まで通るデモシナリオ、地図 stale 表示 |
| 次機能候補 | **Phase 11** Adaptive TTS（設計: `PHASE11_ADAPTIVE_TTS_DESIGN.md`、Claude→Grok）、イベント由来クエスト報酬 |
| 将来 | Workshop / マーケット公開の検討 |

**完了済み（参照用）:** Phase 1〜10（`AI_ROADMAP.md`）、Campaign Engine v1.10.0（Quest Board / Agentic GM / Git Timeline）、Cartography v1.7.x、Audit Wave

---

## 5. フォルダ構成

```
C:\AI\
├── text-adventure-vsce\     # LoreRelay VSCode 拡張
│   ├── src/                 # TypeScript（extension, world, cartography, remote play…）
│   ├── webview/             # UI（modules/ + styles/ → build-webview.js）
│   ├── scripts/             # Python CLI, npm test スクリプト
│   ├── sample-scenarios/    # lost-catacombs, neon-rain, harbor-mist
│   └── docs/                # アーキテクチャ・Cartography 契約
└── TextAdventureGMSkill\    # GM スキル（SKILL.md, scenarios/, scripts/）
```

---

## 6. 競合ポジショニング（Saga & Seeker との比較）

類似: **[Saga & Seeker](https://store.steampowered.com/app/3522640/Saga__Seeker/)**（スタンドアロン CRPG）

**LoreRelay（Hacker Edition）の差別化:**

- 追加費用 $0（既存 AI サブスク / ローカル LLM）
- GM・画像・ルールを自分でハック可能（OSS）
- ComfyUI + World System + Cartography + ST 互換

詳細: `C:\AI\CLAUDE_REVIEW.md`