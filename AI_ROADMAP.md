# AI Master Roadmap (Blackboard)

このファイルは、全AIエージェント（Antigravity, Claude, Grok, Gemini）が共有する**タスク管理用の黒板（Blackboard）**です。
作業を開始する前にここを確認し、作業が完了したら `[ ]` を `[x]` に変更して保存してください。

> **設計方針**: 派手な機能よりも「壊れない・可視化されたGM基盤」を最優先とし、SillyTavernの資産（キャラクターカード・ロアブック）を完全に読み込める、開発者・パワーユーザー向けの「AI GMコンソール」を目指します。

---

## 🟢 Phase 1: 確定的判定とルール基盤 (担当: Antigravity)
*ステータス: 完了*

- [x] **Phase 1.0**: `{{roll 1d20}}` 等のダイスマクロをパースし、RNG（乱数）を確定させてからLLMへ送る機能の実装。
- [x] **Phase 1.5**: RPG要素（HP/MP）のON/OFFやデフォルトパラメータを調整できる `Game Rules` 設定UIと `game_rules.json` の永続化基盤。

---

## 🟢 Phase 2: 厳格な状態管理とST互換性の完成 (担当: Claude / Antigravity)
*ステータス: Phase 2A 完了*

LLMのハルシネーション（勝手な改変）を防ぐ「壊れないGM基盤」と、資産をそのまま引き継げるインポーターの完成。

### Phase 2A: 壊れない状態管理 (State Patch & Dice Ledger)
- [x] **State Patch**: LLMにJSON全体を書かせるのをやめ、状態の変更差分（`statePatch`）のみを出力させ、拡張機能側で検証・適用する仕組み（Persist-Before-Narrate）。
  - TS側: `src/statePatch.ts`, `src/gameStateSync.ts`, `src/turnResultFallback.ts`（Grok 直書きフォールバック）
  - Python側: `gm_bridge_common.py` の `_JSON_SCHEMA` と `process_llm_response()`（`b9c7916` 堅牢化済み）
- [x] **Turn Result**: 毎ターンの結果を `turn_result.json` および追記型の `state_journal.ndjson` に保存する。
  - Python が `turn_result.json` を書き出し、TS ウォッチャーがパッチ適用。Grok は `turnResultFallback` で合成可能。
- [x] **Dice Ledger**: サイコロの結果をテキスト置換だけでなく、個別出目や理由を記録した監査ログ (`diceLedger`) として構造化し保存する。
  - TS側が `dice_ledger.json` をアトミック書き込み、Python が `turn_result.diceLedger` に同梱。
- [x] **堅牢化 (v0.3.2)**: allowlist 拡張、`narration` マージ、`beforeHash`/`afterHash` ジャーナル、`mediaPaths.ts` 循環依存解消、`scripts/test_state_patch.js`。

### Phase 2C: GM Debug Console (Turn Inspector)
- [x] **Turn Inspector UI**: Webview内にデバッグパネルを追加し、ターン ID、整合性ハッシュ、パッチ、ダイス台帳、発火ロア（`triggeredLore`）を閲覧可能にする（`pane-inspector` HTML 欠落を修正、`b9c7916`）。

### Phase 2B: SillyTavern 資産移行の完成
- [ ] **TavernCard V1/V2**: PNG/JSON インポートの完全対応（`extensions` フィールド等を捨てずに保持）。
- [ ] **ST ロアブックエンジン**: Regex Keys, Secondary Keys, Depth などの細かい発火条件をLoreRelayのエンジンでサポートする。

---

## 🟢 Phase 3: 並列エージェントパイプラインとリモートプレイ (担当: Grok)
*ステータス: 完了*

ゲーム進行を止めない非同期処理と、LAN内で遊べるマルチデバイス対応。

- [x] **Phase 3A (Marinara Engine型)**: メインの文章生成を止めずに、バックグラウンドでBGM選曲・SE発火・ComfyUI画像生成を非同期に走らせる。
  - TS側: `src/mediaAgent.ts`（GM stdout ストリーム解析・`turn_result.json` フック・画像キュー）、`imageGenRunner.ts` キュー drain、`gmBridgeRunner.ts` 早期メディア dispatch
  - 設定: `textAdventure.mediaAgent.enabled` / `autoImage` / `maxImageQueue`
- [x] **Phase 3B (ZRIC型)**: LAN内（またはTailscale経由）からスマホ等でアクセスできる「プレイヤー専用の読み取り/入力画面 (localhost)」を立ち上げ、WebSocketでメイン画面と同期させる。
  - TS側: `src/remotePlayServer.ts`（HTTP + WebSocket + メディアプロキシ）、`remote-player/` モバイル UI
  - コマンド: `Text Adventure: Start/Stop Remote Play`、Webview 📱 ボタン
  - 設定: `textAdventure.remotePlay.port` / `bindAddress` / `maxClients` / `inputCooldownMs`

---

## ⚪ Phase 4: "Soulgaze" 視覚統合とルールセット拡張 (担当: Gemini)
*ステータス: 準備完了 (TS側実装済み)*

画像認識と、どんなTRPGでも回せる柔軟なデータ構造の実現。

- [x] **Phase 4A (Herika型)**: ComfyUIで生成した画像をVLM（視覚言語モデル）に読み込ませる。（AntigravityがTS側で `latestImage` をプロンプトに送る基盤を実装済。GeminiによるGM側の対応待ち）
- [x] **Phase 4B (ルールセットプラグイン)**: `generic-fantasy` や `coc7e-lite` など、ステータス項目や判定式を定義したJSONルールセットを外部から動的に読み込む。（Antigravityが動的ステータスバーUIを実装済）
