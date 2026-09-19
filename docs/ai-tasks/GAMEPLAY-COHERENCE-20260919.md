# 横断プレイで確認した接続不良の修正

基準は `c025eb9c8e2547bebe261edada92c7af9712b42f`（1.89.2、PR #147統合済み）。開発担当は開始・終了時とも実セッション記録で `gpt-6-astra`／`ultra`。専用workspaceをAIが操作した実Extension Host/Webviewの記録であり、人間が遊んだHuman Playとは区別する。既存のdirtyな元checkoutで参照不良があったため、元データを変更せず、clean cloneから専用worktreeを作成した。

Version decision: **patch — 1.89.2 → 1.89.3**。既存導線・状態表示と交易デモの初期公開情報を修正した実行コードを、新しいプレイ候補として識別する。版上げはRelease・VSIX公開を意味しない。

## 再現できた5件

| 再現操作 | 期待結果 | 実際の結果 | 原因と最小修正 |
| --- | --- | --- | --- |
| Start Hubから交易デモを開始し、南港への移動を開く | デモで案内される既知の交易路を選択できる | 北農場・南港が未発見扱いで候補に出ず、売買ルートを進めない | `scenarioPack`が開始時の`currentLocationId`しか保存しなかった。同梱デモだけが`opening.world.discoveredRegionIds`を明示し、loaderはその配列を正規化して保存する。訪問済みにはせず、未指定の一般シナリオのfogは維持 |
| Start Hubで「主人公を新規作成」を選ぶ | 新規人物がプレイヤー操作で作成される | 作成画面の操作主体がGMになる | 汎用Creatorの既定値を使っていた。主人公の入口からだけ`controlledBy: player`を渡す。通常のNPC作成・既存人物編集の既定は変えない |
| World Genesisでプレビューを採用する | 採用後、人物準備または冒険画面へ進める | 完了表示の後に次の操作が分かりにくい | 採用成功後の明示的な次段導線がなかった。成功時だけ「主人公を作る」「冒険画面へ進む」を表示し、既存Creatorと再開処理へ接続 |
| 交易UIで小麦を購入し、冒険ステータスを見る | 正本と同じ現在の所持金が見える | `commerce.credits`は減るが`status.funds`の開始時自由文が残る | 冒険欄が自由文だけを描画していた。Commerce ONではworldViewの正本由来creditsを表示し、購入直後のworldView更新にも追従。OFFでは自由文を使用し、0残高も表示。保存データの自由文は書き換えない |
| 南港へ移動し、帰還後にcheckpointを保存する | 冒険欄・地図・Action Hubが同じ現在地を示す | 移動後の冒険欄は旧所在地。さらにcheckpoint後の引数なしrefreshではworldViewの現在地がnullになり、Action Hubが「—」を表示 | 冒険欄は`status.location`だけを使用し、一部refreshは所在地を渡していなかった。worldViewの正本所在地から表示し、`pushWorldViewToWebview`は引数省略時に既存のdisk読取りhelperで補う。航行復旧後に読み、明示引数・拠点プレビューの分離を維持 |

Risk tierは**High**（シナリオ開始時のcanonical world保存）、**Medium**（主人公・採用後のUI導線）、**Low**（資金・所在地の表示投影）。新save schema、migration、combat-core変更はない。

## 実際に操作した範囲

- **World Genesis:** 別の空workspaceでseed `coherence-20260919`、接続密度1.5のpreviewを表示し採用。previewと採用後のforge・rules・NPC資料を保存した。ここで作った世界と、以下の交易冒険は別の確認対象。
- **交易冒険:** 同梱`trade-routes`を隔離workspaceへ採用し、ハルカで操作。修正後の正本は、開始500 credits → 小麦1購入後489 → 南港で売却後505。`elda_shop → south_port → elda_shop`を移動し、帰還後に1日進めてworldTurn 10 → 11、発生した依頼を`available → active`へ受注した。移動自体は日付を進めず、明示的な日送りと区別する。
- **保存:** 同じ冒険でcheckpointを保存。保存時の正本は505 credits、所在地`elda_shop`、worldTurn 11、依頼`active`を保持していた。この時に見つかった表示refreshの追加修正は限定レビュー済み。最終修正後の再起動、checkpoint保存直後のAction Hub所在地、南港再訪時の画像読込まで確認済み。最終セーブは再訪先の南港。
- **画像:** 南港で場所画像をComfyUI実生成。prompt ID `c68d9097-3e37-4efc-a38b-61ab511d3385`、出力`adv_scene_00017_.png`、historyの`status=success`／`completed=true`を確認した。画像は表示資料であり、絵から施設・報酬・GM記憶を増やしていない。
- **船・移動拠点:** PR #146／#147の既存証拠を再利用した。今回、新しい船の航行・移動拠点の長期プレイを実施したという主張はしない。

修正後の開始からcheckpointまでの保存済み操作記録は2026-09-19 15:11:46Z〜15:19:08Z。これは約7分22秒の観測区間であり、準備・別workspaceの確認時間を足して「30〜60分のHuman Play」とは扱わない。

## AI GMと情報の接続

Grok Buildの公式catalogから`grok-4.6`を選択した。最初の実Webview入力はEldaへの挨拶と南港の小麦不足についての質問だったが、専用profileは`grok_login_required`で停止した。**今回の実GM prompt送信・実GM応答・Accepted Turnは0件**。利用可能な別API・別モデルへの自動切替、認証情報の公開は行っていない。

したがってNPCとの実AI会話、応答による状態変更、再起動後の次GM応答、長時間会話の記憶品質は未確認。開始文やデモ内のNPC台詞は固定データであり、実AI生成として扱わない。

コード確認では、Connected Grok経路のLiving World contextは`commerce.credits/cargo`を読み、旧`status.funds`の全文を直接注入しない。今回の資金findingを「実GMが旧金額を認識した」とは拡張しない。生成後の次ターンcontextと実応答の照合は認証成功後の確認対象として残る。

## 検証と証拠の現在地

- 独立レビュー1回で、資金表示がWorld Forge OFF後も前のworldViewを参照する問題を発見し修正した。一般シナリオのfog維持・訪問済みの非生成・Creatorの新規扱いを確認。後から実プレイで見つかった現在地refreshの追加3行も限定レビューし、阻害指摘なし。
- `1f131447ca3c50da13b722db368b033f1c760a50`の初回全体検証は**400/400成功、Combat 736/736成功、185.7秒**。その後に現在地refreshの実行コードを変更したため、この結果を最終tree全体成功として流用しない。
- 追加所在地修正のfocused検証は`test_worldview_location_scoped_settlement.js`の30ケースが成功。最終実行SHA `e0bd2babb5234503a2f40bb57117746c049e4ef1`、tree `cdd104633b10c67aae6055707eb27f4835417f5e`の全体400/400、Combat736/736が成功（167.1秒）。
- ローカル証拠は`C:\AI\LoreRelay-Gameplay-Playcheck\evidence`。`genesis/preview.json`と採用後の保存データ、`genesis-fixed`の採用後Creator確認、`adventure/turn-01.json`とsession events、`adventure-fixed/actions/01-start`〜`09-checkpoint`の状態・UI記録、`adventure-fixed/comfy-history.json`、全体・focusedログを保持する。生の認証profileは証拠に含めない。
- 文書・画像の後続commitとDraft PR、CI状態、Drive一覧はPR本文とDriveの「00_最初に読む」に記録する。mainへのmerge、タグ、Release、VSIX公開は行わない。

これは実行済み範囲と残る限界の記録であり、Human Play全項目やGMを含む一連の冒険が完走したという報告ではない。
