# Parlor Mode — 体験プロファイル設計（SillyTavern 的シンプルチャット ⟷ フル CRPG）

Date: 2026-07-03 JST  
Status: **設計ドラフト（実装前）**  
Primary implementer: **Grok**（Claude 5h 制限中のため）  
Review / 設計補強: **ChatGPT**（セキュリティ・プロンプト契約）· **Gemini**（UX・README・オンボーディング）

> **一行:** LoreRelay を「別アプリ」に分けず、同一拡張内の **体験プロファイル** として **Parlor（1対1 RP）** と **Campaign（現行 CRPG）** を切り替え、**1クリック昇格/降格**で ST ユーザーとパワーユーザーの両方に入口を与える。

---

## 1. 背景と課題

### 1.1 現状

LoreRelay v1.33.0 は以下を統合している。

- SillyTavern 互換（キャラカード・ロアブック取り込み）
- Persist-Before-Narrate（`turn_result.json` → `game_state.json`）
- Living World / Commerce / Cartography / Agentic GM 等の CRPG レイヤー

`game_rules.json` の **既定値は LW 系 OFF** だが、Webview は CRPG 前提（World / Inspector / ステータス等）のまま。GM 契約も常に `turn_result` / `game_state` を想定する。

### 1.2 ユーザーの声（要約）

> 「複雑を極めた先から、あえてバッサリ切った超シンプル版も欲しい」  
> 「Gemini / ChatGPT / Grok の月額課金 AI で、SillyTavern みたいに 1対1 チャットしたい」  
> 「シンプル ⟷ フル機能を 1クリックで行き来できると便利」

### 1.3 設計方針（本プロジェクト踏襲）

1. **LLM は narration 専任**（Parlor では数値 state を持たない）
2. **新規ロジックは `*Core.ts`（純関数）** + JSON 契約
3. **既定は安全側** — Parlor は最小権限・最小ファイル
4. **別リポジトリにしない** — 移行の価値が本体

---

## 2. ゴール / Non-Goals

### 2.1 ゴール

| # | ゴール |
|---|--------|
| G1 | **Parlor モード**: JSON 契約なしのプレーンチャット（キャラカード + ロアブック + 履歴） |
| G2 | **月額 AI 優先**: `vscode-lm` を第一候補（API キー不要）。clipboard をフォールバック |
| G3 | **UI 簡素化**: CRPG タブ・パネルをプロファイルで非表示 |
| G4 | **1クリック移行**: Parlor → Campaign 昇格、Campaign → Parlor 降格 |
| G5 | **ST 資産再利用**: 既存インポート（キャラ / ロア）をそのまま使う |

### 2.2 Non-Goals（Phase A–C）

- SillyTavern の全 Connection API の再実装（OpenAI 互換プロキシ等）
- 右チャット欄（Copilot / Gemini 拡張 UI）との完全同期表示
- Parlor での Living World tick / Commerce / ダイス台帳
- 音声クローン / ST Voice Preset の完全移植
- 別 VSIX パッケージの配布

---

## 3. 用語

| 用語 | 意味 |
|------|------|
| **Parlor** | 酒場で NPC と話すイメージの **1対1 RP モード**（ST 的） |
| **Campaign** | 現行の **フル CRPG / GM コンソール** モード |
| **Experience Profile** | `parlor` \| `campaign` の実行時モード（UI・GM 契約・シミュの切替） |
| **Connection Profile** | GM バックエンドの名前付きプリセット（provider + model + 温度等） |

---

## 4. 既存資産の再利用マップ

| 既存 | Parlor での扱い |
|------|-----------------|
| `characters/<id>.json`（ST インポート可） | **主役**。system プロンプトの核 |
| `lorebook.json` | キーワード注入（既存 `lorebookMatcher.ts`） |
| `game_history.json` | Campaign 用。Parlor は別ファイル（後述） |
| `game_rules.json` | Campaign のみ。Parlor では読まない / 無視 |
| `game_state.json` / `turn_result.json` | Campaign のみ |
| `gmBridgeRunner.ts` + `vscode-lm` | Parlor の **主バックエンド** |
| clipboard provider | Antigravity Gemini 等の **手動フォールバック** |
| `memoryBank.ts` | Parlor 簡易版（直近 N ターン + 任意ピン） |
| Start Hub | **🎭 キャラと話す（Parlor）** ボタン追加 |
| `SILLYTAVERN_COMPAT.md` | 入口ドキュメントとして Parlor を追記 |

---

## 5. アーキテクチャ

### 5.1 全体図

```
┌──────────────────────────────────────────────────────────────┐
│                    LoreRelay Extension Host                   │
│  experienceProfile: 'parlor' | 'campaign'                     │
├────────────────────────────┬─────────────────────────────────┤
│         Parlor             │           Campaign               │
│  parlor_session.json       │  turn_result.json               │
│  plain chat messages       │  game_state.json                │
│  no statePatch             │  livingWorldTurnOps             │
│  parlorPromptBuilderCore   │  gmPromptBuilder                │
├────────────────────────────┴─────────────────────────────────┤
│  GM Bridge: vscode-lm | clipboard | grok | ollama | ...      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  Webview — tab/panel visibility filtered by profile           │
│  Parlor: Chat + Portrait + Background + Input                 │
│  Campaign: 現行フル UI                                        │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 プロファイルの保存先

**推奨:** ワークスペース直下 `experience.json`（軽量・Git 管理しやすい）

```json
{
  "profile": "parlor",
  "connectionProfileId": "vscode-lm-claude",
  "activeCharacterId": "elda",
  "parlor": {
    "maxHistoryMessages": 40,
    "lorebookEnabled": true,
    "memoryPins": []
  },
  "campaign": {
    "frozenAt": null
  }
}
```

**代替（Phase A のみ）:** `textAdventure.experience.profile` を VS Code settings に置き、後で `experience.json` に昇格。

### 5.3 Parlor セッション契約 — `parlor_session.json`

Campaign の `game_history.json` / `turn_result` と **分離**（混在させない）。

```ts
// src/parlorSessionCore.ts（新規・純関数）

export type ParlorRole = 'user' | 'assistant' | 'system';

export interface ParlorMessage {
  id: string;           // uuid or turn counter
  role: ParlorRole;
  content: string;      // max 32_000 chars per message
  characterId?: string; // assistant 発話の話者（1対1 だが将来グループ用）
  createdAt: string;    // ISO8601
  provider?: string;    // 'vscode-lm' | 'clipboard' | ...
  model?: string;
}

export interface ParlorSession {
  version: 1;
  activeCharacterId: string;
  messages: ParlorMessage[];
  summary?: string;     // 任意・将来の長期圧縮（Phase C）
  updatedAt: string;
}
```

**上限（決定論クランプ）:**

| フィールド | 上限 |
|-----------|------|
| `messages.length` | 500（超過時は先頭をアーカイブ `parlor_archive.ndjson` へ） |
| `content` / message | 32_000 文字 |
| `summary` | 4_000 文字 |

### 5.4 Connection Profile — `connection_profiles.json`（任意・Phase B）

```json
{
  "profiles": [
    {
      "id": "vscode-lm-default",
      "label": "VS Code LM（自動）",
      "provider": "vscode-lm",
      "vscodeLm": { "vendor": "", "family": "", "model": "" }
    },
    {
      "id": "clipboard-gemini",
      "label": "Antigravity Gemini（貼り付け）",
      "provider": "clipboard"
    },
    {
      "id": "grok-build",
      "label": "Grok Build",
      "provider": "grok"
    }
  ],
  "activeId": "vscode-lm-default"
}
```

`GM_BRIDGE_PRESETS.md` の「Connection Profile 計画中」を Parlor 向けに具体化する。

---

## 6. GM 契約の差分

### 6.1 Campaign（現行・変更なし）

```
Player action → GM Bridge → turn_result.json → statePatch → game_state.json → Webview
```

### 6.2 Parlor（新規）

```
User message → parlorPromptBuilder → GM Bridge → plain text reply
              → append parlor_session.json → Webview chat log
```

**プロンプト構成（`parlorPromptBuilderCore.ts`）:**

1. Character card フィールド（name, description, personality, scenario, mes_example）
2. 任意: プレイヤー persona（`persona.json` — Phase B）
3. Lorebook キーワードヒット（既存 matcher、予算 2_000 chars）
4. 直近 N メッセージ（token 予算: `textAdventure.parlor.maxPromptChars` 既定 12_000）
5. **明示禁止**: JSON 出力要求、statePatch、ダイスマクロ（Phase A は `{{DICE}}` も無効）

**`vscode-lm` 応答処理:**

- Campaign: `extractVscodeLmJsonBlock()` → `game_state` マージ
- Parlor: **JSON ブロックがあっても無視**（または ``` で囲まれた部分を strip して本文のみ表示）
- ストリームは Campaign と同様 Webview へ中継可

### 6.3 Parlor 専用 SKILL（Phase B）

`TextAdventureGMSkill/PARLOR_SKILL.md` を新設。clipboard / Codex ユーザー向け。

- `turn_result.json` を書かない
- 応答はプレーンテキストのみ
- キャラ口調を維持

Campaign 用 `SKILL.md` とは **分離**（混在させない）。

---

## 7. UI / UX

### 7.1 Parlor で表示するもの

| 要素 | 備考 |
|------|------|
| チャットログ | `parlor_session` から描画 |
| キャラ肖像 | active character の portrait |
| 背景 | 既存 background 機構（Phase B でギャラリー） |
| 入力欄 + 送信 | 既存 freeInput |
| Connection ドロップダウン | Phase B |
| 🌐 ロケール | 既存 |
| TTS 📢 | 既存（キャラ声は Phase C） |

### 7.2 Parlor で非表示にするもの

| 要素 | 理由 |
|------|------|
| World タブ | LW 不要 |
| Inspector / Turn Inspector | turn_result なし |
| Character Sheet（HP/MP） | RPG mechanics なし |
| Commerce UI | 交易なし |
| Party Director | パーティなし |
| Cartography / 地図 | 任意（降格時に復帰） |
| Game Rules パネル（LW 系） | Parlor では無意味 |
| Quickstart / Scenario 生成 | Campaign 向け（Start Hub で分岐） |

**実装方針:** `experienceProfile` を Webview 初期化時に postMessage。CSS class `body.profile-parlor` で `display:none`。**DOM 削除はしない**（Campaign 復帰で再表示）。

### 7.3 モード切替 UI

**ヘッダーにトグル:**

```
[ 🎭 Parlor ⟷ ⚔️ Campaign ]
```

- 切替時に確認ダイアログ（未保存ドラフトがあれば警告）
- Campaign → Parlor: `game_state` はそのまま凍結（`experience.json.campaign.frozenAt`）
- Parlor → Campaign: 昇格ウィザード（§8）

### 7.4 Start Hub 改修

空ワークスペース時の選択肢に追加:

| ボタン | 動作 |
|--------|------|
| 🎭 **キャラと話す** | `experience.profile=parlor`、ST インポート促し、または同梱サンプルキャラ |
| 🎮 お試しデモ | 既存（Campaign / harbor-mist） |
| 🗺️ 地図デモ | 既存 |
| 🔧 デバッグサンドボックス | 既存 |

---

## 8. 移行フロー（1クリックの核心）

### 8.1 Parlor → Campaign（昇格）

**コマンド:** `LoreRelay: Promote Parlor to Campaign`

```
1. parlor_session.json の直近 K ターンを要約（決定論テンプレ、LLM 不要）
2. scenario.json ドラフト生成（title, opening, themes）
3. game_state.json 最小ブートストラップ:
   - playerCharacter（persona またはユーザー名）
   - messageHistory（parlor の user/assistant を gm/user にマップ）
   - location: "unknown" or キャラ scenario の場所
4. game_rules.json: 全 LW フラグ false（安全な既定）
5. experience.profile = 'campaign'
6. Webview を Campaign レイアウトへ
```

**昇格時にユーザーへ聞く（1 ダイアログ）:**

- シナリオ名
- World Forge を有効にするか（既定: いいえ）

**純関数:** `src/parlorPromoteCore.ts` — 入出力は JSON のみ、vscode 非依存。

### 8.2 Campaign → Parlor（降格 / 休憩）

**コマンド:** `LoreRelay: Switch to Parlor Mode`

```
1. livingWorld / emergent sim の tick を停止（既存 watcher は game_state 更新を Parlor では無視）
2. active character が無ければ npc_registry / party から選択ダイアログ
3. parlor_session.json を新規 or 既存ロード
4. 任意: 直近 game_history の gm/user を parlor messages へインポート（ユーザー確認）
5. experience.profile = 'parlor'
```

**データ削除はしない。** `game_state.json` は残し、`frozenAt` を記録。

### 8.3 ロールバック

昇格後 1 セッション以内なら `experience.json` に `lastParlorSnapshot`（パス参照）を保持し、Undo 可能（Phase C）。

---

## 9. バックエンド / プロバイダマトリクス

| Provider | Parlor | API キー | 備考 |
|----------|--------|----------|------|
| `vscode-lm` | **◎ 推奨** | 不要 | Copilot / Claude Code / Google LM 等 |
| `clipboard` | ○ | 不要 | Antigravity Gemini、手動ペースト |
| `grok` | △ | 不要 | JSON 習慣が強い → Parlor プロンプトで抑制 |
| `ollama` / `koboldcpp` | ○ | 不要 | ローカル |
| `openrouter` | ○ | 要 | 上級者向け |
| Codex / ChatGPT 拡張 | ○ | 不要 | **LM 一覧に無い場合** — `PARLOR_SKILL.md` + 手動 |

**月額 AI 向け UX コピー（README 用）:**

> Parlor モードでは、すでに契約している VS Code 内 AI（Copilot / Claude Code 等）を API キーなしで使えます。Gemini チャット UI そのものと同期したい場合は clipboard モードを選んでください。

---

## 10. 実装フェーズと PR 計画

### Phase A — 「話せる」最小縦スライス（MVP）

**完了定義:** サンプルキャラで Parlor チャットが 1 往復でき、Campaign UI が隠れる。

| PR | 内容 | 担当 |
|----|------|------|
| A1 | `parlorSessionCore.ts` + read/write + テスト | Grok |
| A2 | `experience.json` load/save + `getExperienceProfile()` | Grok |
| A3 | `parlorPromptBuilderCore.ts` + `gmBridgeRunner` Parlor 分岐 | Grok |
| A4 | Webview: profile postMessage + CSS 非表示 + チャット描画 | Grok |
| A5 | Start Hub「キャラと話す」+ コマンド登録 `package.json` | Grok |
| A6 | セキュリティレビュー（ChatGPT）· README 草案（Gemini） | レビューのみ |

**触るファイル（想定）:**

- 新規: `src/parlorSessionCore.ts`, `src/parlorSession.ts`, `src/experienceCore.ts`, `src/experience.ts`, `src/parlorPromptBuilderCore.ts`, `src/parlorPromptBuilder.ts`
- 変更: `src/gmBridgeRunner.ts`, `src/extension.ts`, `src/webviewHandlers.ts`, `webview/index.html`, `webview/modules/10-game-state.js`, `webview/modules/90-bootstrap.js`, `package.json`
- テスト: `scripts/test_parlor_session_core.js`, `scripts/test_parlor_prompt_builder_core.js`

### Phase B — ST 体験の完成

| PR | 内容 |
|----|------|
| B1 | `connection_profiles.json` UI |
| B2 | `PARLOR_SKILL.md` + clipboard フロー |
| B3 | `persona.json`（プレイヤー人格） |
| B4 | 背景ギャラリー（ST Background Gallery 相当） |

### Phase C — 移行の魔法

| PR | 内容 |
|----|------|
| C1 | `parlorPromoteCore.ts` + 昇格ウィザード |
| C2 | Campaign → Parlor 降格 + history インポート |
| C3 | `parlor_archive.ndjson` + 長期 summary |

---

## 11. テスト戦略

| 層 | 内容 |
|----|------|
| Core 単体 | `parlorSessionCore`, `parlorPromptBuilderCore`, `parlorPromoteCore` — Node でコンパイル実行 |
| Host 統合 | Parlor 送信 → `parlor_session.json` 追記 → Webview 更新 |
| 回帰 | 既存 82 tests が Campaign モードで全通 |
| 手動 | `testing_checklist.md` に Parlor 章追加（Gemini） |

---

## 12. セキュリティ（ChatGPT レビュー観点）

| 観点 | Parlor 固有リスク |
|------|------------------|
| プロンプト注入 | ロアブック / キャラ description の HTML・制御文字 |
| パス | `parlor_session.json` / `experience.json` のワークスペース外書き込み |
| Webview | `profile` 切替 postMessage の origin 検証 |
| プライバシー | Parlor 履歴の Remote Play 送信禁止（既定） |
| Provider | clipboard モードでクリップボードに機密を載せない（既存 redaction 踏襲） |

---

## 13. i18n

新規キー接頭辞: `webview.parlor.*`, `commands.parlor.*`, `parlor.promote.*`  
4 ロケール: `ja` / `en` / `zh-CN` / `zh-TW`（Gemini が文案ドラフト）

---

## 14. AI 役割分担（Claude 除外 — 2026-07-03）

| AI | 役割 | 成果物 |
|----|------|--------|
| **Gemini** | UX・ドキュメント・オンボーディング | README 4言語 Parlor 節、Start Hub 文案、スクショ計画、`testing_checklist.md` Parlor 章 |
| **ChatGPT** | セキュリティ・プロンプト契約 | Parlor セキュリティ監査表、`PARLOR_SKILL.md` ドラフト、昇格時データ境界レビュー |
| **Grok** | 実装・テスト・リリース | Phase A PR、npm test、CHANGELOG、commit/push |

**Claude が復帰したら:** Phase B の Webview  polish や大規模 TS リファクタの分担先として再割当。

コピー用プロンプト: [`docs/PARLOR_MODE_AI_PROMPTS.md`](PARLOR_MODE_AI_PROMPTS.md)

---

## 15. ロードマップ上の位置づけ

- **Phase 12（新設）:** Parlor Experience Profile
- LW4 / Event-to-Quest より **新規ユーザー獲得** の観点で優先度は高め（Phase A のみなら LW と並列可）
- v1.34.0 候補: Phase A 完了時

---

## 16. 未決事項（Open Questions）

| # | 質問 | 推奨（設計時点） |
|---|------|------------------|
| Q1 | `game_history` と `parlor_session` を将来統合するか | 当面分離。昇格時のみマップ |
| Q2 | Parlor でダイスを許すか | Phase A は **No**。要望があれば Phase C で cosmetic のみ |
| Q3 | 同一 WS で Parlor と Campaign を同時に開くか | **No**（単一 profile） |
| Q4 | `vscode-lm` 不可環境の既定 provider | `clipboard` |

---

## 17. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-03 | 初版（Parlor ⟷ Campaign 体験プロファイル、Phase A–C、3AI 分担） |