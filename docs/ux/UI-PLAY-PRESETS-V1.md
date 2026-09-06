# UI-PLAY-PRESETS-V1 — 評価と改善記録

対象base: `e42990c297685ffc248953d59b6a67edd04b28df`。リスク: Medium（表示とworkspace Mementoの限定的なHost接続）。ゲーム状態、承認、取引計算、Combat、Story GMは変更しない。Human Play / human smokeは未実施・未代替。

## 観察した問題 → 改善内容 → 改善後の証拠

点数は付けず、実際に観察した範囲を記す。比較は固定Commerce fixtureを使った実VS Code 1.136.1 Extension Development Host。旧実装は保持済み #104 worktree（baseと同じ実行tree）をそのまま起動し、初期化後に取得した。

| 観察した問題 | 改善内容 | 改善後の証拠 |
|---|---|---|
| 設定系の小さなアイコンが常時並び、ゲーム中の操作と競合していた | ヘッダーに表示・行動を集約。設定を開閉メニューへ移し、説明を付けた | [改善前・広幅](ui-play-presets-v1/before-stable-1440.png)、[物語](ui-play-presets-v1/after-1440-story.png) |
| 狭い状態列の横長タブはWorldやInspectorを探しにくい | タブを折り返し、Inspector/Directorを「ツール」に整理。Commerce入口は共通ヘッダーから既存Action Hubへ接続 | [管理](ui-play-presets-v1/after-1440-management.png) |
| 会話・状態の比率が固定で、読み方に合わせられなかった | 同じDOMを使う物語/管理/演出。演出は背景側を広くし、詳細と履歴を開閉 | [演出・画像なし](ui-play-presets-v1/after-1440-cinematic.png) |
| 開始画面で日常の開始方法とデモが同じ一覧にあった | 続ける、質問、既存キャラクター/世界を主導線にし、他の開始方法とデモを別グループへ | [開始画面・狭幅](ui-play-presets-v1/after-start-hub.png) |
| 質問回答が表示の選び方に接続していなかった | 最終確認におすすめ・3択・即時レイアウト見本を追加。保存済み手動選択を優先 | [質問の最終確認](ui-play-presets-v1/after-genesis-preview.png) |
| 実装中、日本語の折り返しで設定メニューが左へはみ出した | ポップアップの位置をヘッダー全体基準に修正 | [狭幅](ui-play-presets-v1/after-390-story.png)、実メニューから開始画面へ移動成功 |
| ライトテーマで旧固定色の見出し/入力が薄くなった | 共通文字・面・入力をVS Codeの色へ接続し、フォーカスと高コントラストの枠を維持 | [Parlor・ライト・管理](ui-play-presets-v1/after-parlor-vscode-light-management.png)、[In-World・高コントラスト](ui-play-presets-v1/after-inworld-vscode-high-contrast-cinematic.png) |

## 動作と境界

- `src/uiPresentationCore.ts` がworkspace + experience profile別のUI設定を扱う。checkpointやcanonical JSONへ保存しない。古いscopeの書込みは拒否し、保存失敗後もキューを利用できる。
- 質問の推薦順はキャラ会話（画像ありなら演出）、管理系または詳細管理、それ以外は物語。既存選択があれば保持する。明示的な上書きのみ更新する。
- Genesisの既存設定適用が成功した後に初期表示を保存する。プレビュー/キャンセルでは保存しない。表示切替からAIや画像生成を呼ばない。
- 表示切替は既存DOMを作り直さず、入力と選択値を維持する。履歴は見えていたメッセージを基準に位置を調整する。確認ダイアログ中は表示選択を停止する。
- 会話専用/無効なCommerceでは新しい行動ボタンと資源ストリップを表示しない。既存profileによる機能非表示を解除しない。

## 検証結果

- Test Console first: `plan --base e42990c297685ffc248953d59b6a67edd04b28df` → `run --plan ...`。最終実装で **30/30、focused 28/28、unknown 0**。compile、registry、i18n、HTML、responsive、Genesis、Commerce周辺を含む。Mediumに合わせ、ローカルfull suiteは実行していない。
- 実Webview: 3表示 × 5幅。DOM実測は1439 / 960 / 959 / 719 / 389 CSS px。root横スクロールなし、未送信入力保持、切替によるゲーム状態変更なし。[DOM証跡](ui-play-presets-v1/after-dom.json)。境界960/959で既存drawerへ切替。
- 実Action Hubの開閉: 表示切替禁止、閉じた後の「行動する」へのフォーカス復帰。演出の履歴展開。panel reopenと実Host reloadで保存した演出表示を復元。
- Genesis最終確認: 管理への即時プレビュー、キャンセル後に元の表示を維持。Host inspection差分なし。
- 実Hostの既存lifecycle: Commerce 3操作、read-only preview、duplicate receipt、完全checkpoint restore、epoch失効、reopen/reload、旧handle拒否が成功。
- Parlor / In-World / 機能OFF Campaign: 各3表示で不要なCommerce入口と資源欄なし、ゲーム状態不変。ライト/高コントラストは実VS Code theme classも照合。[DOM証跡](ui-play-presets-v1/variants-dom.json)。
- **残った既存問題:** 実Webviewの取引プレビューは成功するが、確定すると `outcome_unknown / unknown` を表示し、fixtureの残高は20のままだった。新しい行動入口と、未変更 #104 の既存Action Hub経路で同じ結果を観察した。[改善後の結果](ui-play-presets-v1/trade-dom.json)、[旧実装の結果](ui-play-presets-v1/before-trade-dom.json)、[実画面](ui-play-presets-v1/after-trade-result.png)。checkpoint保存を先に行う条件でも同じ。既存API lifecycleの成功でこのUI失敗を相殺しない。原因の修復は本PRでは行っていない。

## 証拠の取得方法と残った範囲

既存 `scripts/run_live_extension_qa.js` の隔離workspace・user-data・extensions所有権を使った。追加したフックはテストプロセス内だけの依存注入であり、QA IPC/CLIの操作語彙を増やしていない。一時的なPlaywrightは実Electronへのlocalhost CDP接続とDOM操作/画面取得にのみ使用した。別Chromiumで再現した画面ではない。Playwrightを製品依存に追加していない。

画像の周囲にあるExplorer・Chat・拡張無効化通知は実VS Codeの外枠。これをLoreRelay自身のUIとして評価していない。全画面のスクリーンショットと限定DOMの結果を併用した。

旧UIの取引比較ではWorldタブをキーボードで選び、折りたたみ内部の既存ボタンへDOM clickイベントを送り、同じ実Action Hubを開いた。これは処理経路の比較であり、旧入口のマウス操作成功を意味しない。旧入口は閉じた後のフォーカスも復帰できなかった。新入口では通常のクリックとフォーカス復帰を確認した。

長期の通常プレイ、全ジャンル背景/立ち絵の組合せ、スクリーンリーダー、OS倍率の全組合せは未確認。AIを呼ぶGenesis適用の一連の体験は自動実行していない（推薦と保存成功/失敗境界はfocused test、プレビュー/キャンセルは実画面）。既存キャラクター編集の細かな低コントラスト要素・アイコン表現には今後の整理余地が残る。これらに未観察の成功判定を付けない。
