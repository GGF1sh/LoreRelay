# LoreRelay Current Handoff

> **役割**: このファイルはマルチAIリレー運用（ChatGPT/Grok/Claude/Gemini/Antigravity）の
> 「今どこまで進んでいて、次に何をするか」を人間・AI双方が素早く把握するための
> **運用ハンドオフメモ**。`AI_SHARED_LOG.md`（先頭の Current Snapshot が古いまま放置されがち）
> の代わりに、こちらを都度上書き更新していく運用にする。
>
> 新しいAI/セッションへの最小読み込みセットは:
> 1. `AGENTS.md`（安全ルール）
> 2. `docs/VERSION_TRUTH.md`（版の正本の見分け方）
> 3. `AI_HANDOVER.md`（アーキテクチャ。ただし「現在の残件」節は古い可能性があるため現行判断には使わない）
> 4. **本ファイル**（今の状態・直近の作業・次にやること）
>
> `AI_SHARED_LOG.md` と `VSCODE_CHATGPT_CATCHUP.md` は例示バージョンが古く、
> 今読ませると逆に混乱するため最小セットから外している（詳細確認が必要な時のみ参照）。

## 現在のバージョン正本（2026-07-14 時点）

| 項目 | 値 |
|------|-----|
| `package.json` | **1.82.3** |
| 直近コミット(main, push済み) | `22523ea` docs: add AI-generated scenario preview art |
| | `1c910ca` fix(i18n): translate remaining Start Hub/tab/World-tab/theme strings + fix version drift |
| | `1582478` fix(webview): repair Relay toggle i18n race + Start Hub debug card translation |
| `npm test` | 249/249 |

**注意**: ChatGPT等の別セッションに「mainは1.82.2」という前提の古い情報が残っている場合がある。
テストプレイ前に必ず `node -p "require('./package.json').version"` で実測すること。

## 直近セッションでの変更（Claude Sonnet 5, 2026-07-13〜14）

人間スモークテスト直前の「UI/UX polish」パス（新機能追加なし、既存UIの粗探し＋修正）。

1. **Relay toggle ボタンの i18n レース修正** — `localeBundle` 到着前に `DOMContentLoaded` で
   生キー `webview.relay.toggle.off` が一瞬〜継続的に表示されるバグ。
2. **言語切替時にRelayボタンが追従しない不具合修正** — 途中で言語を変えてもRelayトグル/送信ボタンの
   文言だけ旧ロケールのまま固定されていた。
3. **ja/zh-CN/zh-TW の未翻訳6系統を修正**: Start Hubデバッグカード、ステータスタブ
   （Lorebook/Memory/Director/Party）、チャット送信者ラベル（Player/System）、Worldタブ
   （Maps & Intel/Unfold/Rep）、World Themeジャンルボタン8個（`data-i18n`自体が未配線だった）。
4. **バージョン整合性の見落とし修正** — `package-lock.json`・README 4言語バッジがpackage.jsonの
   bumpに追従していなかった。
5. **Player Action Hub（暮らす）を静的ハーネスで実機に近い形で動作確認** — `worldView`
   メッセージを手動注入し、取引タブの品目選択→確認→確定→レシート表示まで一通り検証。
   設計通りで新規バグなし（`docs/ai-tasks/PLAYABLE-V0-UI-001-PLAYER-ACTION-HUB.md`参照）。
6. **ComfyUI連携の実証 + シナリオプレビュー画像**: `docs/assets/scenario-previews/` に
   5シナリオ分のAI生成コンセプトアート追加（ゲームプレイスクリーンショットではない）。

詳細は `AI_SHARED_LOG.md` の 2026-07-13/14 付エントリ2件を参照。

## Claude Code（このAI）が実際にできること／できないこと

- **できる**: `webview/` のビルド成果物をscratchpadに展開し `postMessage` を手動注入する
  **静的ハーネス**でのUI/UXレイアウト・挙動検証。ComfyUI等の外部HTTP APIへの直接アクセス。
  Node/npmスクリプトの実行、`npm test` 等。
- **できない（デフォルトでは）**: 実際のVSCode拡張ホスト（`extension.ts`）を起動しての
  E2E実機テスト。`turn_result.json`監視・GM呼び出し・実ゲームプレイは代替できない。
  「人間スモークテスト」は依然として人間 or 実VSCode操作が必要。
- **条件付きでできる**: ユーザーがVSCodeを開いた状態で computer-use 権限を許可すれば、
  実画面をクリック操作して本物の拡張機能を動かすことは技術的に可能（要都度許可）。

## テストプレイ用シナリオ（Start Hub経由、`sampleId`対応表）

`sample-scenarios/` 配下は全6本あるが、Start Hubのボタンに配線されているのは4本のみ
（`webview/modules/90-bootstrap.js` の `loadBundledScenario` 呼び出しで確認済み）。

| Start Hubボタン | `sampleId` | 内容 |
|---|---|---|
| 🎮 お試しデモを始める | `harbor-mist` | 港町の霧。約15分の穏やかなミステリー。一般ユーザー体験の確認向け |
| 🗺️ 地図デモ（上級） | `lost-catacombs` | 忘れられた地下聖堂。罠・不死者・HP・厳格なゲームオーバーありのダンジョン。WorldタブParchment地図/探索UI確認向け |
| 🔧 デバッグサンドボックス | `debug-sandbox` | 好感度・地図の霧・世界ターン等を自然言語で即時操作。GM非経由。機能配線チェック向け |
| 🧰 スカベンジャーデモ | `scrapbound-settlement` | 本命プレイテスト。Campaign Kit + Commerce。掲示板→廃墟探索→未鑑定品→鑑定→売却→市場反応のループ |

Start Hub非経由（`sample-scenarios/`には存在するがボタン未配線）: `neon-rain`（サイバーパンク・ノワール）、
`trade-routes`（Living World Commerce実演用、`README.md`に手動読込手順あり）。

### ① デバッグサンドボックス — 推奨コマンド順

```
ヘルプ
状態
エルダの好感度を+20
市場を発見
5ターン経過
宿で休む
```

同時に確認すべきUI項目（Relay banner関連の直近修正の実証）:
- Relay ONで上部が見切れない
- Relayバナーの高さをドラッグできる
- 世界観テーマを変えても見出しが消えない
- 右側パネルを最下部のSummaryまでスクロールできる
- Relay OFFで余白が残らない

### ② スカベンジャーデモ（`scrapbound-settlement`） — 本命プレイテストの流れ

主人公: レン・ヴェイル。初期位置: スクラップバウンド市場通り。所持金120クレジット、荷袋は空。

```
掲示板を見る
  ↓
暮らす
  ↓
取引で何か購入
  ↓
一日を終える
  ↓
旅タブを確認
  ↓
（可能なら）別市場へ移動
  ↓
売却
  ↓
再起動して続きから
```

**注意**: 開始直後から複数のcanonical marketが用意されているとは限らない。旅タブに目的地が
出ない場合は、まずシナリオ進行で別地域・市場を発見する必要がある。

## 次にやること

- [ ] 上記①②を実際のVSCode（人間 or computer-use経由）で実機プレイし、Relay banner /
      Player Action Hub の human smoke を完了させる
- [ ] 見つかった不具合は `docs/ai-tasks/` にIssueとして記録するか、直接修正してこのファイルを更新
