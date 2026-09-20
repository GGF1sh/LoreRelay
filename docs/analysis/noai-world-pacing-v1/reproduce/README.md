# 再現手順

このディレクトリは既存runnerの合成fixture作成と検証呼出しの記録。新しいQA API/シミュレーターではない。通常campaignには使わない。

1. 本リポジトリの依存関係を準備し、`npm run compile` を実行する。
2. 再現したい `.cjs` をリポジトリ直下の `.test-runs` へコピーし、リポジトリをcwdとして実行する。スクリプトの相対パスはこの配置を前提とする。
3. `create-pacing-matrix.cjs` を実行。PowerShellで `$env:NOAI_SOAK_SCENARIO_DIR=(Resolve-Path .test-runs/pacing-matrix).Path` として、`node scripts/run_noai_soak.js --mode full --observe-balance` を実行すると18ケースを計測する。
4. `create-pacing-extra.cjs` → `pacing-extra` は個別上書き6、供給改善2、不足延長1ケース。同様に `create-supply-surplus.cjs` → `pacing-surplus` は生産をさらに増やした2ケース。`create-stock-extension.cjs` → `pacing-stock-extension` は余剰在庫の1000ターン延長1ケース。無変更の計測を繰り返す必要はない。
5. 実Host用は既存 `run_live_extension_qa.js` を使う。`LORERELAY_QA_VSCODE` にVS Code実行ファイルを指定する。起動領域・設定・拡張はrunnerが専用tempへ隔離する。
6. `pacing-live.cjs` は設定と売却支援、`pacing-npc-live.cjs` は120世界ターン、`pacing-stock-live.cjs` は既存操作を通した60世界ターンの在庫照合。
7. UI観察スクリプトのPlaywrightパスは、この環境にあった既存検証用インストールを参照している。別環境ではそのパスだけを手元のPlaywrightへ置き換える。通常のユーザーVS Codeやcampaignへ接続しない。CDPは隔離Hostのlocalhost:9340に限る。reload時のOOPIF捕捉にはreload前から同じ接続を保持する。

結果は `.tmp/noai_soak/<scenario>/<run>/balance.json` と `report.json`、実Hostは `.test-runs/pacing-*.json/log` に保存される。失敗はその場で止まり、同じ操作を自動再送しない。`package-pacing.cjs` は既存の検証出力をまとめるだけで、ゲームを実行しない。報告用画像の `../plot.py` はmatplotlibを利用し、記録済みデータを描画する。

前回評価の66ケースは別の `noai-balance-v1` に保持している。以前と同じデータを再取得していない。圧縮データには合成worldのQA情報が含まれ、公平なPlayer-only判断の証拠には使えない。
