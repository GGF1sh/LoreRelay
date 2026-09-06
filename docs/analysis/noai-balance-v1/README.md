# 評価証跡と再現

本文は[NOAI世界のバランス評価](../NOAI-WORLD-BALANCE-EVALUATION-V1.md)。固定mainは`89f109a236660f110fdee375bb4d6368465f4390`。
通常campaignを入力にしない。生成されるfixtureには公開済みの同梱サンプルだけを使用する。

`observations.json.gz`はUTF-8 JSONのgzip。各runにscenario、worldTurn付きframes、既存不変条件の結果を含む。
Hostのpreview handle・元request IDは公開データから除き、結果classificationと観測stateを残した。
`*.log.gz`は実行ログ。ローカルcheckout・一時Hostルートは置換した。失敗ログは成功証跡ではない。

グラフは`plot.py`でこの記録を読むだけで再生成できる。matplotlibを評価用Python環境に入れ、`python docs/analysis/noai-balance-v1/plot.py`を実行する。ゲームにPython依存はない。生成画像はPNG/SVGの両形式。

## 再計測する場合

新しい専用checkoutを使い、`npm ci`・`npm run compile`後に実施する。通常のチェックアウトを上書きしない。
評価用ラッパーは既存runnerへの引数とfixture作成・inspectionだけで、独自ゲーム計算は含まない。
以下はPowerShell、repo rootでの手順。各群は一回だけ実行し、結果が既にあれば再利用する。

```powershell
New-Item -ItemType Directory -Force .test-runs | Out-Null
Copy-Item docs/analysis/noai-balance-v1/reproduce/*.cjs .test-runs/

# 既存full：determinismケースの指定反復を除き一回
node scripts/run_noai_soak.js --mode full --observe-balance

node .test-runs/create-matrix.cjs
$env:NOAI_SOAK_SCENARIO_DIR=(Join-Path (Get-Location) '.test-runs/matrix')
node scripts/run_noai_soak.js --mode full --observe-balance

node .test-runs/create-biomes.cjs
$env:NOAI_SOAK_SCENARIO_DIR=(Join-Path (Get-Location) '.test-runs/biomes')
node scripts/run_noai_soak.js --mode full --observe-balance

# 疑いのあった条件だけ延長
node .test-runs/create-extensions.cjs
$env:NOAI_SOAK_SCENARIO_DIR=(Join-Path (Get-Location) '.test-runs/extensions')
node scripts/run_noai_soak.js --mode full --observe-balance
node .test-runs/create-conflict.cjs
$env:NOAI_SOAK_SCENARIO_DIR=(Join-Path (Get-Location) '.test-runs/conflict')
node scripts/run_noai_soak.js --mode full --observe-balance
Remove-Item Env:NOAI_SOAK_SCENARIO_DIR
```

`--observe-balance`はrun専用一時workspaceを保持し、`balance.json`を追加する。既定実行では生成しない。既存のreport.jsonとcanonical hashは同じ計算を使う。
worldTurnごとの最初の状態だけを記録するため、同じworldTurnの中での全売買イベントを追うログではない。最大1001状態、超過時は`truncated`。300/1000比較では該当worldTurnまでを切り出す。

## 実Host

ローカルVS Codeのインストール先を`LORERELAY_QA_VSCODE`へ指定するか、既存runnerのダウンロード動作を利用する。既存runLifecycleが隔離ディレクトリ・IPC・終了処理を管理する。並行してcompileやoutの書換えをしない。

```powershell
# 実際の自分のインストール先を指定
$env:LORERELAY_QA_VSCODE='F:/Microsoft VS Code/Code.exe'
node scripts/run_live_extension_qa.js --scenario lifecycle_v1
node .test-runs/host-relations.cjs
node .test-runs/host-short.cjs
```

`host-relations`はON/OFF×3回。seedは乱数入力ではなくreplicationラベル。既存のcaseファイルは再実行しない。未確定receiptではそのケースを止め、同じ操作を再試行しない。`status: observed`は全日成功を意味せず、receiptとframesを確認する。
今回OFF cは失敗後snapshot保存を足す前に停止し、ログのみ。ON cは失敗直後のsnapshotを保存できた。この差を本文に記載した。

同梱の`package-evidence.cjs`は今回のログ名を前提とした集約記録。再利用するなら上記の各実行を対応する`.test-runs/{matrix,biomes,extensions,conflict,host-relations,host-relations-on,host-short,host-lifecycle}.log`へ保存する。既存公開証跡を再計測結果で無断置換しない。

## 証跡の制限

- 初期の既存runは追加記録にactionCountsが入る前のものもある。主比較のmatrix・延長runは入っている。
- 15 biomeの同一性はbiome以外を固定した継続tickについて。生成時hazardの分布の同一性は主張しない。
- 既存NOAI runnerの成功と実Hostの成功を混ぜない。raw telemetryのcashや決定数を世界ターン／純利益と読み替えない。
- 本番の数値・仕様の調整は今回行っていない。Human Playと公開情報だけのPlayer Agent評価は未実施。
