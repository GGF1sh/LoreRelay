# Graphics Upgrade — 統合設計メモ（Track 1–3）

> 2026-07-04 Claude(Opus)。アイデアノート [`GRAPHICS_UPGRADE_IDEAS.md`](GRAPHICS_UPGRADE_IDEAS.md) の 1–3 を実装可能な形に落とした設計。
> **Track 4（アセット依存）は対象外。** 別トラック。

---

## 0. スコープと不変条件

対象は **Webview の見た目のみ**。以下は一切触らない：

- canonical state（`game_state.json` / `world_state.json` / `vehicle_state.json` / `settlement_*.json`）
- `turn_result` 処理・`*Ops` apply gate・GM プロンプト注入
- 永続化（アニメーションの位相・設定トグル以外は保存しない）
- 決定論の土台：**tile/diorama の「静止時の見た目」は今と1px同じ**であること。アニメーションはその上に乗る揮発レイヤーで、`prefers-reduced-motion` 時は t=0 固定＝現状と完全一致。

新規 canonical フィールドなし。ホスト側（`worldView.ts`）の payload 変更は原則不要（Track 3 の genre 適用のみ既存 `overmapThemeKey` を再利用）。

---

## 1. 共通土台：単一アニメーション駆動系（最重要）

3トラックがそれぞれ `requestAnimationFrame` ループを持つと、CPU/バッテリー浪費・停止漏れ・テスト困難になる。**1本の駆動系に集約**する。

### 新規モジュール `webview/modules/84-webview-anim.js`

`build-webview.js` のマニフェストで **83 と 85 の間**に登録（85-world が使う前に定義されるように）。

```js
// 疑似シグネチャ
window.LR_anim = {
  register(id, tickFn),   // tickFn(phase) を毎フレーム呼ぶ。phase = 経過ms
  unregister(id),
  isMotionEnabled(),      // prefers-reduced-motion + 設定トグルの AND
};
```

**駆動ルール（ここに全停止条件を集約）:**

- `prefers-reduced-motion: reduce` なら**ループを一切起動しない**（tickFn は呼ばれず、各描画は静止版にフォールバック）。
- `document.hidden`（タブ非アクティブ）でループ停止、復帰で再開。
- 登録が0件なら rAF を回さない。
- スロットル：`phase` は実時刻ベースだが、**tile は約8–12fps 相当**でしか再描画要求を出さない（水の揺らぎに60fpsは不要／64×64全描画のコストを抑える）。diorama は登録時に fps ヒントを渡せるようにする。

**設定トグル（任意・1個だけ）:** `game_rules.json` ではなく **Webview localStorage** に `lr.motionEnabled`（既定 ON）。永続化ゲート不要。i18n キーは4ロケール1組（`webview.settings.motion` 等）。
> 判断：canonical state を汚さないため localStorage を採用。既存の `worldMapMode` 永続化と同じ層。

### 決定論との関係

アニメーションは `f(seed, phase)` の純関数的な見た目揺らぎで、**状態には一切書き戻さない**。位相 `phase` は wall-clock 由来なのでフレーム間で変わるが、これは保存も GM 注入もされない揮発値なので決定論契約の外。reduced-motion で `phase` を使わなければ現状と bit-identical。

---

## 2. Track 1 — Atmosphere Pass（動き）

対象：`86-tile-overmap.js`。`drawTileOvermap()` の描画パイプに**アニメ位相を1つ差す**。

### 2.1 実装フック

`drawTileOvermap()` を「静的レイヤー」と「動的オーバーレイ」に分けず、**同関数を LR_anim の tick から呼ぶ**構成にする（全描画だが 8–12fps スロットル）。位相は `phase = LR_anim` から受け取り、reduced-motion 時は `phase=0`。

`LR_anim.register('tile-overmap', (phase) => { _animPhase = phase; drawTileOvermap(); })` を **tile モードがアクティブな間だけ**登録し、モード離脱で `unregister`。登録/解除は `applyWorldMapModeVisibility()`（85-world.js:1331 近辺）の tile 分岐に相乗り。

### 2.2 具体エフェクト（すべて seed + phase の決定論揺らぎ）

| 効果 | 対象 | 実装 |
|---|---|---|
| 水面シマー | 水タイル `s`/`c` | グリフ配列 `['~','≈','~']` の選択インデックスを `floor((phase/500 + hash(x,y,seed)) % 3)` で巡回。既存の `style.glyphs` をそのまま時間で回すだけ。 |
| hazard 脈動 | `TILE_OVERMAP_HAZARD_STYLE` の tint | tint の alpha を `base * (0.8 + 0.2*sin(phase/900))` で呼吸。radiation/toxic 等が「生きている」感。 |
| 現在地 `@` 明滅 | current pin | グリフ色の明度を sin で 0.7↔1.0。既に `@` は特別描画（86:685付近）なのでそこに乗せる。 |
| rumored マーカー点滅 | `fogVisibility:'rumored'` マーカー | `globalAlpha` を 0.4↔0.65 で脈動（既存 0.52 固定を可変化）。`drawMapOverlayMarkers` 内。 |
| （任意）火の粉 | `settlement_pressure: crisis` / hazard 中心 | seed 固定位置に2–3個、`phase` で上昇＋フェード。コスト高めなので最後。 |

**非目標:** ロードランナー的スクロール、天候パーティクルの全面降雪（重い）、tile データ自体の書き換え。

---

## 3. Track 2 — Diorama ライティング/奥行き

対象：`86c-settlement-diorama.js`。**既に AmbientLight(0.7)+DirectionalLight(0.75)+palette background はある**（`buildSettlementDioramaScene` 284行〜）。ここを「フラット」から「立体」に引き上げる。

### 3.1 追加/変更（read-only のまま）

1. **シャドウ有効化** — `renderer.shadowMap.enabled = true`（`PCFSoftShadowMap`）、`dirLight.castShadow=true`、ブロック mesh の `castShadow/receiveShadow`、ground plane の `receiveShadow`。影が付くだけで立体が締まる。
2. **背景フォグ** — `scene.fog = new THREE.Fog(palette.background, near, far)`。「箱庭が宙に浮く」感を消し、奥行きを出す。距離はスナップショットの bbox から算出。
3. **マテリアル質感差** — 現状 `MeshLambertMaterial` 一律。material→質感の対応を**クライアント側 closed map** に追加：metal=やや反射(`MeshStandardMaterial` low roughness)、wood=マット、water deck=反射plane。※ material union は既に閉じているのでマップ1枚追加で済む。
4. **ジャンル連動ライティングプロファイル** — `palette` に既に `ambient` があるので、そこへ **lighting プロファイル**（dirLight 色・角度・強度）を genre 別に足す。cyberpunk=青/ピンクのリム、horror=低い寒色フォグ濃いめ、oriental=暖色斜光。ホスト `resolveDioramaThemeFromOvermap`（worldView.ts:526）の戻りに lighting 1ブロック追加、または**クライアント側で genre→lighting の定数マップ**を持つ（payload 変更を避けたいならこちら推奨）。

### 3.2 アニメーションとの関係

diorama は現在「カメラ変更時のみ再レンダ」。**常時アニメは既定では入れない**（GPU/バッテリー）。入れるなら LR_anim に低fps（~15）で登録し、reduced-motion / 非表示で即停止。初手はライティング静的改善だけで十分見違える。

---

## 4. Track 3 — テーマのクローム/ポストエフェクト（統一感）

8ジャンル（cyberpunk/postapoc/zombie/scifi/steampunk/cosmic-horror/oriental/modern＋fantasy）を**タイル配色だけでなく UI 全体**へ広げる。

### 4.1 適用フック（新規の「seam」）

現状 genre は `overmapThemeKey`（worldView payload）にしかなく、CSS からは参照できない。**既存 `document.body.setAttribute('data-ui-theme', ...)`（10-game-state.js:800）と同じパターン**で、worldView 受信時に：

```js
document.body.setAttribute('data-genre', msg.overmapThemeKey || 'fantasy');
```

を1行足す（85-world.js の worldView ハンドラ）。これで CSS が `body[data-genre="cyberpunk"] .xxx { … }` で全チャンクを装飾できる。**payload 変更ゼロ**（既存フィールド再利用）。

### 4.2 効果（CSS + Canvas 1枚被せ）

| 効果 | 実装 |
|---|---|
| ポストエフェクト層 | `#world-overmap` / チャットに `::after` の被せ1枚。cyberpunk/scifi=CRT スキャンライン（repeating-linear-gradient + `mix-blend-mode: overlay`）、horror=フィルムグレイン＋ビネット（radial-gradient）、parchment/fantasy=紙テクスチャ。**pointer-events:none** でクリック透過。 |
| フレーム装飾 | map パネルとカードの枠を genre 別 border/box-shadow。scifi=HUDライン、cosmic-horror=滲む縁。 |
| チャット区切り | GMターン境界の区切りに genre 別飾り罫（既存の区切り要素へ `content` 差し替え）。 |
| アクセント変数 | genre 別に `--accent` 系 CSS 変数を上書き（88-observatory 等が既に `var(--accent)` 参照。波及効果あり）。 |

### 4.3 新規 CSS モジュール

`webview/styles/9x-genre-chrome.css` を1本追加、`build-webview.js` に登録。全て `body[data-genre]` スコープ。reduced-motion 時はスキャンライン等の**動くポストエフェクトのみ**停止（静的な枠・配色は残す）。

**非目標:** ジャンルごとに別レイアウト、フォント同梱（Web安全フォント/既存で）、チャット本文の可読性を下げるエフェクト（グレインは薄く）。

---

## 5. 横断事項

- **アクセシビリティ:** `prefers-reduced-motion` を LR_anim とポストエフェクト両方で尊重。動くもの全停止でも情報欠落なし（アニメは装飾のみ）。
- **パフォーマンス:** rAF は1本・非表示で停止・tile は低fps。弱いマシン向けに localStorage トグルで全 OFF。
- **i18n:** 新規は設定トグル文言のみ（1–2キー×4ロケール）。描画に文字追加なし。
- **テスト:** `test_webview_world_modules.js` に (1) `84-webview-anim.js` バンドル順、(2) `LR_anim` シンボル存在、(3) reduced-motion 時に tick 未登録、(4) `body[data-genre]` 適用、(5) diorama shadow/fog シンボルの静的アサーションを追加。描画そのものは静的検証＋目視。
- **決定論回帰:** 既存 `test_tile_overmap_core.js` はコア（データ生成）側なので影響なし。見た目のアニメはコア非依存。

---

## 6. 依存関係と実装順（Sonnet/Medium に渡す単位）

```
[土台] 84-webview-anim.js（LR_anim + reduced-motion + visibility 停止 + localStorage トグル）
   │  ← これが Track1 と Track2アニメ の前提
   ├─ Track 1: tile Atmosphere（LR_anim に乗せる）※土台必須
   ├─ Track 3: genre chrome（body[data-genre] + CSS）※土台に非依存・独立着手可
   └─ Track 2: diorama ライティング（静的改善は土台非依存 → アニメ化のみ土台依存）
```

**推奨順:**
1. **土台 `84-webview-anim.js`**（単体で「何も動かないが停止制御は効く」状態まで）
2. **Track 1 Atmosphere**（土台の最初の実利用者。ここで駆動系を実戦投入）
3. **Track 3 Genre chrome**（土台非依存なので並行/入替可。CSS中心で diff が読みやすい）
4. **Track 2 Diorama**（まずライティング静的改善のみ。アニメ化は最後、やるなら）

各トラックは相互依存が薄く、1つ実装→`npm test`→次、の順で入替・中断が効く。土台だけは先頭固定。

### 各トラックの完了条件（共通）
- `npm run compile` / `npm test`（既存183 + 追加）
- `check_i18n_keys.js` 0 missing
- reduced-motion で静止版が現状と一致（目視）
- CHANGELOG [Unreleased] / AI_SHARED_LOG へ短く記録

---

## 7. オープンな判断（実装前に決めたいこと）

1. **diorama 常時アニメを入れるか** — 初手は静的ライティングのみ推奨。要否は実機の見栄え次第。
2. **火の粉パーティクル（Track1最後）** — コスト対効果を見て落としても良い。
3. **genre lighting をホスト payload に足すか、クライアント定数か** — payload 不変を優先しクライアント定数マップ推奨。
