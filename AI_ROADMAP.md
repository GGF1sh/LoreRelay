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
  - TS側: `src/statePatch.ts`, `src/gameStateSync.ts` (Antigravity 実装済み)
  - Python側: `gm_bridge_common.py` の `_JSON_SCHEMA` と `process_llm_response()` を改修 (Claude 実装済み)
- [x] **Turn Result**: 毎ターンの結果を `turn_result.json` および追記型の `state_journal.ndjson` に保存する。
  - `turn_result.json` は Python が書き出し、TS 拡張のウォッチャーがパッチを適用して `game_state.json` と `state_journal.ndjson` を更新。
- [x] **Dice Ledger**: サイコロの結果をテキスト置換だけでなく、個別出目や理由を記録した監査ログ (`diceLedger`) として構造化し保存する。
  - TS側が `dice_ledger.json` を書き出し、Python が `turn_result.json` の `diceLedger` フィールドに同梱。

### Phase 2C: GM Debug Console (Turn Inspector)
- [ ] **Turn Inspector UI**: Webview内にデバッグパネルを追加し、ターンの入力、パッチ適用前後の差分、ダイス台帳、発火したロアを閲覧可能にする。

### Phase 2B: SillyTavern 資産移行の完成
- [ ] **TavernCard V1/V2**: PNG/JSON インポートの完全対応（`extensions` フィールド等を捨てずに保持）。
- [ ] **ST ロアブックエンジン**: Regex Keys, Secondary Keys, Depth などの細かい発火条件をLoreRelayのエンジンでサポートする。

---

## 🟡 Phase 3: 並列エージェントパイプラインとリモートプレイ (担当: Grok)
*ステータス: Phase 3A 完了*

ゲーム進行を止めない非同期処理と、LAN内で遊べるマルチデバイス対応。

- [x] **Phase 3A (Marinara Engine型)**: メインの文章生成を止めずに、バックグラウンドでBGM選曲・SE発火・ComfyUI画像生成を非同期に走らせる。
  - TS側: `src/mediaAgent.ts`（GM stdout ストリーム解析・`turn_result.json` フック・画像キュー）、`imageGenRunner.ts` キュー drain、`gmBridgeRunner.ts` 早期メディア dispatch
  - 設定: `textAdventure.mediaAgent.enabled` / `autoImage` / `maxImageQueue`
- [ ] **Phase 3B (ZRIC型)**: LAN内（またはTailscale経由）からスマホ等でアクセスできる「プレイヤー専用の読み取り/入力画面 (localhost)」を立ち上げ、WebSocketでメイン画面と同期させる。

---

## ⚪ Phase 4: "Soulgaze" 視覚統合とルールセット拡張 (担当: Gemini)
*ステータス: 未着手*

画像認識と、どんなTRPGでも回せる柔軟なデータ構造の実現。

- [ ] **Phase 4A (Herika型)**: ComfyUIで生成した画像をVLM（視覚言語モデル）に読み込ませ、現在の状況や見た目をナラティブの文脈として再利用する。
- [ ] **Phase 4B (ルールセットプラグイン)**: `generic-fantasy` や `coc7e-lite` など、ステータス項目や判定式を定義したJSONルールセットを外部から動的に読み込む機能。
