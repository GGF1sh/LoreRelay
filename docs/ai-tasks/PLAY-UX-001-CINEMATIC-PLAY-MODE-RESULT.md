# PLAY-UX-001 — Cinematic Play Mode (シアターモード) 実装結果

- **担当**: Claude (Fable 5)
- **日付**: 2026-07-10
- **ブランチ**: `ux/PLAY-UX-001-cinematic-play-mode`（origin/main `e9f9a91` 起点の独立 worktree、マージせず）
- **依頼元**: ChatGPT 起案の PLAY-UX-001 プロンプト（「ツール」から「ゲーム」へ見た目を変える没入プレイモード）

## 1. 何を作ったか

実プレイ専用のプレゼンテーションモード。ヘッダーの 🎬 ボタンで `body[data-play-mode="cinematic"]` をトグルし、管理コンソールを「シーン画像 → 物語本文 → 選択肢 → 最小ステータス」に集中した画面へ切り替える。

| 領域 | 通常モード | シネマティックモード |
|------|-----------|--------------------|
| ステータスパネル / リサイザー / ヘッダー | 表示 | 退避（`display:none`、モード解除で完全復元） |
| シーン背景 `#bg-layer` | 0.7〜0.85 の強い減光下 | 主役。ヴィネット型グラデーション（上0.30→下0.82）に差し替え |
| GM 本文 | 88%幅バブル・サンセリフ 14px | 中央 720px 読書カラム・明朝系セリフ 15.5px・行間 2.05・blur パネル |
| 選択肢 | 小型ボタンの横並び | 大型カード縦積み（hover グロー、focus-visible リング） |
| Quick-reply / Author's Note | 常時表示 | 「⋯」トグルの背後に折りたたみ（`aria-expanded` 連動） |
| 場所/時刻/資金 | 右ペインの行 | フローティングトップバーのピルへ受動ミラー |
| 復帰手段 | — | ⛶「管理画面」ボタン + Esc（`isComposing` 中は無視、confirm モーダル表示中は無視） |

- **永続化**: `localStorage['lorerelay.cinematicMode']`。リロード/パネル再表示後も復元（復元時はフォーカスを奪わない）。
- **モーション**: メッセージ入場は 0.6s フェード。`prefers-reduced-motion: reduce` で全停止。
- **レスポンシブ**: ≤760px でカラムが流体化、≤560px はステータスピル1行スクロール+入力エリア折返し、height≤620px は選択肢圧縮。
- **上部スクリム**: 本文がトップバーの下へスクロールしても衝突して見えないよう `#chat-area::before` にグラデーション。

## 2. 変更ファイル（touch set）

新規:
- `webview/styles/9a-cinematic-mode.css` — 全ルールを `body[data-play-mode="cinematic"]` スコープに限定。通常モードの CSS には 1 行も影響しない
- `webview/modules/89d-cinematic-mode.js` — トグル・Esc・ツール開閉・ステータスミラー（`MutationObserver` で `#status-content` を監視）。**`vscode.postMessage` 呼び出しゼロ = 状態書き込みゼロ**
- `scripts/test_webview_cinematic_mode.js` — 契約スモーク
- `docs/assets/screenshot-cinematic-mode.jpg` — 実 Webview ビルドからの実写

編集:
- `webview/index.html` — ヘッダー 🎬 ボタン + フローティングトップバー（CRLF 保持のため Node 行スプライスで挿入）
- `scripts/build-webview.js` — CSS を `89-vehicles.css` の後・`9b-genre-chrome.css` の直前、JS を `90-bootstrap.js` の直前に登録（genre chrome 最終位置の契約テストは無傷）
- `locales/{ja,en,zh-CN,zh-TW}.json` — `webview.cinematic.{enter,exit,exitLabel,tools}` 4キー×4ロケール
- `scripts/run_all_tests.js` — smoke 登録
- `CHANGELOG.md` [Unreleased]、`AI_SHARED_LOG.md`
- `docs/generated/symbol_registry.json` / `SYMBOL_REGISTRY.md` — `npm run generate:symbol-registry` 再生成

触っていないもの: ホスト側 (`src/**`) 一切、turn ロジック、Relay 契約、MEDIA-M1.1 系（着手前に MEDIA-M1.1 の touch set と交差ゼロを確認済み — 同ブランチ群は `webview/` を触らない）。`package.json` の版数も未変更（PR ベース運用のため統合時判断に委ねる）。

## 3. 検証

- `npm run compile` PASS / `npm test` **236/236 PASS**（新規 smoke 含む）/ `check_i18n_keys.js` 全ロケール missing 0
- 静的ハーネス（実 `index.html` + 実バンドル + `acquireVsCodeApi` スタブ + `gameStateUpdate` フィクスチャ、プロジェクト慣習パターン）で実動確認:
  - モード切替・復帰（ボタン/Esc/再入）、localStorage 復元、ツール「⋯」開閉、ステータスピルのミラー内容
  - 通常モードのレイアウトが無変更であること（回帰スクリーンショット比較）
  - 375px 幅で横スクロールなし、1600x1000 でシネマティック表示
- 背景画像はユーザーの ComfyUI (`IL\waiIllustriousSDXL_v170`) で「夜の港町・灯台・黒帆船」を実生成してフィクスチャに使用（本編の画像生成パイプラインと同系統の絵で検証）

### 再現手順（visual review）

1. `scripts/build-webview.js` 実行後、任意のセッションで Webview を開く
2. ヘッダーの 🎬 をクリック → シネマティックモード
3. ⋯ でツール、⛶ または Esc で復帰
4. 静的ハーネスで確認する場合: 実 `index.html` の `{{styleUri}}`/`{{scriptUri}}` をローカルパスに置換・CSP メタ除去・`acquireVsCodeApi` スタブ・`postMessage({type:'gameStateUpdate', state:{background, status, entries, options}})` を注入して HTTP 配信（`DEMO.md` の既存手法と同じ）

## 4. 設計判断・注意点

- **ステータスストリップは DOM ミラー方式**: `10-game-state.js` の `updateStatus()` が書く `#status-location/-time/-funds` を `MutationObserver` で写すだけ。state メッセージのスキーマに依存せず、ホスト無変更で HP 等の将来拡張にも追随しやすい
- **`#chat-header` はモード中完全非表示**: TTS/Relay 等のヘッダー機能はモード中は使えない（意図的。管理操作は ⛶ で戻ってから）。Relay バナーは `#chat-header` 外に挿入されるため Relay 運用中でも見える
- **9c との名前衝突回避**: 未マージの `ux/playable-milestone-pass` が `9c-ux-playable-pass.css` を使うため本タスクは `9a-` を採用。両ブランチとも `CSS_MODULE_ORDER` に 1 行足すだけなのでマージ衝突は自明に解消可能
- **フォント**: 明朝系はシステムフォントスタック（Noto Serif JP → Yu Mincho → Hiragino Mincho ProN → Georgia → serif）。外部フォント読み込みなし（CSP 無変更）

## 5. 残課題（スコープ外）

- スプライト（立ち絵）の演出強化はシーンに立ち絵が来た時の実データで再調整したい（現状は opacity 1.0 + max-height 78vh に引き上げたのみ）
- ヘッダー機能（TTS トグル等）のうち「プレイ中も欲しいもの」があればトップバーへ昇格候補
- Parlor プロファイルとの相互作用は未検証（Parlor は元々 status-area 非表示のため実害は無い見込みだが、実機確認推奨）

---

**Final verdict:**

```text
PLAY_UX_001_READY_FOR_VERIFY
```
