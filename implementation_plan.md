# LoreRelay v0.3.0: SillyTavern Integration Plan (ComfyUI Settings, Quick Reply, & Message Actions)

SillyTavern の優れた UI/UX ワークフローを取り入れ、LoreRelay (v0.2.11+) の操作性・表現力を飛躍的に向上させます。
今回のフェーズ（v0.3.0）では、Grokの提案およびユーザーの動作観察（画像 #1〜#3）を全面的に反映し、以下の3つの機能を統合した実装計画を策定します：

1. **【Phase ST-A】画像生成のライブ設定 & テンプレート化** (CWD配下の `image_gen_config.json` 優先読込)
2. **【Phase ST-B】チャット入力上の Quick Reply ショートカットバー**
3. **【Phase ST-D】各メッセージ単位のインライン・アクションボタンバー (新設)**

---

## User Review Required

> [!IMPORTANT]
> - **メッセージ操作バー (Phase ST-D)**: Webviewの各メッセージ（ナラティブ/プレイヤー行動）のヘッダー右側に、画像 #3 を参考にしたアイコンボタン列を新設します。
> - **メッセージのインライン編集**: メッセージ横の「編集（鉛筆）」アイコンを押すと、そのメッセージがテキストエリアに切り替わり、直接内容を修正して保存できるようになります（`game_state.json` の該当 entry.content を上書き保存し、UIを更新）。
> - **ブランチ作成 (ストーリー分岐)**: メッセージ横の「ブランチ（分岐）」アイコンを押すと、現在のセッションをそのターンの直後に巻き戻し、新しい歴史として分岐スタートできるようになります（`rewindToTurn` 処理の流用・拡張）。

---

## Open Questions

> [!IMPORTANT]
> 1. **メッセージ除外 (`excludedFromPrompt`) の表現**:
>    * メッセージ横の「プロンプトから除外（斜線付きの目）」ボタンを押した際、そのメッセージのUI上の視覚効果はどうあるべきでしょうか？
>    * *(推奨案)* 完全に消去するのではなく、半透明（`opacity: 0.4`）にして「プロンプトから除外されていること」が視覚的にわかるようにします。
> 2. **ファイル/画像の埋め込み**:
>    * メッセージ横の「添付（クリップ）」アイコンの仕様は、本フェーズでは低優先として枠組み（ボタンUIのみ、またはテキストとしてのファイルパス挿入）に留めるか、実処理（画像のアップロード等）まで実装するか、どちらが良いでしょうか？
>    * *(推奨案)* C2の背景ギャラリー等とも連動するため、本フェーズではUI表示のみ、または簡素なローカルファイルパス挿入のみに留め、本格実装は次期フェーズに回すことを提案します。

---

## Proposed Changes

### Component 1: Image Settings & Templates (Phase ST-A)
Webview から直接 ComfyUI パラメータやプロンプトテンプレートを変更し、ゲームごとに独立した画像生成環境を構築できるようにします。

#### [MODIFY] [comfyui_generate.py](file:///c:/AI/TextAdventureGMSkill/scripts/comfyui_generate.py)
* 起動時に `os.path.join(os.getcwd(), 'image_gen_config.json')` を検索し、存在すれば JSON パラメータ（モデル名、解像度、ステップ数、CFG、ポジティブprefix、ネガティブプロンプトなど）をワークフローへ最優先で注入します。

#### [MODIFY] [extension.ts](file:///c:/AI/text-adventure-vsce/src/extension.ts)
* Webview からの `updateImageGenSettings` を受け取り、`image_gen_config.json` をワークスペース直下に書き出す処理を追加します。

#### [MODIFY] [script.js](file:///c:/AI/text-adventure-vsce/webview/script.js) & [style.css](file:///c:/AI/text-adventure-vsce/webview/style.css)
* UI ヘッダーに「ギア型アイコン（Image Gen Settings）」を追加。クリックすると Glassmorphism 調のサイドパネルがスライドインし、各パラメータを直接編集・自動保存（フォーカスアウト時）できるようにします。

---

### Component 2: Quick Reply Bar (Phase ST-B)
チャット入力欄の直上に、浮遊感のある半透明のクイックボタンバー `<div id="quick-reply-bar">` を設置します。

#### [MODIFY] [index.html](file:///c:/AI/text-adventure-vsce/webview/index.html) & [style.css](file:///c:/AI/text-adventure-vsce/webview/style.css)
* 入力ボックスの上に横スクロール可能なボタン列を配置。
* 標準ボタン: `⏪ Undo` / `🔄 Retry` / `💾 Checkpoint` / `📝 Summary` / `🎨 Gen Image` / `📂 Load Pack`

---

### Component 3: Message-Level Action Bar (Phase ST-D) [NEW]
画像 #3 の仕様に基づき、各メッセージのヘッダー右側にアイコンボタンバーを追加します。

```
[メッセージヘッダー: 惑星ザエラ 2026年2月12日 01:56]   [🎨] [📢] [👁️] [📎] [🚩] [🔱] [📄] [✏️]
----------------------------------------------------------------------------------
メッセージ本文...
```

#### [MODIFY] [GameState.ts](file:///c:/AI/text-adventure-vsce/src/types/GameState.ts) & [game_state_schema.json](file:///c:/AI/text-adventure-vsce/game_state_schema.json)
* `GameEntry` 型に `excludedFromPrompt?: boolean` (プロンプト除外フラグ) および `editedAt?: string` (編集日時) を追加します。

#### [MODIFY] [script.js](file:///c:/AI/text-adventure-vsce/webview/script.js)
* `renderMessage()` 内で、メッセージコンテナのヘッダーにインラインアクションバーを動的に追加します。
* 各ボタンの機能実装:
  * **🎨 画像生成**: そのターンの `entryId` を指定して画像生成/再生成を要求。
  * **📢 語る (TTS)**: すでに実装済みの Web Speech API `speakText(entry.content)` を直接発火（このメッセージ単体の読み上げ）。
  * **👁️ プロンプト除外**: クリックで `excludedFromPrompt` をトグルし、VSCode バックエンドへ通知。UI上は該当メッセージを半透明化。
  * **📎 ファイル/画像添付**: （ボタンUIのみ配置、将来拡張）
### src/extension.ts
- ターン処理（GMの応答等）が完了し、`game_state.json` が更新された直後に、非同期で `gitManager.commitTurn(turnIndex)` を呼び出す処理を追加します。
- Webviewからの `branchTimeline` メッセージを処理するハンドラを追加します。
- `branchTimeline` が実行され、ブランチの作成に成功した場合は、VSCodeの `workbench.action.reloadWindow` を呼び出して状態を読み込み直します。

---

### src/gitManager.ts
#### [MODIFY] [gitManager.ts](file:///c:/AI/text-adventure-vsce/src/gitManager.ts)
- `branchFromTurn` 関数の安定性を向上させ、ブランチ作成成功時に `true` を返すように調整します。
- タイムラインブランチ名の命名規則を `timeline/turn_{turnIndex}_{timestamp}` のように分かりやすく変更します。

---

### webview/modules & styles
#### [MODIFY] [00-core.js](file:///c:/AI/text-adventure-vsce/webview/modules/00-core.js) (またはメッセージ描画箇所)
- メッセージごとのアクションバー（`.msg-actions`）に、「⎇ ここから分岐 (Branch)」ボタンを追加します。
- クリック時に、そのターンの `id` を含めて `branchTimeline` メッセージをVSCode拡張機能へ送信するイベントリスナーを追加します。

#### [MODIFY] [ja.json](file:///c:/AI/text-adventure-vsce/locales/ja.json)
- 追加するボタンのテキスト（例: `"webview.msg.branch": "⎇ 分岐"`）の翻訳定義を確認・追加します（一部定義済みかもしれません）。

## Verification Plan

### Automated Tests
- 既存の `npm test` を実行し、既存のセーブデータや状態管理に影響が出ていないことを確認します。

### Manual Verification
   * ボタンが崩れることなくテキスト入力欄の上部に綺麗に整列しているか、レスポンシブデザイン（横幅）を確認します。
   * `⏪ Undo` や `🔄 Retry` をクリックした際、正しく1ターン巻き戻りや再生成処理が走ることを確認します。
