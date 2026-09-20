# 実AI GMプレイで観測した接続不良

Base: `732d7923ced336ef84f849e7446e8afd8d59f306`（Draft PR #148、1.89.3）。mainは`c025eb9c8e2547bebe261edada92c7af9712b42f`／1.89.2。元のdirty checkoutを保持し、専用worktreeから作業した。

Version decision: **patch、1.89.3→1.89.4**。Risk: **High**（Accepted Turnから正本・世界時間への反映）。実機操作はAIであり、ユーザー本人のHuman Playではない。開発担当は開始時の実行記録で`gpt-6-astra / ultra`、終了時の記録は納品manifestに併記する。

| 重大度・再現 | 期待 | 実際 | 原因・最小修正 |
| --- | --- | --- | --- |
| P2：通常会話／履歴の再表示 | 明示的な日送りだけが世界を進める | 認証失敗や会話で世界11→16へ進行 | `gameStateSync.ts`の履歴同期からsimulation tickを除去。既存のAccepted `elapsedWorldTurns`と日送り操作は維持。通常会話は16据置、一泊だけ16→17を実証 |
| P2：GMに小麦購入を依頼（turn4） | 命令が既存の検証・採用経路へ届く | 買ったと描写するが505 credits・積荷0。応答にはnested tradeOpsあり | `vscodeLmTurnResultCore.ts`で既存parserを使い取引・依頼・評判・経過日数を正規化。`gmBridgeRunner.ts`の形式契約と`livingWorldPromptCore.ts`等にcanonical IDを明記。独立レビュー後、nested/top-level混在はfield単位の優先で扱い配列を結合しない。実購入turn5・売却と完了turn9成功 |
| P3：完了依頼を見る | 完了が画面で分かる | completedのCSS状態はあるがラベルがない | `85-world.js`に完了ラベル、4言語の文言。実DOMで完了表示を確認。Low |
| P2：移動直後にGMへ送信（turn13） | Eldaの店という保存済み現在地を送る | canonicalはelda_shop、実promptはSouth Port。GMが再移動を案内 | `gmPromptBuilder.ts`でdebounceされたUI cacheを使わず正本を読む。読めない時も古いcacheに戻さない。turn15/20/23の実送信と、古いcacheを残すfocused testで確認。Medium |
| P2：以前の約束の相手を訪ねる（turn15以降） | 現在の質問に関係する過去の会話と回答を供給 | 直前会話の自己一致と、質問だけの検索結果により元の自己紹介が欠落 | 検索queryを現在入力優先にし、空・該当なしでは既存hintへ戻す。`memoryBank.ts`で直後の公開GM回答を添付し、Pythonの履歴候補も現在の公開履歴で読み直す。既存上限・backend・保存形式を維持。非公開回答／失敗後の連続入力をまたがないテスト。Medium。約束再供給は確認したが、過去に生成済みの誤名による人物の揺れは残る |

修正前turn4の不足分を直接JSON編集で補ってはいない。実UIで10袋を購入し、修正後turn5で別の1袋を実GM経由で購入した。失敗例も全件数へ含め、正常成功例だけの集計に見せない。

High部分は独立レビュー1回（実装とは別の読取レビュー）、mixed envelope修正、該当focused testの順で検証。後から実機で再現した読取context／表示のMedium・Low修正はfocusedと実送信・実画面で確認し、無関係な再監査を増やしていない。

最終実行SHA/treeと全体399/400・失敗1件単体再実行成功の区別、実GM24応答／23採用、再起動前後7ファイル一致、固有名の限界は[実プレイ記録](../REAL_GM_PLAYCHECK.md)を参照。最終HEADは文書・証拠を含むPR本文に記録する。PR #148をbaseにした新しいDraftで渡し、Ready化・review resolve・merge・配布は行わない。

ローカル原証拠：`C:\AI\LoreRelay-RealGM-Playcheck\evidence`。Driveは共有用の補助証拠、GitHubを技術的正本とする。次の担当AIはユーザー指示待ち。新規タスクは自動開始しない。

Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`. Do not escalate beyond its risk tier without a concrete reason.
