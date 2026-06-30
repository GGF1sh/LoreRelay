# Webview 右タブ空白インシデント — ポストモーテム

LoreRelay（VS Code 拡張）の Webview で、右側ステータスパネルのタブ切り替えが「冒険ステータス」以外で真っ黒になる不具合の調査記録です。公開リポジトリ（[GGF1sh/LoreRelay](https://github.com/GGF1sh/LoreRelay)）で同様の症状に当たった開発者・AI コラボレーター向けに、真因・誤診の経緯・診断手順・再発防止をまとめています。

**関連ファイル:** `webview/index.html` · `webview/modules/40-dice-calc-tabs.js` · `webview/styles/30-status-gallery.css`

---

## 1. インシデント概要

| 項目 | 内容 |
|------|------|
| **期間** | 2026-06 下旬（v1.7.x 開発中） |
| **症状** | タブボタンのラベルは `active` に切り替わるが、キャラクター / ワールド / インスペクター等の pane 中身が真っ黒（空白） |
| **例外** | 「冒険ステータス」タブだけは常に正常表示 |
| **真因** | `index.html` の `#theme-header` 閉じ `</div>` 欠落 → ブラウザが後続 pane を `#pane-status` の子孫としてネスト |
| **修正** | `#theme-header` を正しく閉じ、各 `.tab-pane` が `#status-area` の直下兄弟になるよう DOM を復元 |

---

## 2. 症状の詳細

ユーザー視点:

1. 右パネルで「キャラクター」等をクリックする
2. タブボタンはハイライトされる（JS は動いている）
3. コンテンツ領域だけ真っ黒 — テキストも UI も見えない
4. 再度「冒険ステータス」を選ぶと表示が戻る

技術的には **「表示ロジックは成功しているが、レイアウト上の表示領域が 0×0」** という状態でした。

---

## 3. 真因 — DOM ネストの崩壊

### 3.1 期待される構造

```text
#status-area
  #status-tabs          （タブボタン行）
  #pane-status          （.tab-pane — 冒険ステータス）
  #pane-character       （.tab-pane — 兄弟）
  #pane-inspector
  #pane-world
  … 他の .tab-pane もすべて #status-area 直下
```

タブ切り替え（`activateStatusPane`）は `#status-area .tab-pane` に `.active` を付け替え、非 active は CSS で `display: none` にします。**兄弟の tab-pane 同士**であれば、active な pane だけが表示されます。

### 3.2 壊れていた構造（閉じタグ欠落時）

`#theme-header` の `</div>` が欠けていたため、パーサーは後続ブロックをすべて `#pane-status` の内側に飲み込みました:

```text
#status-area
  #status-tabs
  #pane-status                    ← display:none になると子孫ごと非表示
    #status-content, dice, bgm …
    #theme-header                 ← ここで閉じられていなかった
      #archive-suggest-banner
      #summary-container
      #pane-character             ← 本来は兄弟であるべき
      #pane-world
      …
```

### 3.3 なぜ「冒険ステータス」だけ動いたか

- `#pane-status` が `.active` のとき → 自身は `display: flex` → 中身（ネストされた他 pane 含む）も DOM 上は存在
- 別タブを active にすると → `#pane-status` が `display: none` → **その子孫である `#pane-character` 等もまとめて非表示**
- `#pane-character` 自体に `.active` が付いても、**非表示の親の中**にあるため描画サイズ 0×0

これが「ラベルだけ active、中身は真っ黒」の正体です。CSS の `!important` や JS のバグではなく、**HTML 構造の問題**でした。

### 3.4 修正の要点

`webview/index.html` で `#theme-header` を閉じ、`#pane-character` 以降の `.tab-pane` が `#status-area` 直下に並ぶことを確認します。

```html
      <div id="theme-header">
        …
      </div>   <!-- ← この閉じタグが欠落していた -->

      <!-- archive / summary は pane-status 内で OK -->
      …

      </div> <!-- /pane-status -->

      <div id="pane-character" class="tab-pane">
```

---

## 4. 誤診（レッドヘリング）と学び

複数の AI（Grok 含む）と開発者が、真因の前に以下を疑い修正しました。いずれも **DOM ネストを変えない** ため根本解決にはなりませんでしたが、別問題の改善や調査の足がかりにはなりました。

| 仮説 | 実施した対策 | なぜ効かなかったか |
|------|-------------|-------------------|
| CSS `!important` と inline `display` の競合 | JS で `.active` と `style.display` を両方同期 | pane は見つかるが親が `display:none` のまま |
| タブ横スクロールの `setPointerCapture` | capture 除去、document レベル追跡 | クリック改善はするがネスト問題は残る |
| `#status-area` の scrollTop 残存 | 切替時に scrollTop 0、overflow 整理 | スクロール位置問題は別症状；ネスト時は 0×0 |
| CSS Grid で pane を重ねる | grid レイアウトへ変更 | ネストされた pane は依然として親非表示の影響 |
| Webview アセットのディスクキャッシュ | `asWebviewUri` に `?v=mtime` 付与 | 古い JS が残る問題は別；HTML 構造バグは HTML 側 |
| VSIX が古いバージョンを再インストール | インストーラーで現行 version を明示 | 配布問題；ソース HTML が壊れていれば再現する |

### AI / 人間が DOM バグを見逃しやすい理由

1. **JS は「成功」に見える** — `getElementById('pane-character')` はネストされていても要素を返す。`classList.toggle('active')` もエラーにならない。
2. **症状が CSS バグと酷似** — `display:none`・`overflow`・`0×0` はスタイル調査に引きずられる。
3. **一部タブだけ正常** — 「冒険ステータスだけ OK」は scroll 仮説と整合し、pane ネスト仮説を後回しにしやすい。
4. **ソースのインデントが正しく見える** — エディタ上の見た目とブラウザが構築する DOM は一致しない（閉じタグ 1 個で全体が変わる）。
5. **Webview DevTools への到達が難しい** — VS Code 本体の DevTools と混同しやすい（後述）。

**教訓:** 「タブの JS/CSS を直す」前に、**Elements パネルで `#pane-xxx.parentElement` のチェーン**を確認する。

### 4.1 Claude（AI アシスタント）が見逃した具体的な経緯

このインシデントでは Claude Code（claude-sonnet-4-6）が長時間デバッグに関与したが、真因にたどり着けなかった。その経緯を記録する。

**何をしたか:**

1. `setPointerCapture` がクリックを奪っていると判断 → 削除（別問題の修正として有効）
2. CSS `!important` vs inline `style.display` の競合と判断 → JS で `.active` クラスと `style.display` を両方同期
3. Webview Chromium がアセットをキャッシュしていると判断 → `?v=mtime` キャッシュバスター追加
4. `requestWorldData` → `loadWorld` メッセージ型修正

どれも `webview/modules/40-dice-calc-tabs.js` と `src/extension.ts` の修正であり、**`webview/index.html` を一度も読まなかった**。

**なぜ `index.html` を開かなかったか:**

- ChatGPT の前回修正コミット（`a0eb578`）も JS/CSS への対処だったため「HTML は既にチェック済み」という暗黙の前提が生まれた
- `getElementById('pane-character')` がエラーなく要素を返すため、「要素は存在する」と判断した（ネストされていても返ってくることを見落とした）
- `0×0 / display:flex` という DevTools 結果を「CSS `!important` が inline style を上書きしている」と解釈した。実際は「非表示の親の中にいる」が正しかった
- 「冒険ステータスだけ動く」という症状を「このタブだけ scroll 処理が違う」と解釈し、DOM 構造の差異（最初の pane か否か）に気づかなかった

**どこで気づくべきだったか:**

| 手がかり | 正しい解釈（見逃した） |
|---------|----------------------|
| `p.offsetWidth === 0` かつ `display:flex` | **親が `display:none`** → DOM ネストを疑う |
| 「最初のタブだけ OK」という再現性 | 最初の `.tab-pane` が親 pane 本体、後続が子孫 |
| JS の修正後もまったく改善しない | ロジック層の問題ではなく **構造層** の問題 |

**AI コラボレーター向け教訓:**

- Webview デバッグで「JS は通っているのに表示されない」場合、**次のアクションは `index.html` を読むこと**
- `querySelector` / `getElementById` の成功はネストを保証しない
- 「最初の要素だけ正常」は「それが親で他が子孫」のサインである

---

## 5. 診断手順（再現時にやること）

### 5.1 Webview Developer Tools を開く

| やり方 | 備考 |
|--------|------|
| コマンドパレット → `Developer: Open Webview Developer Tools` | **推奨** — LoreRelay パネルにフォーカスしてから実行 |
| `Ctrl+Shift+I` | チャット拡張等に奪われがち。LoreRelay の DOM は出ない |

メインウィンドウの DevTools に `codicon` や Extension Host ばかり出る場合は、**Webview 専用**の DevTools が開けていません。

### 5.2 Elements で親チェーンを確認

コンソールで:

```javascript
const p = document.getElementById('pane-character');
console.log(p?.className, p?.offsetWidth, p?.offsetHeight);
let el = p;
while (el) { console.log(el.id || el.className, getComputedStyle(el).display); el = el.parentElement; }
```

**判定:**

| 観測 | 意味 |
|------|------|
| `pane-character` の親が `pane-status` | **DOM ネストバグ**（本インシデントと同型） |
| `offsetWidth/Height === 0` かつ祖先に `display: none` | 親 pane が非 active のまま子が active |
| 親が `status-area` でサイズ正常 | JS/CSS・データ未取得・キャッシュ等を疑う |

### 5.3 ソースとの照合

`webview/index.html` で次を確認:

- 各 `id="pane-*"` が `</div> <!-- /pane-status -->` **より後**（character 以降）にあるか
- `#theme-header` に対応する `</div>` があるか
- `npm run build:webview` 後に VSIX 再インストール or ウィンドウリロード（キャッシュバスターは v1.7.x で導入済み）

---

## 6. 再発防止

### 6.1 自動検証（CI / `npm test`）

```bash
node scripts/validate_webview_html_structure.js
```

`#status-area` 直下に次の tab-pane が **直接の子**として並ぶことを検査します:

`pane-status`, `pane-character`, `pane-inspector`, `pane-world`, `pane-lorebook`, `pane-memory`, `pane-director`, `pane-party`, `pane-ooc`

### 6.2 HTML 編集時のチェックリスト

- [ ] `index.html` を編集したら `npm test` を実行
- [ ] 大きな `</div>` コメント（`<!-- /pane-status -->` 等）を増減したら DevTools で親チェーンを確認
- [ ] タブ関連の CSS/JS だけを疑う前に DOM を見る
- [ ] `npm run build:webview` → 拡張リロードで動作確認

### 6.3 コードレビューで見るポイント

- `#status-area` 内の **ブロック追加**（theme, archive, summary 等）は `pane-status` の閉じ位置を壊しやすい
- `querySelectorAll('#status-area .tab-pane')` は **子孫**セレクタ — ネストされていても「見つかる」ためテストにならない
- 回帰テストは **HTML 構造アサーション**が有効

---

## 7. 関連コミット・CHANGELOG

詳細な変更履歴は `CHANGELOG.md` の `[Unreleased]` を参照してください。要点:

- **真因修正:** `#theme-header` 閉じタグ、`#status-area` 配下の兄弟 pane 構造の復元
- **レッドヘリング:** scrollTop リセット、`overflow` 整理、CSS Grid オーバーレイ（構造未修正のため単独では不十分）
- **配布:** Webview アセットのキャッシュバスター、VSIX インストーラーの現行版固定

---

## 8. 参考 — タブ切り替えの実装

ロジック本体: `webview/modules/40-dice-calc-tabs.js` の `activateStatusPane()`。

- `#status-tabs` への click 委譲で `data-target` を読み取り
- `#status-area .tab-pane` の `.active` を付け替え
- `pane-character` / `pane-world` 選択時に `postMessage` でデータロード

**前提:** 各 `.tab-pane` が `#status-area` の直下にあり、非 active 親の中に active 子がないこと。

---

## 9. まとめ

| やること | 理由 |
|----------|------|
| まず DOM の親チェーンを見る | JS/CSS が正常でも HTML 1 行で全滅する |
| Webview 専用 DevTools を使う | ワークベンチ DevTools では `#app` が見えない |
| `validate_webview_html_structure.js` を test に入れる | セレクタや目視ではネストを検知しにくい |
| レッドヘリングを CHANGELOG に残す | 次の調査者が同じ迂回をしない |

不具合報告・PR 歓迎: [Issues](https://github.com/GGF1sh/LoreRelay/issues)