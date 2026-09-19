# 接続点レビューとComfyUI実機確認

基準: `4e3b2b99d5120bfc99c53c2218d091243b529c58`、1.89.1。実装: 1.89.2。既存セーブを使わず、専用の航路デモ世界とハルカで確認。大型機能追加、記憶基盤交換、配布・タグ作成は対象外。

Version decision: **patch — 1.89.1 → 1.89.2**。画像連携の修正と現行手順への文書更新。ソースの更新は配布VSIX・ユーザーが起動している拡張の更新を意味しない。

## 接続を一巡した結果

| 接続 | 根拠・今回の扱い |
| --- | --- |
| 世界作成 → 採用 → 開始 | World Genesisの既存保存・rollback検証を利用。Start Hub主ボタンと4言語READMEを一致させた。新しいAI GM応答までは今回未確認 |
| 行動 → 資産・履歴 | 既存Action Hub／commerceの確定処理・回帰検証を参照。描写だけを取引確定とは扱わない。今回新しい取引不具合は特定していない |
| クエスト → NPC → 条件・報酬 | `completeResolvedQuestHooks` とaccepted `resolvedQuests` を確認。報酬ヒントだけで金品が増えるとはREADMEで約束しない |
| 移動 → 船・拠点・現在地 | #146の停泊先同期とwater-navigation host検証を利用。実画面で川船と主人公が `port → delta → port` を往復し、場所候補は移動先で非表示・帰還で再表示。移動拠点の新規実機試遊は未実施 |
| 施設・車両 → 画像 → GM | 設計図・参考PNG、完成画像、実施設を分ける既存設計を維持。拠点イラストの外部AI実生成・設計との一致は未確認 |
| Undo・世界切替・再開 → 遅延画像 | 今回の重点。deferred subprocessでtimeline・workspace変更、対象編集／画像差替え、キャンセル後の新ジョブ、失敗出力を検証。場所候補は別worldKeyへ出さない |
| 長いプレイの情報予算 | 既存prompt budget・priority／pin処理、120ターン規模の `test_settlement_prompt_bloat_long_session.js` を利用。実際の長時間GM会話の品質保証とは分ける |

既存コードと該当検証で新規不具合を特定しなかった接続は今回閉じる。中央バックログの古い未完了表示を、そのまま再実装指示とは扱わない。

## 根拠のある修正

| 再現操作 | 期待／実際 | 該当コード・最小修正 |
| --- | --- | --- |
| 新しいプレイフォルダで画像を生成 | 同梱スクリプトで動く／旧PC固定パスを使い、人物の採用レシートが返らない | `package.json` の `skillPath` 既定値を空欄へ、`resolveComfyScript` に同梱探索。明示overrideは保持 |
| Windowsの小文字 `c:` のHostから大文字 `C:` を返すPython結果を取り込む | 同じルート内PNGを受理／人物・地図が配下外として拒否 | `mediaPathCore`、`cartographyPathCore` の `path.relative` による境界判定。兄弟ディレクトリ・別ドライブ・symlinkは引き続き拒否 |
| 「この場所の画像」を生成後、ワールドを開き直す | 同じ場所の候補を表示／ファイルだけ残り一覧に結び付かない | `locationImageCandidates` の表示専用receiptと `worldView` の読込。保存側も `parseWorldForge` 後のworldKeyを使い、座標の丸め差を解消 |
| 生成待ち中に移動・Undo・世界切替・対象編集 | 元の対象にだけ返る／完了時の場所へ誤って結び付く | `imageGenRunner` がworkspace／scope／epoch／world／entry snapshotと来歴を保持。古い完了は新ジョブを消さず、対象変更後は採用しない |
| 分割されたstdout／出力なしの成功終了／再試行 | 有効PNGだけ採用し、実行中は重複しない／不完全なパスや終了コードだけで成功扱い | stdoutをまとめてパス判定、実ファイル・許可ルート確認、ターン境界でもpending dedup維持 |

## 確認の範囲

- 実機: ComfyUIで情景・人物・地図・場所画像を生成し、実Extension Host/Webviewで保存・表示を確認。[設定・生成物・計測・画面](../COMFYUI_LOCAL_PLAYCHECK.md)。通常ユーザーのセーブ・モデルは変更していない。
- 独立レビュー: 画像結果の採用・保存・再同期・遅延結果に限定。新accepted turnはcanonical保存を参照してhistory watcher前でも投入し、両方に無いstream候補はenqueue成功にしない。過去エントリは保存済み来歴を優先。2指摘の修正に加え、watcher前のcanonical画像差替え・history採用不能時の成功誤報をfocused harnessで確認した。
- リスク: **High**。プロセス実行、共有メディアパスの許可境界、非同期結果の保存を変更するため。
- 最終実行コード: `npm run compile`、`node scripts/test_image_gen_runner_context.js` 成功。`node scripts/run_all_tests.js` は398/399、戦闘736/736成功。唯一の未完走は `test_test_console.js` の120秒timeoutで、同じコードを単体実行して52/52成功。全体の再実行はしていない。変更前の実行コードでも全体399/399成功済み。
- 文書: UTF-8、バージョン整合性、変更文書の相対リンク324件を確認。Symbol Registryを再生成。GitHubのexact-headチェック結果と最終SHAはPRに記録する。
- 未確認: 外部AIでの新規画像生成、AI GMとの新規会話、長時間の人間プレイ、ローカルLLM／動画との同時実行、配布VSIX。キャンセル後のComfyUIサーバー側停止は保証していない。

意図した分離: 画像から施設・報酬・世界状態を自動で増やさない。生成済み場所候補はUndo後も同じ世界・同じ場所の表示資料として残るが、GM記憶へ逆流しない。
