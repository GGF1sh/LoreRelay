# AI Connection V2 — GM connection guide

[日本語](#ja) · [English](#en) · [简体中文](../README_zh-CN.md#ai-connections) · [繁體中文](../README_zh-TW.md#ai-connections)

This page describes source version **1.85.2**, verified on **2026-09-08**. It is the current connection summary; the implementation log retains earlier failures and intermediate checkpoints as history. Source and downloadable VSIX versions are separate: see [VERSION_TRUTH](VERSION_TRUTH.md).

## Verification snapshot

| Provider | Tested native client | Requested model | Real GM | Separate Player / QA |
| --- | --- | --- | --- | --- |
| Codex | 0.153.4 | `gpt-5.6-terra` | Verified | Verified |
| Grok Build | 1.0.13 | `grok-4.6` | Verified | Verified |
| Antigravity CLI | 1.1.27 | `gemini-3.8-flash-high` | Verified | Verified |
| Claude Code | Adapter implemented | Not established by a real-service run | Unverified | Unverified |
| DeepSeek API | Adapter implemented | Not established by a real-service run | Unverified | Unverified |

Real GM means three consecutive saved/rendered responses and a stop case in each of Campaign and conversation-only play, through the isolated real Extension Host/Webview. Antigravity's earlier tool-policy failure was repaired in [PR #121](https://github.com/GGF1sh/LoreRelay/pull/121). These checks do not establish all-model compatibility, unlimited access, or game quality in arbitrary campaigns.

The model IDs above record test selections, not recommended defaults or a promise of availability. Use the official client's model list when offered. A model's self-description is not identity evidence. The [implementation history](GM_CONNECTION_V2_IMPLEMENTATION.md) records GM runs and repairs; [Player Lab](AI_CONNECTION_V2_PLAYER_LAB.md) describes the separate fixture paths.

Player checks used the same public fixture/task and a maximum of ten operations. Grok and Antigravity committed ten operations; Codex committed nine and chose to stop at the tenth confirmation. All committed receipts matched. These are Shared Game Action Service fixture runs, not Webview Player runs, and operation count is not a model ranking.

Separate QA sessions exercised the real Host lifecycle and an additional end day before one model analysis. Grok's one proposed finding was triaged as a model expectation error about the GM cadence counter; it was not a new game defect. Codex and Antigravity proposed none in this bounded check. This is not a general “no bugs” result. Claude/DeepSeek real-service checks are deferred at the owner's request; no credentials are required to retain their implemented adapters. **Human Play remains unperformed and unreplaced.**

<a id="ja"></a>

## 接続する

1. 現行ソースの拡張を起動してプレイ用フォルダを開き、コマンドパレットで **LoreRelay: AI接続** を選びます。
2. 下表のGM用入口を選びます。Player／相談役／観戦者の接続は別機能です。
3. 送信対象と利用枠を確認して同意し、専用プロファイルの公式ログインを完了します。DeepSeekはAPIキーを接続画面から保存します。
4. モデルを設定します。Codex／Grokの一覧は公式クライアントから取得し、手入力も残しています。取得できない場合や他の接続では、クライアントで使える正確なIDを確認してください。
5. **LoreRelay: Open Game UI** で入力を一つ送ります。「認証確認済み」「接続準備完了」だけではモデル往復成功ではありません。返答が確定してゲーム画面に反映されたことを確認します。

| 接続 | 現在のメニュー入口 | 認証と利用枠 |
| --- | --- | --- |
| Codex | `Codex` → `GMとして使う` | 専用の公式ChatGPTログイン。Codex利用枠 |
| Claude | `Claude Code` → `GMとして使う` | 専用の公式Claudeログイン。サブスク認証を確認する経路 |
| Google | `Antigravity CLI — GM` | 専用の公式Googleログイン。旧`Gemini CLI`入口とは別 |
| Grok | `Grok Build — GM` | 専用の公式Grokログイン。Player向け`Grok Build`とは別 |
| DeepSeek | `DeepSeek API — GM（従量課金）` | VS Code SecretStorageへAPIキーを保存。モデルと最大出力tokenを確認 |

GMには入力・履歴・必要な非公開世界情報が送信されます。ローカル保存は「外部AIへ情報を送らない」という意味ではありません。通常のWebチャットの無料枠をAPIとして使う機能ではなく、利用枠切れでもAPI課金へ自動移行しません。

### つまずいたとき

- **未導入／起動できない：** 接続先の公式クライアントが必要です。LoreRelayや他社のVS Code拡張のインストールだけでは代用になりません。
- **ログインが必要：** LoreRelayの専用プロファイルでログインします。別の通常ターミナルでログイン済みでも、そのまま共有されるとは限りません。
- **Codexでlocalhost接続拒否：** 接続設定を開き直して新しい公式ログインを開始します。デバイスコード方式も選べます。公式画面がアカウントのデバイスコード認証設定を要求した場合はその案内に従います。古いcallback URLやコードを貼り付ける必要はありません。
- **モデル不一致：** 一覧があれば選び直します。表示名とモデルIDは同じとは限りません。自動で別モデルへ変更しません。
- **枠不足／タイムアウト／不明結果：** 表示された理由と保存済みの履歴を確認します。不明な操作を成功扱いしたり、自動再送で隠したりしません。
- **停止・接続変更：** 実行中は停止操作を使い、終了を待って接続を変更します。停止後の入力を保持し、古い応答を新しい世界へ確定させません。

<a id="en"></a>

## Connect a GM

1. Start the current extension source, open a play folder, then run **LoreRelay: AI Connections**.
2. Use the GM entries in the table above: Codex/Claude Code → `GMとして使う` (use as GM); `Antigravity CLI — GM`; `Grok Build — GM`; or `DeepSeek API — GM（従量課金）` (metered API).
3. Review the context-sharing and billing notice. Complete the official login in the dedicated profile, or save the DeepSeek key through the connection UI into VS Code SecretStorage.
4. Select a model. Codex/Grok offer the official client's catalog plus manual entry. For other paths or unavailable catalogs, verify the exact supported ID in that client. The test IDs above are historical selections, not availability guarantees.
5. Open **LoreRelay: Open Game UI** and send one input. Authentication/readiness is not a completed GM turn: check the committed reply in the game screen.

The GM may receive private world context alongside input and history. Local-first storage does not mean cloud inference is local. Subscription limits still apply, and no automatic API billing fallback, model switch or resend is performed.

### Troubleshooting

- **Missing client / launch failure:** install the selected official client. Another provider's VS Code extension is not a substitute.
- **Login required:** authenticate the dedicated LoreRelay profile; a normal terminal login may use a different profile.
- **Codex localhost refusal:** restart the connection's official login flow. Device-code login is also offered. If the official page requires enabling device-code authentication in account settings, follow that prompt. Do not share callback URLs or codes.
- **Model mismatch:** select from the catalog when available; display names and IDs can differ. LoreRelay does not silently substitute another model.
- **Quota / timeout / unknown outcome:** inspect the displayed reason and saved history. An uncertain result is not converted to success or hidden behind an automatic retry.
- **Stop / change connection:** stop an active request and wait for it to finish before switching. Input is retained and stale replies are not committed to a new timeline.

## Existing routes and developer references

VS Code LM uses only models exposed through the VS Code model API. Ollama/KoboldCPP, OpenRouter and clipboard/manual bridges remain available through [Bridge presets](../GM_BRIDGE_PRESETS.md). The [older Antigravity guide](../ANTIGRAVITY_GUIDE.md) describes the adjacent-agent/manual workflow, not the new Antigravity CLI GM adapter.

- [Host configuration implementation](../src/gmConnectionHost.ts)
- [Connection menu implementation](../src/playerAgentHost.ts)
- [GM verification history](GM_CONNECTION_V2_IMPLEMENTATION.md)
- [Player/QA fixture execution and private article drafts](AI_CONNECTION_V2_PLAYER_LAB.md)

No normal-campaign prose, account details, tokens or local authentication profiles are published with this guide.
