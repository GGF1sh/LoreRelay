# ブラウザのAIで準備してLoreRelayを始める

Windows用。VS Codeと、この機能に対応したLoreRelay 1.90.0以降を先に導入してください。接続するAIはPCの既存設定を使います。ランチャーはインストールやAPIキーの設定を行いません。

## 使い方

1. `LoreRelay_Start.bat`を開き、「AIに貼る説明をコピー」を押します。ブラウザのAIへ貼り付け、【私の希望】を書き換えて送信してください。LoreRelayのゲーム画面を先に開く必要はありません。
2. AIが返したJSONをダウンロードします。またはJSONコードブロックをコピーします。
3. ダウンロードしたJSONをBATへドラッグするか、ランチャーの「JSONファイルを選ぶ」で開きます。コピーした場合は入力欄へ貼り付けてください。
4. 「冒険を開始」を押します。新しい冒険フォルダを作り、VS CodeでLoreRelayを開きます。VS Codeの信頼確認が表示された場合は、内容を確認して続けてください。

保存先はランチャー配下の`Adventures/<日時>-<一意の番号>`です。次回はそのフォルダをVS Codeで開くと続きから遊べます。同じJSONをBATへ渡すと、別の新しい冒険になります。

設定・世界観・主人公・導入を一つのJSONで渡せます。主人公は`scenario.setup.playerCharacter`から登録されます。世界観と遊び方・文体は固定のLorebook項目として保存し、通常のGM文脈にも渡します。導入の選択肢を選ぶ前にGMへ通信することはありません。画像・音声の自動生成も起動時には無効にします。人物、地理、音声・画像素材の詳細ファイルは初版では受け付けません。

## AIへ渡す資料

すべて[resources/browser-start](../resources/browser-start/)にあります。

- [AIに貼る説明.txt](../resources/browser-start/AIに貼る説明.txt)：希望欄、判断基準、設定の辞書、完成例を一つにまとめた貼り付け用テキスト。
- [settings.schema.json](../resources/browser-start/settings.schema.json)：受け付けるキー、型、範囲、選択肢、既定値と効果。
- [settings.guide.json](../resources/browser-start/settings.guide.json)：推奨基準、設定の効果と依存関係。編集する正本。
- [settings.presets.json](../resources/browser-start/settings.presets.json)：軽量、会話、探索、交易の設定例。
- [example.json](../resources/browser-start/example.json)：そのまま起動できる例。

AIはschemaにある設定だけを提案できます。接続先・モデル・APIキー・コマンド・パスは入力できません。変更は新しい冒険のワークスペースだけに適用し、グローバル設定や既存セーブは書き換えません。省略したゲームルールは通常の既定値、演出設定はPCの既存値を使います。推奨理由は冒険フォルダの`recommendations.json`に保存されます。

## エラーになった場合

- JSONだけ、または単独のJSONコードブロックを渡してください。前後の説明文、不正な値、未知のキー、未対応の形式バージョンは受け付けません。入力は256 KiBまでです。
- ランチャーはJSON構文と形式名を確認します。拡張は全体の設定を検証してから冒険を初期化します。エラーは該当項目名とともにVS Codeへ表示され、入力ファイルは残ります。
- 初期化途中で停止・失敗した場合は、自動でやり直してセーブを上書きしません。修正したJSONをランチャーへ渡し、新しいフォルダで開始してください。
- VS Codeが見つからない場合は、標準インストール先かPATHを確認してください。VS Codeだけ開いてLoreRelayが出ない場合は、拡張が1.90.0以降で、有効になっているか確認してください。

## 開発時の更新と確認

`npm run compile`後に`npm run browser:kit`で辞書・プリセット・例・貼り付け用テキストを再生成します。`npm run browser:kit:check`で差分を確認できます。設定の型・既定値は`package.json`とゲームルール正本から取得し、数値範囲は既存の正規化処理に合わせます。

ランチャーだけを配る場合は、BAT、`scripts/start_browser_adventure.ps1`、`resources/browser-start`、この使い方を同じ構成で渡してください。拡張の更新とランチャーの配布は別です。
